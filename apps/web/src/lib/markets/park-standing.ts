import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'

/**
 * FT park-manager P4b — standing (recurring) reservation occurrence engine.
 *
 * A standing hold (park_standing_reservations, mig 173) is an anchor truck's
 * claim on ONE spot for ONE day-of-week. This module:
 *   - GENERATES the next occurrence as a pending_payment park_spot_bookings row
 *     (the placeholder occupies the spot+date slot via the partial-unique index,
 *     so no one else can take the truck's recurring spot before the cutoff);
 *   - RELEASES a generated occurrence the truck didn't pay for by the cutoff —
 *     flips pending_payment -> 'expired' (frees the slot) + it becomes a strike;
 *   - COMPUTES strikes on read (no strike table) and AUTO-SUSPENDS at the limit.
 *
 * Sub-commit 1 counts ONLY missed-prepay strikes ('expired' occurrences). The
 * no-show source (paid occurrence with no same-day check-in) lands in P4b-2.
 *
 * Cutoff rule (user-confirmed 2026-07-01): a truck must pay at least
 * PARK_STANDING_PREPAY_CUTOFF_DAYS whole days before the occurrence date.
 */

export const PARK_STANDING_PREPAY_CUTOFF_DAYS = 2
export const PARK_STANDING_STRIKE_LIMIT = 3
export const PARK_STANDING_STRIKE_WINDOW_DAYS = 32
/** Only materialize the next occurrence once it's within this many days — keeps
 *  the pending placeholder (and its pay window) close to the actual date. */
export const PARK_STANDING_GENERATION_HORIZON_DAYS = 7

// ── Pure date helpers (UTC, 'YYYY-MM-DD' strings) ───────────────────────────

/** Add n days to a 'YYYY-MM-DD' date, returning 'YYYY-MM-DD' (UTC math). */
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

/** First date on or after `fromISO` whose day-of-week (0=Sun..6=Sat) === dow. */
export function nextOccurrenceOnOrAfter(dow: number, fromISO: string): string {
  const [y, m, d] = fromISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const delta = (dow - dt.getUTCDay() + 7) % 7
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

/** Last date (inclusive) the truck may pay for an occurrence on `bookingDate`. */
export function prepayCutoffISO(bookingDateISO: string): string {
  return addDaysISO(bookingDateISO, -PARK_STANDING_PREPAY_CUTOFF_DAYS)
}

/** True once `todayISO` is past the pay-by cutoff for an occurrence on that date. */
export function isPastPrepayCutoff(bookingDateISO: string, todayISO: string): boolean {
  return todayISO > prepayCutoffISO(bookingDateISO)
}

/**
 * Count "live" strikes: strike events (by their date) within the rolling
 * PARK_STANDING_STRIKE_WINDOW_DAYS window ending at todayISO, and — if the
 * manager reset the hold — only events strictly after the reset date.
 */
export function countLiveStrikes(
  eventDatesISO: string[],
  todayISO: string,
  resetAtISO: string | null,
): number {
  const windowStart = addDaysISO(todayISO, -PARK_STANDING_STRIKE_WINDOW_DAYS)
  const resetDate = resetAtISO ? resetAtISO.slice(0, 10) : null
  return eventDatesISO.filter((ev) => {
    if (ev <= windowStart) return false
    if (resetDate && ev <= resetDate) return false
    return true
  }).length
}

// ── DB: strike counts (shared by the manager route + the cron sweep) ─────────

export interface StandingReservationLite {
  id: string
  strikes_reset_at: string | null
}

/**
 * Live strike count per reservation id. Reads 'expired' occurrences
 * (missed-prepay) attributed via park_spot_bookings.standing_reservation_id.
 * (P4b-2 adds paid-but-no-check-in no-shows here.)
 */
export async function getStrikeCountsForReservations(
  serviceClient: SupabaseClient,
  reservations: StandingReservationLite[],
  todayISO: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  const ids = reservations.map((r) => r.id)
  if (ids.length === 0) return counts

  const { data } = await serviceClient
    .from('park_spot_bookings')
    .select('standing_reservation_id, booking_date, status')
    .in('standing_reservation_id', ids)
    .eq('status', 'expired')

  const byRes = new Map<string, string[]>()
  for (const row of data ?? []) {
    const rid = row.standing_reservation_id as string
    const arr = byRes.get(rid) ?? []
    arr.push(row.booking_date as string)
    byRes.set(rid, arr)
  }
  for (const r of reservations) {
    counts.set(r.id, countLiveStrikes(byRes.get(r.id) ?? [], todayISO, r.strikes_reset_at))
  }
  return counts
}

// ── DB: daily sweep (cron Phase 21) ─────────────────────────────────────────

export interface StandingSweepResult {
  generated: number
  expired: number
  suspended: number
}

/**
 * Daily standing-reservation sweep:
 *   1. Expire generated occurrences left unpaid past the prepay cutoff (release
 *      the slot; each becomes a missed-prepay strike).
 *   2. Generate the next occurrence within the horizon for each active hold
 *      (skip cancelled/closed dates + slots already taken), notify the truck.
 *   3. Auto-suspend any active hold at/over the strike limit (frees the DOW slot
 *      via the partial-unique index) and notify the truck.
 *
 * `now` is injected so the caller controls "today" (UTC, matching the cron's
 * other phases).
 */
export async function runStandingOccurrenceSweep(
  serviceClient: SupabaseClient,
  now: Date,
): Promise<StandingSweepResult> {
  const todayISO = now.toISOString().slice(0, 10)
  const horizonISO = addDaysISO(todayISO, PARK_STANDING_GENERATION_HORIZON_DAYS)
  const result: StandingSweepResult = { generated: 0, expired: 0, suspended: 0 }

  // ── 1. Release past-cutoff unpaid occurrences ──
  const { data: pending } = await serviceClient
    .from('park_spot_bookings')
    .select('id, booking_date')
    .not('standing_reservation_id', 'is', null)
    .eq('status', 'pending_payment')
  for (const row of pending ?? []) {
    if (!isPastPrepayCutoff(row.booking_date as string, todayISO)) continue
    const { data: updated } = await serviceClient
      .from('park_spot_bookings')
      .update({ status: 'expired' })
      .eq('id', row.id)
      .eq('status', 'pending_payment') // guard: don't clobber a race-paid row
      .select('id')
      .maybeSingle()
    if (updated) result.expired++
  }

  // ── 2. Generate the next occurrence for each active hold ──
  const { data: active } = await serviceClient
    .from('park_standing_reservations')
    .select(`
      id, market_id, vendor_profile_id, spot_id, day_of_week, strikes_reset_at,
      park_spots:spot_id ( label, base_price_cents, active ),
      markets:market_id ( name, vertical_id ),
      vendor_profiles:vendor_profile_id ( user_id )
    `)
    .eq('status', 'active')

  for (const res of active ?? []) {
    const spot = res.park_spots as unknown as { label: string; base_price_cents: number; active: boolean } | null
    if (!spot || spot.active !== true) continue

    const occ = nextOccurrenceOnOrAfter(res.day_of_week as number, todayISO)
    if (occ > horizonISO) continue // too far out — wait for a later run

    // Skip if the park closed that DOW, or the date was cancelled.
    const [schedRes, ovrRes] = await Promise.all([
      serviceClient.from('market_schedules').select('id')
        .eq('market_id', res.market_id).eq('day_of_week', res.day_of_week).eq('active', true).limit(1),
      serviceClient.from('market_date_overrides').select('id')
        .eq('market_id', res.market_id).eq('override_date', occ).eq('status', 'cancelled').limit(1),
    ])
    if ((schedRes.data ?? []).length === 0) continue
    if ((ovrRes.data ?? []).length > 0) continue

    // Skip if any booking already exists for this hold on this date (avoids
    // re-generating a paid/pending/expired occurrence and re-striking), or the
    // spot+date slot is already occupied by another active booking.
    const [mine, slot] = await Promise.all([
      serviceClient.from('park_spot_bookings').select('id')
        .eq('standing_reservation_id', res.id).eq('booking_date', occ).limit(1),
      serviceClient.from('park_spot_bookings').select('id')
        .eq('spot_id', res.spot_id).eq('booking_date', occ).in('status', ['pending_payment', 'paid']).limit(1),
    ])
    if ((mine.data ?? []).length > 0) continue
    if ((slot.data ?? []).length > 0) continue

    const { data: inserted, error: insErr } = await serviceClient
      .from('park_spot_bookings')
      .insert({
        market_id: res.market_id,
        vendor_profile_id: res.vendor_profile_id,
        spot_id: res.spot_id,
        booking_date: occ,
        price_cents: spot.base_price_cents,
        status: 'pending_payment',
        standing_reservation_id: res.id,
      })
      .select('id')
      .maybeSingle()
    if (insErr || !inserted) continue // unique_violation = slot taken meanwhile; skip
    result.generated++

    const market = res.markets as unknown as { name: string; vertical_id: string } | null
    const vp = res.vendor_profiles as unknown as { user_id: string } | null
    if (vp?.user_id) {
      await sendNotification(vp.user_id, 'park_standing_occurrence_ready', {
        marketName: market?.name ?? 'your park',
        marketId: res.market_id as string,
        spotLabel: spot.label,
        marketDate: occ,
        payByDate: prepayCutoffISO(occ),
      }, { vertical: market?.vertical_id ?? 'food_trucks' })
    }
  }

  // ── 3. Auto-suspend active holds at/over the strike limit ──
  const activeLite: StandingReservationLite[] = (active ?? []).map((r) => ({
    id: r.id as string,
    strikes_reset_at: (r.strikes_reset_at as string | null) ?? null,
  }))
  const strikeCounts = await getStrikeCountsForReservations(serviceClient, activeLite, todayISO)
  for (const r of active ?? []) {
    if ((strikeCounts.get(r.id as string) ?? 0) < PARK_STANDING_STRIKE_LIMIT) continue
    const { data: suspended } = await serviceClient
      .from('park_standing_reservations')
      .update({ status: 'suspended' })
      .eq('id', r.id)
      .eq('status', 'active') // guard against a concurrent manager action
      .select('id')
      .maybeSingle()
    if (!suspended) continue
    result.suspended++
    const market = r.markets as unknown as { name: string; vertical_id: string } | null
    const vp = r.vendor_profiles as unknown as { user_id: string } | null
    const spot = r.park_spots as unknown as { label: string } | null
    if (vp?.user_id) {
      await sendNotification(vp.user_id, 'park_standing_suspended', {
        marketName: market?.name ?? 'your park',
        marketId: r.market_id as string,
        ...(spot?.label ? { spotLabel: spot.label } : {}),
      }, { vertical: market?.vertical_id ?? 'food_trucks' })
    }
  }

  return result
}
