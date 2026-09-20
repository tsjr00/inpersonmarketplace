import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'

/**
 * Server-only pre-flight checks for booth assignment mutations.
 *
 * Two concerns:
 *   1. booth_number uniqueness across market_vendors + market_booth_placeholders
 *      + weekly_booth_rentals (Issue 1 from Session 84 testing).
 *   2. Per-tier capacity — placeholders in a tier can't exceed
 *      market_booth_inventory.count (Issue 2). Pins are NOT capacity
 *      (owner 2026-09-19, BR-6: a pin is a soft hold — "put a pin in it" —
 *      the pinned vendor may never pay), so on-platform vendors are no longer
 *      counted here; the booking RPC (mig 256) counts placeholders + active
 *      rentals, and this helper mirrors the placeholder half.
 *
 * Mig 146 (replaced by mig 256) adds DB triggers as the canonical correctness
 * gate. These helpers are the friendly-error layer that runs BEFORE the
 * trigger fires, so the manager sees a clear UI message instead of a raw PG
 * exception (BOOTH_CONFLICT P0005). The trigger remains as the safety net if
 * any code path skips these helpers.
 *
 * Same-vendor rule (BR-11, OB-028): a vendor never conflicts with their own
 * pin or their own rentals. Pass `vendorProfileId` so a manager can pin a
 * vendor to the booth that vendor already rents (booth_model_review.md C7).
 */

export type BoothConflictSource =
  | 'on_platform_vendor'
  | 'off_platform_placeholder'
  | 'weekly_rental'

export interface BoothConflict {
  source: BoothConflictSource
  message: string
}

interface CheckBoothNumberAvailableOpts {
  marketId: string
  boothNumber: string
  /** Exclude self when editing — which table and id. */
  excludeSelf?: {
    kind: 'market_vendors' | 'market_booth_placeholders' | 'weekly_booth_rentals'
    id: string
  }
  /** The vendor the row belongs to. Their own pin and their own rentals are
   *  never a conflict (BR-11) — a pinned vendor books their booth, a manager
   *  pins a vendor to the booth they already rent. Omit for placeholders. */
  vendorProfileId?: string
}

/**
 * Returns a BoothConflict descriptor if booth_number is taken by any
 * source at this market; null otherwise. Mirrors the DB trigger's
 * logic so we surface the same conflicts before the INSERT/UPDATE.
 */
export async function checkBoothNumberAvailable(
  serviceClient: SupabaseClient,
  opts: CheckBoothNumberAvailableOpts
): Promise<BoothConflict | null> {
  const { marketId, boothNumber, excludeSelf, vendorProfileId } = opts

  // (a) on-platform vendor conflict — never the same vendor's own pin
  {
    let q = serviceClient
      .from('market_vendors')
      .select('id', { head: true, count: 'exact' })
      .eq('market_id', marketId)
      .eq('booth_number', boothNumber)
    if (excludeSelf?.kind === 'market_vendors') {
      q = q.neq('id', excludeSelf.id)
    }
    if (vendorProfileId) {
      q = q.neq('vendor_profile_id', vendorProfileId)
    }
    const { count } = await q
    if ((count ?? 0) > 0) {
      return {
        source: 'on_platform_vendor',
        message: `Booth number ${boothNumber} is already assigned to an on-platform vendor at this market.`,
      }
    }
  }

  // (b) placeholder conflict
  {
    let q = serviceClient
      .from('market_booth_placeholders')
      .select('id', { head: true, count: 'exact' })
      .eq('market_id', marketId)
      .eq('booth_number', boothNumber)
    if (excludeSelf?.kind === 'market_booth_placeholders') {
      q = q.neq('id', excludeSelf.id)
    }
    const { count } = await q
    if ((count ?? 0) > 0) {
      return {
        source: 'off_platform_placeholder',
        message: `Booth number ${boothNumber} is already assigned to an off-platform vendor placeholder at this market.`,
      }
    }
  }

  // (c) active current/upcoming weekly rental conflict — only relevant
  // when the caller is NOT inserting into weekly_booth_rentals itself
  // (the partial UNIQUE index handles within-rentals; the trigger
  // covers any cross-table case we miss here). "Current" = the week in
  // progress counts (week_start_date + 6 >= today), matching the mig 256
  // trigger; the date is UTC because the trigger compares CURRENT_DATE on
  // the DB server, not the market's clock. Never the same vendor's rentals.
  if (excludeSelf?.kind !== 'weekly_booth_rentals') {
    const weekAgo = new Date()
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 6)
    const isoWeekAgo = weekAgo.toISOString().slice(0, 10)

    let q = serviceClient
      .from('weekly_booth_rentals')
      .select('id', { head: true, count: 'exact' })
      .eq('market_id', marketId)
      .eq('booth_number', boothNumber)
      .in('status', ['pending_payment', 'paid'])
      .gte('week_start_date', isoWeekAgo)
    if (vendorProfileId) {
      q = q.neq('vendor_profile_id', vendorProfileId)
    }
    const { count } = await q

    if ((count ?? 0) > 0) {
      return {
        source: 'weekly_rental',
        message: `Booth number ${boothNumber} has an active paid booking for a current/upcoming week at this market.`,
      }
    }
  }

  return null
}

/**
 * Mig 258 (N-1/N-3): a booth number belongs to exactly one size at the market.
 * Every writer of a number (pin, approval, placeholder, weekly override) runs
 * this before writing: the label must be one of the market's numbers, and it
 * must be in the size the caller chose (or decides the size when the caller
 * did not pick one). Source of truth is the DB function booth_tier_for_label.
 */
export async function checkLabelBelongsToTier(
  serviceClient: SupabaseClient,
  opts: { marketId: string; label: string; inventoryId?: string | null }
): Promise<{ ok: true; inventoryId: string } | { ok: false; message: string }> {
  const { data: tierId } = await observed(serviceClient
    .rpc('booth_tier_for_label', { p_market_id: opts.marketId, p_label: opts.label }), { table: 'market_booth_inventory' })
  const resolved = (tierId as string | null) ?? null
  if (!resolved) {
    return { ok: false, message: `#${opts.label} isn't one of this market's booth numbers. Pick a number from the list (set each size's numbers in Booth inventory).` }
  }
  if (opts.inventoryId && opts.inventoryId !== resolved) {
    const { data: tier } = await observed(serviceClient
      .from('market_booth_inventory')
      .select('size_label')
      .eq('id', resolved)
      .maybeSingle(), { table: 'market_booth_inventory' })
    const size = (tier?.size_label as string | undefined) || 'another size'
    return { ok: false, message: `#${opts.label} is a ${size} booth. Pick a number from the size you chose, or change the size.` }
  }
  return { ok: true, inventoryId: resolved }
}

interface CheckTierCapacityOpts {
  marketId: string
  inventoryId: string
  /** When editing an existing placeholder in a tier, exclude it from the
   *  count so a same-tier edit doesn't false-trigger over-capacity.
   *  `market_vendors` is accepted for callers' backward compatibility but
   *  has no effect — pins are not counted (BR-6). */
  excludeSelf?: {
    kind: 'market_vendors' | 'market_booth_placeholders'
    id: string
  }
}

export interface CapacityCheckResult {
  ok: boolean
  /** Tier definition snapshot — exposed so callers can produce richer
   *  error messages (e.g., "Small tier already has 5 of 5 booths"). */
  tier?: {
    id: string
    size_label: string
    count: number
  }
  /** Current count of placeholders in this tier (excluding the self row if
   *  `excludeSelf` names a placeholder). */
  currentCount: number
  message?: string
}

/**
 * Counts the tier's PERMANENT occupants — off-platform placeholders — and
 * compares against tier.count. If the caller is going to ADD a placeholder
 * (or move one INTO this tier), `currentCount` is the count BEFORE the add
 * — i.e., reject if `currentCount + 1 > tier.count`. The helper does this
 * comparison and sets `ok` accordingly.
 *
 * On-platform vendors' pins are NOT counted (owner 2026-09-19, BR-6): a pin
 * is a soft hold that may never be paid for, so a manager may pin more
 * vendors than a tier has booths; only a paid week occupies one. Weekly
 * rentals are NOT counted either — they are week-specific and the booking
 * RPC (mig 256) enforces placeholders + active rentals <= tier.count per
 * week. Placeholders are the only occupant this helper guards, because
 * every placeholder removes a booth from every week's capacity.
 */
export async function checkTierCapacity(
  serviceClient: SupabaseClient,
  opts: CheckTierCapacityOpts
): Promise<CapacityCheckResult> {
  const { marketId, inventoryId, excludeSelf } = opts

  const { data: tierRow } = await observed(serviceClient
    .from('market_booth_inventory')
    .select('id, size_label, count')
    .eq('id', inventoryId)
    .eq('market_id', marketId)
    .maybeSingle(), { table: 'market_booth_inventory' })

  if (!tierRow) {
    return {
      ok: false,
      currentCount: 0,
      message: 'Selected booth size tier does not belong to this market.',
    }
  }

  const tier = {
    id: tierRow.id as string,
    size_label: tierRow.size_label as string,
    count: tierRow.count as number,
  }

  // Count placeholders in this tier (the only permanent occupant — BR-6).
  let phQuery = serviceClient
    .from('market_booth_placeholders')
    .select('id', { head: true, count: 'exact' })
    .eq('market_id', marketId)
    .eq('inventory_id', inventoryId)
  if (excludeSelf?.kind === 'market_booth_placeholders') {
    phQuery = phQuery.neq('id', excludeSelf.id)
  }

  const phResult = await phQuery
  const currentCount = phResult.count ?? 0

  const wouldBe = currentCount + 1
  if (wouldBe > tier.count) {
    return {
      ok: false,
      tier,
      currentCount,
      message:
        `The ${tier.size_label} tier already has ${currentCount} of ${tier.count} booths taken by off-platform placeholders. ` +
        `Increase the tier's count first, or pick a different tier.`,
    }
  }

  return { ok: true, tier, currentCount }
}
