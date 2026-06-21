import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase D — vendor market-day check-in eligibility + geo helpers.
 *
 * A vendor may check in to a market for TODAY (market-local date) when they are
 * associated with it (approved market_vendor — covers traditional + events — OR
 * a paid weekly booth rental whose week contains today) AND the market operates
 * today (traditional: an active schedule for today's local weekday; event: today
 * within the event date range).
 *
 * All queries here run with the SERVICE client (called after auth in the route),
 * because association crosses market_vendors / weekly_booth_rentals.
 */

/** Advisory geofence radius (meters). Tunable — see phase_d_checkins_plan.md. */
export const CHECKIN_GEOFENCE_RADIUS_M = 250

/** Great-circle distance in METERS. */
export function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // earth radius, meters
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Market-local date as YYYY-MM-DD (en-CA gives ISO order). */
export function marketLocalDate(timezone: string | null, now: Date = new Date()): string {
  const tz = timezone || 'America/Chicago'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

/** Market-local weekday 0=Sun..6=Sat. */
export function marketLocalDow(timezone: string | null, now: Date = new Date()): number {
  const tz = timezone || 'America/Chicago'
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[wd] ?? 0
}

export interface CheckInEligibleMarket {
  marketId: string
  marketName: string | null
  marketType: string
  timezone: string | null
  latitude: number | null
  longitude: number | null
  marketDate: string // market-local YYYY-MM-DD
  boothNumber: string | null
}

type MarketRow = {
  id: string
  name: string | null
  market_type: string
  timezone: string | null
  latitude: number | null
  longitude: number | null
  event_start_date: string | null
  event_end_date: string | null
}

function operatesToday(
  market: MarketRow,
  scheduleDows: Set<number>,
): boolean {
  if (market.market_type === 'event') {
    const today = marketLocalDate(market.timezone)
    return (
      !!market.event_start_date &&
      !!market.event_end_date &&
      market.event_start_date <= today &&
      today <= market.event_end_date
    )
  }
  return scheduleDows.has(marketLocalDow(market.timezone))
}

/**
 * Markets this vendor can check into today, with booth # where known.
 * Used by the dashboard prompt (GET) and the check-in POST validator.
 */
export async function getEligibleCheckInMarkets(
  service: SupabaseClient,
  vendorProfileId: string,
): Promise<CheckInEligibleMarket[]> {
  // 1. Associated market ids + booth numbers.
  //    (a) approved market_vendors (traditional + events share this table)
  const { data: mvRows } = await service
    .from('market_vendors')
    .select('market_id, booth_number')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('approved', true)

  //    (b) paid booth rentals whose week (Sun..Sat) contains today
  const todayStr = marketLocalDate(null)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 6)
  const weekAgoStr = marketLocalDate(null, weekAgo)
  const { data: rentalRows } = await service
    .from('weekly_booth_rentals')
    .select('market_id, booth_number, week_start_date')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('status', 'paid')
    .lte('week_start_date', todayStr)
    .gte('week_start_date', weekAgoStr)

  const boothByMarket = new Map<string, string | null>()
  for (const r of mvRows ?? []) boothByMarket.set(r.market_id as string, (r.booth_number as string) ?? null)
  for (const r of rentalRows ?? []) {
    // booth rental booth_number wins if market_vendors had none
    const existing = boothByMarket.get(r.market_id as string)
    boothByMarket.set(r.market_id as string, (r.booth_number as string) ?? existing ?? null)
  }

  const marketIds = [...boothByMarket.keys()]
  if (marketIds.length === 0) return []

  // 2. Market details + today's active schedule weekdays.
  const { data: markets } = await service
    .from('markets')
    .select('id, name, market_type, timezone, latitude, longitude, event_start_date, event_end_date')
    .in('id', marketIds)

  const { data: schedules } = await service
    .from('market_schedules')
    .select('market_id, day_of_week')
    .in('market_id', marketIds)
    .eq('active', true)

  const dowsByMarket = new Map<string, Set<number>>()
  for (const s of schedules ?? []) {
    const set = dowsByMarket.get(s.market_id as string) ?? new Set<number>()
    set.add(s.day_of_week as number)
    dowsByMarket.set(s.market_id as string, set)
  }

  const out: CheckInEligibleMarket[] = []
  for (const m of (markets ?? []) as MarketRow[]) {
    if (!operatesToday(m, dowsByMarket.get(m.id) ?? new Set())) continue
    out.push({
      marketId: m.id,
      marketName: m.name,
      marketType: m.market_type,
      timezone: m.timezone,
      latitude: m.latitude,
      longitude: m.longitude,
      marketDate: marketLocalDate(m.timezone),
      boothNumber: boothByMarket.get(m.id) ?? null,
    })
  }
  return out
}
