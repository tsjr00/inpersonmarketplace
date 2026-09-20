import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { tierLabels } from '@/lib/markets/booth-types'
import { getGroupCancelledDays } from '@/lib/markets/cancelled-days'
import { owedForGroup } from '@/lib/markets/settlement-math'
import { sundayOf } from '@/lib/markets/manager-week-strip'

/**
 * The manager's ACTION ITEMS — owner 2026-09-20 (booth_numbering_design.md
 * §3.9): "a distillation of action items for the manager to DO". Six kinds;
 * every one is something the manager can click and finish on this dashboard:
 *
 *   1. vendors pending approval              (manager-dashboard-stats)
 *   2. active vendors without a booth number (manager-dashboard-stats; only
 *      where the market does NOT charge for booths — F2a)
 *   3. sizes with no booth numbers yet · held/placeholder numbers without a
 *      size (this file)
 *   4. a size over capacity this week        (this file)
 *   5. Stripe needs more information         (this file — short-circuits on
 *      the synced columns; calls Stripe only for the in-between state, with
 *      a timeout; never blocks the dashboard)
 *   6. season settlements owed               (this file)
 *
 * Awareness-only items (next market day, unpaid bookings) are NOT here — they
 * live in the schedule strip. Service client; auth verified upstream.
 */

export interface ManagerActionSignals {
  /** Tiers whose booth numbers have not been set (N-7) — by size label. */
  unnumberedSizes: string[]
  /** Roster holds + placeholders carrying a number but no size (legacy). */
  untieredNumbers: number
  /** Sizes where placeholders + this week's active bookings exceed the count. */
  overCapacitySizes: string[]
  /** Stripe account is connected + details submitted but blocked on the manager. */
  stripeNeedsAction: boolean
  /** Paid season groups past the cap with no settlement recorded, on ended seasons. */
  settlementsOwed: number
}

export const EMPTY_ACTION_SIGNALS: ManagerActionSignals = {
  unnumberedSizes: [],
  untieredNumbers: 0,
  overCapacitySizes: [],
  stripeNeedsAction: false,
  settlementsOwed: 0,
}

interface TierRow {
  id: string
  size_label: string
  count: number
  label_prefix: string | null
  label_start: number | null
  label_end: number | null
  labels: string[] | null
}

/** Booth-inventory signals: unnumbered sizes, untiered numbers, over-capacity this week. */
export async function loadBoothActionSignals(
  service: SupabaseClient,
  marketId: string,
  marketTimezone: string | null,
): Promise<Pick<ManagerActionSignals, 'unnumberedSizes' | 'untieredNumbers' | 'overCapacitySizes'>> {
  const tz = marketTimezone || 'America/Chicago'
  const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`
  const week = sundayOf(today)

  const [tiersRes, placeholdersRes, rentalsRes, pinsRes] = await Promise.all([
    observed(service
      .from('market_booth_inventory')
      .select('id, size_label, count, label_prefix, label_start, label_end, labels')
      .eq('market_id', marketId), { table: 'market_booth_inventory' }),
    observed(service
      .from('market_booth_placeholders')
      .select('inventory_id')
      .eq('market_id', marketId), { table: 'market_booth_placeholders' }),
    observed(service
      .from('weekly_booth_rentals')
      .select('inventory_id')
      .eq('market_id', marketId)
      .eq('week_start_date', week)
      .in('status', ['pending_payment', 'paid']), { table: 'weekly_booth_rentals' }),
    observed(service
      .from('market_vendors')
      .select('id')
      .eq('market_id', marketId)
      .not('booth_number', 'is', null)
      .is('inventory_id', null), { table: 'market_vendors' }),
  ])

  const tiers = (tiersRes.data ?? []) as unknown as TierRow[]
  const unnumberedSizes = tiers.filter((t) => tierLabels(t).length === 0).map((t) => t.size_label)

  const taken = new Map<string, number>()
  let untieredPlaceholders = 0
  for (const p of placeholdersRes.data ?? []) {
    const inv = p.inventory_id as string | null
    if (!inv) { untieredPlaceholders++; continue }
    taken.set(inv, (taken.get(inv) ?? 0) + 1)
  }
  for (const r of rentalsRes.data ?? []) {
    const inv = r.inventory_id as string
    taken.set(inv, (taken.get(inv) ?? 0) + 1)
  }
  const overCapacitySizes = tiers.filter((t) => (taken.get(t.id) ?? 0) > t.count).map((t) => t.size_label)

  return {
    unnumberedSizes,
    untieredNumbers: (pinsRes.data ?? []).length + untieredPlaceholders,
    overCapacitySizes,
  }
}

/**
 * Stripe: only the IN-BETWEEN state needs a live call — details submitted but
 * charges/payouts not both enabled (the synced columns say so). Not connected
 * → the onboarding checklist owns it; fully active → nothing to do. The live
 * call is bounded by a timeout and any failure reads as "no action" — the
 * Stripe card itself still shows the truth.
 */
export async function loadStripeActionSignal(
  service: SupabaseClient,
  marketId: string,
  timeoutMs = 2500,
): Promise<boolean> {
  const { data: mk } = await observed(service
    .from('markets')
    .select('stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled')
    .eq('id', marketId)
    .maybeSingle(), { table: 'markets' })
  const accountId = (mk?.stripe_account_id as string | null) ?? null
  if (!accountId || !mk?.stripe_onboarding_complete) return false
  if (mk.stripe_charges_enabled && mk.stripe_payouts_enabled) return false

  try {
    const { getAccountStatus } = await import('@/lib/stripe/connect')
    const status = await Promise.race([
      getAccountStatus(accountId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])
    if (!status) return false
    const r = status.requirements
    // Same classification as MarketStripeConnectCard.classifyStatus.
    return !!r && (
      ((r.past_due?.length ?? 0) > 0) ||
      ((r.currently_due?.length ?? 0) > 0) ||
      ((r.errors?.length ?? 0) > 0) ||
      (!!r.disabled_reason && r.disabled_reason !== 'requirements.pending_verification')
    )
  } catch {
    return false
  }
}

/** Ended, unsettled seasons: paid groups past the refund cap with no settlement row. */
export async function loadSettlementsOwed(
  service: SupabaseClient,
  marketId: string,
  marketTimezone: string | null,
): Promise<number> {
  const tz = marketTimezone || 'America/Chicago'
  const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`

  const { data: seasons } = await observed(service
    .from('market_seasons')
    .select('id, refund_cap_days, days_per_week_snapshot')
    .eq('market_id', marketId)
    .lte('end_date', today)
    .neq('status', 'settled'), { table: 'market_seasons' })
  if (!seasons || seasons.length === 0) return 0

  const seasonIds = seasons.map((s) => s.id as string)
  const { data: groups } = await observed(service
    .from('booth_booking_groups')
    .select('id, season_id, week_count, total_manager_cents')
    .in('season_id', seasonIds)
    .eq('status', 'paid'), { table: 'booth_booking_groups' })
  if (!groups || groups.length === 0) return 0

  const { data: settled } = await observed(service
    .from('booth_credits')
    .select('related_group_id')
    .eq('source', 'season_settlement')
    .in('related_group_id', groups.map((g) => g.id as string)), { table: 'booth_credits' })
  const resolved = new Set((settled ?? []).map((r) => r.related_group_id as string))

  // Live active-day count is the fallback denominator (mig 194 snapshot preferred).
  let liveDaysPerWeek: number | null = null
  const daysFor = async (snapshot: number | null): Promise<number> => {
    if (typeof snapshot === 'number') return snapshot
    if (liveDaysPerWeek === null) {
      const { count } = await service
        .from('market_schedules')
        .select('id', { count: 'exact', head: true })
        .eq('market_id', marketId)
        .eq('active', true)
      liveDaysPerWeek = count ?? 0
    }
    return liveDaysPerWeek
  }

  const seasonById = new Map(seasons.map((s) => [s.id as string, s]))
  let owed = 0
  for (const g of groups) {
    if (resolved.has(g.id as string)) continue
    const season = seasonById.get(g.season_id as string)
    if (!season) continue
    const cd = await getGroupCancelledDays(service, g.id as string)
    const { owedDays } = owedForGroup(
      g.total_manager_cents as number,
      g.week_count as number,
      await daysFor((season.days_per_week_snapshot as number | null) ?? null),
      cd?.cancelledDays ?? 0,
      (season.refund_cap_days as number) ?? 0,
    )
    if (owedDays > 0) owed++
  }
  return owed
}

export async function loadManagerActionSignals(
  service: SupabaseClient,
  marketId: string,
  marketTimezone: string | null,
): Promise<ManagerActionSignals> {
  const [booth, stripeNeedsAction, settlementsOwed] = await Promise.all([
    loadBoothActionSignals(service, marketId, marketTimezone),
    loadStripeActionSignal(service, marketId),
    loadSettlementsOwed(service, marketId, marketTimezone),
  ])
  return { ...booth, stripeNeedsAction, settlementsOwed }
}
