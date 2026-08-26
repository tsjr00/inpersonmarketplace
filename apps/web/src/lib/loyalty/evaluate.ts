/**
 * Loyalty Layer 1 — the evaluator.
 *
 * Loads a buyer's FULFILLED orders for one vertical, computes every badge the
 * history has earned (segments.ts, pure), persists only the rows that are
 * missing, and sends the two free notifications:
 *   - badge_earned      → the buyer (push + in_app)
 *   - customer_milestone → the vendor, when a vendor-scoped badge (Regular /
 *                          Local Legend) is newly earned (in_app only)
 *
 * NEVER THROWS. Called lazily from the Favorites page (self-healing + the
 * backfill for buyers who already have history) and — pending per-file
 * approval — from the fulfill route via after(). It must never be able to
 * delay or fail a payout, so every failure path swallows and returns what it
 * has. Tolerant of mig 236 not being applied yet: a missing table means
 * "nothing persisted, nothing notified" (the beneficiaries.ts pattern), so
 * deploy order does not matter.
 *
 * Service client only — order_items / orders / vendor_profiles / user_profiles
 * are RLS-scoped to their owners and the evaluator reads across them.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendNotification } from '@/lib/notifications'
import { BADGE_CATALOG, SEGMENT_LABELS, getLoyaltyThresholds, type BadgeKey } from './config'
import {
  badgeIdentity,
  computeEarnedBadges,
  computeProgress,
  dedupeOrders,
  toDay,
  type BadgeProgress,
  type EarnedBadge,
  type FulfilledOrder,
} from './segments'

export interface AchievementRow {
  id: string
  badge_key: BadgeKey
  vendor_profile_id: string | null
  earned_at: string
  context: Record<string, unknown> | null
}

export interface EvaluationResult {
  /** Every persisted badge for this buyer + vertical (after this evaluation). */
  earned: AchievementRow[]
  /** The subset that was inserted by THIS call (notifications went out for these). */
  newlyEarned: EarnedBadge[]
  /** Toward the badges not yet earned. */
  progress: BadgeProgress[]
  /** The de-duplicated fulfilled orders the evaluation was computed from. */
  orders: FulfilledOrder[]
  /** False when mig 236 is not applied (nothing persisted, nothing notified). */
  persisted: boolean
}

const EMPTY: EvaluationResult = { earned: [], newlyEarned: [], progress: [], orders: [], persisted: false }

/** Buyer's fulfilled orders in one vertical, one entry per order. */
export async function loadFulfilledOrders(
  service: SupabaseClient,
  userId: string,
  vertical: string
): Promise<FulfilledOrder[]> {
  const { data, error } = await service
    .from('order_items')
    .select('order_id, vendor_profile_id, market_id, pickup_date, pickup_confirmed_at, updated_at, order:orders!inner(buyer_user_id, vertical_id)')
    .eq('status', 'fulfilled')
    .eq('order.buyer_user_id', userId)
    .eq('order.vertical_id', vertical)
  if (error || !data) return []
  return dedupeOrders(
    (data as Array<{
      order_id: string
      vendor_profile_id: string
      market_id: string | null
      pickup_date: string | null
      pickup_confirmed_at: string | null
      updated_at: string | null
    }>).map((r) => ({
      order_id: r.order_id,
      vendor_profile_id: r.vendor_profile_id,
      market_id: r.market_id,
      day: toDay(r.pickup_date) ?? toDay(r.pickup_confirmed_at) ?? toDay(r.updated_at),
    }))
  )
}

/**
 * Schedule an evaluation to run AFTER the current response is sent. For route
 * handlers on the money path (fulfill): the route must not be able to be
 * affected by anything here. `after()` throws SYNCHRONOUSLY when there is no
 * request scope (unit tests calling a handler directly; non-request callers),
 * which the 2026-08-25 money-authorization run proved would abort a fulfill
 * between the status write and the transfer — so the throw is swallowed here,
 * not left to the caller. Missing an evaluation is harmless: the Favorites
 * page evaluates lazily on load.
 */
export function scheduleBuyerAchievementEvaluation(userId: string, vertical: string): void {
  try {
    after(() => evaluateBuyerAchievements(createServiceClient(), userId, vertical))
  } catch {
    // No request scope — nothing to do; lazy evaluation covers it.
  }
}

/**
 * Evaluate + persist + notify. Never throws.
 */
export async function evaluateBuyerAchievements(
  service: SupabaseClient,
  userId: string,
  vertical: string
): Promise<EvaluationResult> {
  try {
    const thresholds = getLoyaltyThresholds(vertical)
    const orders = await loadFulfilledOrders(service, userId, vertical)

    const { data: existingRows, error: readErr } = await service
      .from('buyer_achievements')
      .select('id, badge_key, vendor_profile_id, earned_at, context')
      .eq('user_id', userId)
      .eq('vertical_id', vertical)
    if (readErr) {
      // Pre-migration (42P01 undefined_table) or transient — compute progress
      // for display but persist/notify nothing.
      const progress = computeProgress(orders, thresholds, new Set())
      return { ...EMPTY, orders, progress }
    }

    const existing = (existingRows ?? []) as AchievementRow[]
    const have = new Set(existing.map((r) => badgeIdentity(r.badge_key, r.vendor_profile_id)))
    const computed = computeEarnedBadges(orders, thresholds)
    const missing = computed.filter((b) => !have.has(badgeIdentity(b.key, b.vendorProfileId)))

    const newlyEarned: EarnedBadge[] = []
    for (const badge of missing) {
      const { data: inserted, error: insErr } = await service
        .from('buyer_achievements')
        .insert({
          user_id: userId,
          vertical_id: vertical,
          badge_key: badge.key,
          vendor_profile_id: badge.vendorProfileId,
          context: badge.context,
          notified_at: new Date().toISOString(),
        })
        .select('id, badge_key, vendor_profile_id, earned_at, context')
        .maybeSingle()
      // 23505 = a concurrent evaluation won the race for this exact badge —
      // not newly earned by us, do not notify twice.
      if (insErr || !inserted) continue
      existing.push(inserted as AchievementRow)
      newlyEarned.push(badge)
    }

    if (newlyEarned.length > 0) {
      await notifyNewBadges(service, userId, vertical, newlyEarned, orders)
    }

    const earnedKeys = new Set(existing.map((r) => badgeIdentity(r.badge_key, r.vendor_profile_id)))
    const progress = computeProgress(orders, thresholds, earnedKeys)
    return { earned: existing, newlyEarned, progress, orders, persisted: true }
  } catch {
    return EMPTY
  }
}

/**
 * Buyer gets one push/in_app per new badge. For vendor-scoped badges the
 * vendor ALSO gets a free in_app nudge naming the customer — the owner's
 * "know who to appreciate, call by name" ask. Best-effort; sendNotification
 * never throws and every await here is inside the evaluator's try/catch.
 */
async function notifyNewBadges(
  service: SupabaseClient,
  userId: string,
  vertical: string,
  badges: EarnedBadge[],
  orders: FulfilledOrder[]
): Promise<void> {
  const thresholds = getLoyaltyThresholds(vertical)

  const vendorIds = [...new Set(badges.map((b) => b.vendorProfileId).filter((v): v is string => !!v))]
  const vendorById = new Map<string, { user_id: string | null; name: string }>()
  if (vendorIds.length > 0) {
    const { data: vendors } = await service
      .from('vendor_profiles')
      .select('id, user_id, profile_data')
      .in('id', vendorIds)
    for (const v of (vendors ?? []) as Array<{ id: string; user_id: string | null; profile_data: Record<string, unknown> | null }>) {
      const pd = v.profile_data ?? {}
      const name = (pd.business_name as string) || (pd.farm_name as string) || 'the vendor'
      vendorById.set(v.id, { user_id: v.user_id, name })
    }
  }

  let buyerName = 'A customer'
  if (vendorIds.length > 0) {
    const { data: profile } = await service
      .from('user_profiles')
      .select('display_name')
      .eq('user_id', userId)
      .maybeSingle()
    buyerName = (profile as { display_name?: string | null } | null)?.display_name || buyerName
  }

  for (const badge of badges) {
    const def = BADGE_CATALOG[badge.key]
    const vendor = badge.vendorProfileId ? vendorById.get(badge.vendorProfileId) : undefined

    await sendNotification(
      userId,
      'badge_earned',
      {
        dedupRef: `badge:${vertical}:${badgeIdentity(badge.key, badge.vendorProfileId)}`,
        badgeEmoji: def.emoji,
        badgeName: def.name(vertical),
        badgeDescription: def.description(vertical, thresholds),
        ...(vendor ? { vendorName: vendor.name } : {}),
      },
      { vertical }
    )

    // Vendor nudge only for the vendor-scoped badges — and only if the vendor
    // profile is linked to a login (organizer-created placeholders are not).
    if (vendor?.user_id && (badge.key === 'regular' || badge.key === 'local_legend')) {
      const orderCount = orders.filter((o) => o.vendorProfileId === badge.vendorProfileId).length
      await sendNotification(
        vendor.user_id,
        'customer_milestone',
        {
          dedupRef: `milestone:${vertical}:${badge.vendorProfileId}:${userId}:${badge.key}`,
          buyerName,
          segmentLabel: badge.key === 'local_legend' ? SEGMENT_LABELS.loyal : SEGMENT_LABELS.regular,
          orderCount,
        },
        { vertical }
      )
    }
  }
}
