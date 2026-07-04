/**
 * Reusable resolver for "which spot(s) has each truck got at this park."
 *
 * FT parks do NOT use the FM booth model — a truck's spot is NOT stored on
 * `market_vendors.booth_number` (that column is null for every truck). The
 * durable source of truth is:
 *   - `park_spot_bookings` (mig 172/174) — concrete truck×spot×date bookings
 *   - `park_standing_reservations` (mig 173) — recurring "Spot A every Sat" holds
 *   - `park_spots` (mig 171) — the spot definitions (label, price, attributes)
 *
 * This helper is intentionally shared (not inlined in a route) so future
 * reporting / earnings / capacity features read spot assignments from ONE
 * place rather than re-deriving the query. It returns structured data; UI
 * callers format it, reporting callers aggregate it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const DOW_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export interface StandingSpotHold {
  spotLabel: string
  /** 0=Sun .. 6=Sat (park_standing_reservations.day_of_week). */
  dayOfWeek: number
  dayAbbr: string
}

export interface UpcomingSpotBooking {
  spotLabel: string
  /** YYYY-MM-DD (park_spot_bookings.booking_date). */
  bookingDate: string
  status: 'paid' | 'pending_payment'
}

export interface VendorSpotAssignment {
  /** Active recurring holds (approved). */
  standing: StandingSpotHold[]
  /** Concrete bookings on today-or-later, soonest first, paid + unpaid. */
  upcoming: UpcomingSpotBooking[]
}

/** Today (YYYY-MM-DD) in the market's local timezone. Mirrors the canonical
 *  pattern in manager-dashboard-stats.ts:67 (Migration 054 UTC-blackout fix). */
function marketLocalTodayISO(timezone: string | null): string {
  const tz = timezone || 'America/Chicago'
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Returns a map keyed by `vendor_profile_id` of that truck's active standing
 * holds and upcoming bookings at this market. Vendors with no holds and no
 * upcoming bookings are simply absent from the map. Caller passes a service
 * client (auth is enforced upstream by isMarketManager).
 */
export async function getVendorSpotAssignments(
  serviceClient: SupabaseClient,
  marketId: string,
  timezone: string | null
): Promise<Record<string, VendorSpotAssignment>> {
  const todayISO = marketLocalTodayISO(timezone)

  // Spot labels for this market (small enumerated set) — resolve spot_id →
  // label in JS to avoid FK-name-dependent embedded joins.
  const { data: spotRows } = await serviceClient
    .from('park_spots')
    .select('id, label')
    .eq('market_id', marketId)
  const labelById = new Map<string, string>()
  for (const s of spotRows ?? []) labelById.set(s.id as string, s.label as string)

  const result: Record<string, VendorSpotAssignment> = {}
  const ensure = (vpid: string): VendorSpotAssignment => {
    if (!result[vpid]) result[vpid] = { standing: [], upcoming: [] }
    return result[vpid]
  }

  // Active standing holds (approved recurring). 'requested' is excluded —
  // it's a pending ask, not a confirmed assignment.
  const { data: standingRows } = await serviceClient
    .from('park_standing_reservations')
    .select('vendor_profile_id, spot_id, day_of_week')
    .eq('market_id', marketId)
    .eq('status', 'active')
  for (const r of standingRows ?? []) {
    const label = labelById.get(r.spot_id as string)
    if (!label) continue
    const dow = r.day_of_week as number
    ensure(r.vendor_profile_id as string).standing.push({
      spotLabel: label,
      dayOfWeek: dow,
      dayAbbr: DOW_ABBR[dow] ?? '',
    })
  }

  // Upcoming concrete bookings (today or later), paid + pending (an unpaid
  // occurrence is still an assignment until the prepay cutoff releases it).
  const { data: bookingRows } = await serviceClient
    .from('park_spot_bookings')
    .select('vendor_profile_id, spot_id, booking_date, status')
    .eq('market_id', marketId)
    .gte('booking_date', todayISO)
    .in('status', ['paid', 'pending_payment'])
    .order('booking_date', { ascending: true })
  for (const r of bookingRows ?? []) {
    const label = labelById.get(r.spot_id as string)
    if (!label) continue
    ensure(r.vendor_profile_id as string).upcoming.push({
      spotLabel: label,
      bookingDate: r.booking_date as string,
      status: r.status as 'paid' | 'pending_payment',
    })
  }

  return result
}
