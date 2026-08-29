import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'
import { nowInTimezoneAsLocalIso } from '@/lib/surveys/cron-helpers'
import { stripe } from '@/lib/stripe/config'
import { TracedError, logError, observed } from '@/lib/errors'

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
  market_id: string
  vendor_profile_id: string
  timezone: string | null      // market timezone — gates the no-show "day over" test
}

/**
 * A paid standing occurrence becomes a no-show strike once its operating day is
 * fully over (market-local) and no check-in exists for it. Pure — unit-testable.
 * A manager "mark present" writes a market_day_checkins row, so hasCheckin=true
 * cancels the strike (decision #4: day-over + no-checkin + not-manager-confirmed).
 */
export function isNoShowStrike(
  bookingDateISO: string,
  marketLocalTodayISO: string,
  hasCheckin: boolean,
): boolean {
  if (hasCheckin) return false
  return bookingDateISO < marketLocalTodayISO
}

/**
 * Live strike count per reservation id. Two sources (design P4):
 *   - missed-prepay: an 'expired' occurrence (attributed via standing_reservation_id);
 *   - no-show: a 'paid' occurrence whose operating day is fully over (market-local)
 *     with NO market_day_checkins row for (market, vendor, booking_date).
 * Both event dates feed countLiveStrikes (rolling 32d, reset-aware). Shared by the
 * manager display + the cron auto-suspend, so both see no-shows automatically.
 */
export async function getStrikeCountsForReservations(
  serviceClient: SupabaseClient,
  reservations: StandingReservationLite[],
  todayISO: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  const ids = reservations.map((r) => r.id)
  if (ids.length === 0) return counts

  // Source 1 — missed-prepay ('expired') occurrences.
  const { data: expiredRows } = await observed(serviceClient
    .from('park_spot_bookings')
    .select('standing_reservation_id, booking_date')
    .in('standing_reservation_id', ids)
    .eq('status', 'expired'), { table: 'park_spot_bookings' })

  // Source 2 — paid occurrences (no-show candidates).
  // PRK-9: a manager-barred occurrence (truck ordered NOT to attend, no refund)
  // must not also strike the truck for obeying — exclude barred rows.
  const { data: paidRows } = await observed(serviceClient
    .from('park_spot_bookings')
    .select('standing_reservation_id, booking_date, market_id, vendor_profile_id')
    .in('standing_reservation_id', ids)
    .eq('status', 'paid')
    .is('manager_barred_at', null), { table: 'park_spot_bookings' })

  // Keep only paid occurrences whose day is fully over in the market's local
  // time — those are the ones a missing check-in can strike. Memoize per tz.
  const resById = new Map(reservations.map((r) => [r.id, r]))
  const localTodayByTz = new Map<string, string>()
  const localTodayFor = (tz: string | null): string => {
    const key = tz || 'America/Chicago'
    let v = localTodayByTz.get(key)
    if (v === undefined) {
      v = nowInTimezoneAsLocalIso(key).slice(0, 10)
      localTodayByTz.set(key, v)
    }
    return v
  }

  const pastPaid: Array<{ rid: string; market_id: string; vendor_profile_id: string; booking_date: string }> = []
  for (const row of paidRows ?? []) {
    const rid = row.standing_reservation_id as string
    const res = resById.get(rid)
    if (!res) continue
    if ((row.booking_date as string) < localTodayFor(res.timezone)) {
      pastPaid.push({
        rid,
        market_id: row.market_id as string,
        vendor_profile_id: row.vendor_profile_id as string,
        booking_date: row.booking_date as string,
      })
    }
  }

  // Batch check-in lookup for the past-paid candidates → set of "present" keys.
  const presentKeys = new Set<string>()
  if (pastPaid.length > 0) {
    const { data: checkins } = await observed(serviceClient
      .from('market_day_checkins')
      .select('market_id, vendor_profile_id, market_date')
      .in('market_id', Array.from(new Set(pastPaid.map((p) => p.market_id))))
      .in('vendor_profile_id', Array.from(new Set(pastPaid.map((p) => p.vendor_profile_id))))
      .in('market_date', Array.from(new Set(pastPaid.map((p) => p.booking_date)))), { table: 'market_day_checkins' })
    for (const c of checkins ?? []) {
      presentKeys.add(`${c.market_id}|${c.vendor_profile_id}|${c.market_date}`)
    }
  }

  // Assemble strike event-dates per reservation (expired + un-attended no-shows).
  const byRes = new Map<string, string[]>()
  const push = (rid: string, date: string) => {
    const arr = byRes.get(rid) ?? []
    arr.push(date)
    byRes.set(rid, arr)
  }
  for (const row of expiredRows ?? []) {
    push(row.standing_reservation_id as string, row.booking_date as string)
  }
  for (const p of pastPaid) {
    if (!presentKeys.has(`${p.market_id}|${p.vendor_profile_id}|${p.booking_date}`)) {
      push(p.rid, p.booking_date)
    }
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

  // ── 1. Release past-cutoff unpaid occurrences + abandoned one-off bookings ──
  // PRK-2: one-off (non-standing) pending bookings previously had NO expiry path
  // at all — an abandoned checkout held the spot+date forever via the
  // partial-unique index. TTL: 24h after creation (Stripe session max age), or
  // a booking whose date has already passed.
  const { data: pending } = await observed(serviceClient
    .from('park_spot_bookings')
    .select('id, booking_date, standing_reservation_id, stripe_checkout_session_id, created_at')
    .eq('status', 'pending_payment'), { table: 'park_spot_bookings' })
  const oneOffTtlCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  for (const row of pending ?? []) {
    const isStanding = !!row.standing_reservation_id
    const shouldExpire = isStanding
      ? isPastPrepayCutoff(row.booking_date as string, todayISO)
      : ((row.created_at as string) < oneOffTtlCutoff || (row.booking_date as string) < todayISO)
    if (!shouldExpire) continue

    // PRK-1 (CHK-1/CRN-2 pattern): expire the stored Stripe session BEFORE
    // releasing the slot, so a stale pay tab can't charge the truck for a
    // released occurrence. If expire throws, the session may already be
    // complete (race-paid) — skip the flip and log; the webhook lands it.
    if (row.stripe_checkout_session_id) {
      try {
        await stripe.checkout.sessions.expire(row.stripe_checkout_session_id as string)
      } catch (expireErr) {
        await logError(new TracedError('ERR_CHECKOUT_005', `[park sweep] session expire failed for booking ${row.id} (session ${row.stripe_checkout_session_id}): ${expireErr instanceof Error ? expireErr.message : String(expireErr)}`, {
          route: '/api/cron/expire-orders', method: 'GET',
        }))
        continue // don't release a possibly-paid slot
      }
    }

    const { data: updated } = await serviceClient
      .from('park_spot_bookings')
      .update({ status: 'expired' })
      .eq('id', row.id)
      .eq('status', 'pending_payment') // guard: don't clobber a race-paid row
      .select('id')
      .maybeSingle()
    if (updated) {
      result.expired++

      // G3 follow-up (mig 201, 2026-07-18): a pending booking can carry a
      // redeemed booth credit (applied at checkout create). Releasing the
      // slot must release the credit too, or the vendor's −redeemed row
      // stands with nothing bought. The guarded flip above gates this to the
      // single winning run — no double-release. Pre-mig-201 the column is
      // absent → the select errors → nothing to release (no redemption could
      // have been recorded either).
      const { data: redemptions, error: redemptionsErr } = await serviceClient
        .from('booth_credits')
        .select('vendor_profile_id, market_id, amount_cents')
        .eq('related_park_booking_id', row.id)
        .eq('source', 'redeemed')
        .lt('amount_cents', 0)
      if (!redemptionsErr) {
        for (const r of redemptions ?? []) {
          const releaseCents = -(r.amount_cents as number)
          const { error: relErr } = await serviceClient.from('booth_credits').insert({
            vendor_profile_id: r.vendor_profile_id,
            market_id: r.market_id,
            amount_cents: releaseCents,
            source: 'redeemed',
            related_park_booking_id: row.id,
            note: 'Released — booking expired unpaid (park sweep)',
          })
          if (relErr) {
            await logError(new TracedError('ERR_REFUND_001', `CRITICAL: booth-credit release failed expiring park booking ${row.id} — manually re-credit ${releaseCents}¢ to vendor ${r.vendor_profile_id} at market ${r.market_id}: ${relErr.message}`, {
              route: '/api/cron/expire-orders', method: 'GET', amountCents: releaseCents,
            }))
          }
        }
      }
    }
  }

  // ── 2. Generate the next occurrence for each active hold ──
  const { data: active } = await observed(serviceClient
    .from('park_standing_reservations')
    .select(`
      id, market_id, vendor_profile_id, spot_id, day_of_week, strikes_reset_at, requested_start_date,
      park_spots:spot_id ( label, base_price_cents, active ),
      markets:market_id ( name, vertical_id, timezone, park_mode, stripe_charges_enabled, season_start, season_end ),
      vendor_profiles:vendor_profile_id ( user_id )
    `)
    .eq('status', 'active'), { table: 'park_standing_reservations' })

  // PRK-4: a vetting BLOCK must reach standing holds — batch-fetch blocked
  // (market, vendor) pairs and skip generation for them (mirrors the
  // book-park-spot gate; the pay route re-checks independently).
  const blockedKeys = new Set<string>()
  if ((active ?? []).length > 0) {
    const { data: vettingRows } = await observed(serviceClient
      .from('park_vendor_vetting')
      .select('market_id, vendor_profile_id')
      .eq('blocked', true)
      .in('market_id', [...new Set((active ?? []).map((r) => r.market_id as string))]), { table: 'park_vendor_vetting' })
    for (const v of vettingRows ?? []) blockedKeys.add(`${v.market_id}|${v.vendor_profile_id}`)
  }

  for (const res of active ?? []) {
    const spot = res.park_spots as unknown as { label: string; base_price_cents: number; active: boolean } | null
    if (!spot || spot.active !== true) continue

    // PRK-7: don't materialize occurrences the truck CANNOT pay — the pay route
    // refuses non-'paid' park_mode / Stripe-disabled parks, so generating here
    // would strike every anchor into suspension through no fault of theirs.
    const mkt = res.markets as unknown as { park_mode: string | null; stripe_charges_enabled: boolean | null; season_start: string | null; season_end: string | null } | null
    if (mkt?.park_mode !== 'paid' || mkt?.stripe_charges_enabled !== true) continue

    // PRK-4: skip blocked trucks
    if (blockedKeys.has(`${res.market_id}|${res.vendor_profile_id}`)) continue

    // Don't materialize occurrences before the truck's requested start date
    // (P4a). NULL start = no floor (start immediately, legacy behavior).
    const startFloor = (res.requested_start_date as string | null) ?? null
    const fromISO = startFloor && startFloor > todayISO ? startFloor : todayISO
    const occ = nextOccurrenceOnOrAfter(res.day_of_week as number, fromISO)
    if (occ > horizonISO) continue // too far out — wait for a later run

    // P2 (2026-07-15): don't materialize occurrences outside the park's season
    // window — the booking API refuses out-of-season dates, so generating here
    // would create unpayable occurrences (PRK-7 class). YYYY-MM-DD comparison.
    if (mkt.season_start && occ < mkt.season_start) continue
    if (mkt.season_end && occ > mkt.season_end) continue

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
    market_id: r.market_id as string,
    vendor_profile_id: r.vendor_profile_id as string,
    timezone: (r.markets as unknown as { timezone: string | null } | null)?.timezone ?? null,
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
