import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { prepayCutoffISO } from '@/lib/markets/park-standing'

/**
 * F1 — a one-off spot booking respects an active standing hold
 * (booth_model_design.md §7, owner 2026-09-19/20).
 *
 * The defect: a hold protected its spot only through the pending occurrence
 * the nightly sweep creates, and the sweep looks 7 days ahead — so a one-off
 * truck could book the anchor's spot for that weekday 8+ days out and the
 * anchor's week was silently skipped. This is the FT twin of FM's pin rule
 * (BR-6: auto-assign skips pinned numbers for every future week).
 *
 * Rule F1-1: booking spot S on date D is refused when an ACTIVE standing hold
 * exists for (S, weekday of D) held by ANOTHER vendor, D is on/after the
 * hold's requested_start_date (NULL = no floor), and the anchor has not
 * forfeited D — forfeited = a booking row for that hold on D with status
 * expired or cancelled. The anchor booking their own spot early is allowed.
 * Holds still in 'requested' (not yet approved) do not block.
 */

export interface StandingHoldRow {
  id: string
  vendor_profile_id: string
  spot_id: string
  day_of_week: number
  status: string
  requested_start_date: string | null
}

export interface HoldConflict {
  date: string
  holdId: string
  holderVendorId: string
}

function dowOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
}

/**
 * Pure: which of `dates` collide with an active hold on this spot held by
 * someone else, ignoring forfeits (the caller subtracts those).
 */
export function datesBlockedByHolds(
  dates: string[],
  holds: StandingHoldRow[],
  spotId: string,
  bookingVendorId: string,
): HoldConflict[] {
  const out: HoldConflict[] = []
  for (const date of dates) {
    const dow = dowOf(date)
    const hold = holds.find((h) =>
      h.status === 'active' &&
      h.spot_id === spotId &&
      h.day_of_week === dow &&
      h.vendor_profile_id !== bookingVendorId &&
      (!h.requested_start_date || date >= h.requested_start_date),
    )
    if (hold) out.push({ date, holdId: hold.id, holderVendorId: hold.vendor_profile_id })
  }
  return out
}

/** The sentence the booking truck reads (design §7 F1-1). */
export function heldSpotMessage(spotLabel: string, date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dayName = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  return `${spotLabel} is held by a recurring truck on ${dayName}s. It opens to other trucks only if they don't pay by the ${prepayCutoffISO(date)} cutoff — check back after that, or pick another spot.`
}

/**
 * Route check: reads the spot's active holds and the anchors' forfeits for
 * the requested dates; returns the first blocked date or null.
 */
export async function findHeldDateConflict(
  service: SupabaseClient,
  input: { marketId: string; spotId: string; vendorProfileId: string; dates: string[] },
): Promise<HoldConflict | null> {
  const { data: holdsRaw } = await observed(service
    .from('park_standing_reservations')
    .select('id, vendor_profile_id, spot_id, day_of_week, status, requested_start_date')
    .eq('market_id', input.marketId)
    .eq('spot_id', input.spotId)
    .eq('status', 'active'), { table: 'park_standing_reservations' })
  const holds = (holdsRaw ?? []) as unknown as StandingHoldRow[]
  if (holds.length === 0) return null

  const candidates = datesBlockedByHolds(input.dates, holds, input.spotId, input.vendorProfileId)
  if (candidates.length === 0) return null

  // Forfeits: the anchor's occurrence for that date already expired or was
  // cancelled → the date is open to anyone.
  const { data: forfeits } = await observed(service
    .from('park_spot_bookings')
    .select('standing_reservation_id, booking_date')
    .in('standing_reservation_id', Array.from(new Set(candidates.map((c) => c.holdId))))
    .in('booking_date', candidates.map((c) => c.date))
    .in('status', ['expired', 'cancelled']), { table: 'park_spot_bookings' })
  const forfeited = new Set((forfeits ?? []).map((f) => `${f.standing_reservation_id}|${f.booking_date}`))

  return candidates.find((c) => !forfeited.has(`${c.holdId}|${c.date}`)) ?? null
}
