/**
 * FT park-manager — day-scoped "week at this park" schedule.
 *
 * Reframes park occupancy the way an operator plans: by DAY, not by truck.
 * Returns, for each operating day in a rolling 7-day window (today-forward),
 * the trucks booked that day with their spot + recurrence + payment state,
 * plus per-day glance counts and park-level totals.
 *
 * Source of truth (unioned, deduped by spot+date):
 *   - park_spot_bookings — concrete one-off + materialized-occurrence bookings
 *     (status paid | pending_payment); `standing_reservation_id != null` marks
 *     a recurring occurrence.
 *   - park_standing_reservations (status 'active') — projected onto their
 *     day-of-week across the window for dates not yet materialized. The prod
 *     cron only generates the NEXT occurrence within 7 days (park-standing.ts),
 *     and does not run on staging, so projection is what shows the full
 *     recurring pattern.
 *
 * Operating days come from market_schedules (active DOW) minus
 * market_date_overrides (status 'cancelled') — the exact gate the booking
 * flow enforces (book-park-spot/route.ts), so one-offs can only ever land on
 * these days.
 *
 * The pure functions (buildOperatingDates / assembleParkWeekDays) hold the
 * window/projection/dedup/summary logic and are unit-tested; getParkWeekSchedule
 * is the thin DB orchestrator.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { addDaysISO } from '@/lib/markets/park-standing'
import { nowInTimezoneAsLocalIso } from '@/lib/surveys/cron-helpers'
import { observed } from '@/lib/errors'

export const PARK_WEEK_WINDOW_DAYS = 7

export type WeekTruckStatus = 'paid' | 'unpaid' | 'scheduled'

export interface WeekTruck {
  vendorProfileId: string
  vendorName: string
  spotLabel: string
  /** paid = booked + paid; unpaid = pending_payment booking; scheduled =
   *  projected active standing hold, no booking row yet (pay window may not
   *  be open). */
  status: WeekTruckStatus
  recurring: boolean
  /** Whether the truck has checked in. Only set for TODAY (check-in is daily
   *  and there's no pre-check-in) — undefined for every other day. */
  checkedIn?: boolean
  /** park_spot_bookings.id — present for concrete (paid/unpaid) bookings; absent
   *  for a projected standing hold. Enables the manager "cancel booking" (bar) action. */
  bookingId?: string
  /** True when the operator has barred this booking (no refund; slot not resold). */
  barred?: boolean
}

export interface WeekDay {
  date: string // YYYY-MM-DD (market-local)
  dow: number // 0=Sun..6=Sat
  isToday: boolean
  isTomorrow: boolean
  trucks: WeekTruck[]
  trucksCount: number
  spotsFilled: number
  unpaidCount: number
}

export interface ParkWeekSchedule {
  /** Active park_spots count — the "/N" in "4/6 spots filled". */
  spotsTotal: number
  /** Park-level count of trucks awaiting operator approval (approved=false,
   *  not a manager-initiated invite). Surfaced once at the card header — NOT
   *  per day, since approval isn't date-scoped. */
  needingApproval: number
  days: WeekDay[]
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Day-of-week (0=Sun..6=Sat) of a 'YYYY-MM-DD' date (UTC math — no tz drift). */
export function dowOfISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** The operating dates in a today-forward window: each of the next
 *  `windowDays` days whose DOW is active and which isn't a cancelled override. */
export function buildOperatingDates(
  todayISO: string,
  activeDows: Set<number>,
  cancelledDates: Set<string>,
  windowDays: number = PARK_WEEK_WINDOW_DAYS
): string[] {
  const out: string[] = []
  for (let i = 0; i < windowDays; i++) {
    const d = addDaysISO(todayISO, i)
    if (!activeDows.has(dowOfISO(d))) continue
    if (cancelledDates.has(d)) continue
    out.push(d)
  }
  return out
}

export interface BookingLite {
  id: string
  vendor_profile_id: string
  spot_id: string
  booking_date: string
  status: string // 'paid' | 'pending_payment' | ... (only paid/pending used)
  standing_reservation_id: string | null
  manager_barred_at?: string | null
}

export interface StandingLite {
  vendor_profile_id: string
  spot_id: string
  day_of_week: number
}

/**
 * Assemble the per-day truck lists from concrete bookings + projected standing
 * holds. A booking occupies its spot+date; a standing hold is projected onto a
 * matching operating date ONLY if that spot isn't already occupied that date
 * (so a materialized occurrence shows once, not twice).
 */
export function assembleParkWeekDays(args: {
  dates: string[]
  todayISO: string
  bookings: BookingLite[]
  standing: StandingLite[]
  spotLabelById: Map<string, string>
  activeSpotIds: Set<string>
  vendorNameById: Map<string, string>
}): WeekDay[] {
  const { dates, todayISO, bookings, standing, spotLabelById, activeSpotIds, vendorNameById } = args
  const dateSet = new Set(dates)
  const tomorrowISO = addDaysISO(todayISO, 1)

  const byDate = new Map<string, WeekTruck[]>()
  const occupiedSpotByDate = new Map<string, Set<string>>()
  const truckList = (d: string): WeekTruck[] => {
    let a = byDate.get(d)
    if (!a) { a = []; byDate.set(d, a) }
    return a
  }
  const occupied = (d: string): Set<string> => {
    let s = occupiedSpotByDate.get(d)
    if (!s) { s = new Set(); occupiedSpotByDate.set(d, s) }
    return s
  }
  const nameOf = (vpid: string): string => vendorNameById.get(vpid) ?? 'Unknown food truck'

  // Concrete bookings first — they own the spot+date slot.
  for (const b of bookings) {
    if (!dateSet.has(b.booking_date)) continue
    if (b.status !== 'paid' && b.status !== 'pending_payment') continue
    const label = spotLabelById.get(b.spot_id)
    if (!label) continue
    truckList(b.booking_date).push({
      vendorProfileId: b.vendor_profile_id,
      vendorName: nameOf(b.vendor_profile_id),
      spotLabel: label,
      status: b.status === 'paid' ? 'paid' : 'unpaid',
      recurring: b.standing_reservation_id != null,
      bookingId: b.id,
      barred: b.manager_barred_at != null,
    })
    occupied(b.booking_date).add(b.spot_id)
  }

  // Project active standing holds onto free spot+date slots.
  for (const s of standing) {
    if (!activeSpotIds.has(s.spot_id)) continue
    const label = spotLabelById.get(s.spot_id)
    if (!label) continue
    for (const d of dates) {
      if (dowOfISO(d) !== s.day_of_week) continue
      if (occupied(d).has(s.spot_id)) continue // concrete booking already holds it
      truckList(d).push({
        vendorProfileId: s.vendor_profile_id,
        vendorName: nameOf(s.vendor_profile_id),
        spotLabel: label,
        status: 'scheduled',
        recurring: true,
      })
      occupied(d).add(s.spot_id)
    }
  }

  return dates.map((date) => {
    const trucks = (byDate.get(date) ?? [])
      .slice()
      .sort((a, b) => a.spotLabel.localeCompare(b.spotLabel, undefined, { numeric: true }))
    return {
      date,
      dow: dowOfISO(date),
      isToday: date === todayISO,
      isTomorrow: date === tomorrowISO,
      trucks,
      trucksCount: trucks.length,
      spotsFilled: new Set(trucks.map((t) => t.spotLabel)).size,
      unpaidCount: trucks.filter((t) => t.status === 'unpaid').length,
    }
  })
}

// ── DB orchestrator ─────────────────────────────────────────────────────────

export async function getParkWeekSchedule(
  serviceClient: SupabaseClient,
  marketId: string,
  timezone: string | null
): Promise<ParkWeekSchedule> {
  const todayISO = nowInTimezoneAsLocalIso(timezone || 'America/Chicago').slice(0, 10)
  const window: string[] = []
  for (let i = 0; i < PARK_WEEK_WINDOW_DAYS; i++) window.push(addDaysISO(todayISO, i))

  // Operating-day gate + spot inventory + park-level approval count.
  const [schedRes, ovrRes, spotRes, approvalRes] = await Promise.all([
    serviceClient.from('market_schedules').select('day_of_week').eq('market_id', marketId).eq('active', true),
    serviceClient.from('market_date_overrides').select('override_date')
      .eq('market_id', marketId).eq('status', 'cancelled').in('override_date', window),
    serviceClient.from('park_spots').select('id, label, active').eq('market_id', marketId),
    serviceClient.from('market_vendors').select('response_status').eq('market_id', marketId).eq('approved', false),
  ])

  const activeDows = new Set((schedRes.data ?? []).map((r) => r.day_of_week as number))
  const cancelledDates = new Set((ovrRes.data ?? []).map((o) => o.override_date as string))
  const dates = buildOperatingDates(todayISO, activeDows, cancelledDates)

  const spotLabelById = new Map<string, string>()
  const activeSpotIds = new Set<string>()
  for (const s of spotRes.data ?? []) {
    spotLabelById.set(s.id as string, s.label as string)
    if (s.active === true) activeSpotIds.add(s.id as string)
  }
  const spotsTotal = activeSpotIds.size

  // Approval isn't date-scoped: count approved=false rows that aren't
  // manager-initiated invites (response_status='invited' is awaiting the
  // truck, not the operator). NULL response_status = a self-joined truck.
  const needingApproval = (approvalRes.data ?? []).filter(
    (r) => (r.response_status as string | null) !== 'invited'
  ).length

  if (dates.length === 0) {
    return { spotsTotal, needingApproval, days: [] }
  }

  const [bookingRes, standingRes] = await Promise.all([
    serviceClient.from('park_spot_bookings')
      .select('id, vendor_profile_id, spot_id, booking_date, status, standing_reservation_id, manager_barred_at')
      .eq('market_id', marketId)
      .in('booking_date', dates)
      .in('status', ['paid', 'pending_payment']),
    serviceClient.from('park_standing_reservations')
      .select('vendor_profile_id, spot_id, day_of_week')
      .eq('market_id', marketId)
      .eq('status', 'active'),
  ])

  const bookings = (bookingRes.data ?? []) as BookingLite[]
  const standing = (standingRes.data ?? []) as StandingLite[]

  // Resolve truck names in one query.
  const vendorIds = Array.from(
    new Set([...bookings.map((b) => b.vendor_profile_id), ...standing.map((s) => s.vendor_profile_id)])
  )
  const vendorNameById = new Map<string, string>()
  if (vendorIds.length > 0) {
    const { data: vps } = await observed(serviceClient
      .from('vendor_profiles')
      .select('id, profile_data')
      .in('id', vendorIds), { table: 'vendor_profiles' })
    for (const vp of vps ?? []) {
      const pd = vp.profile_data as { business_name?: string; farm_name?: string } | null
      vendorNameById.set(vp.id as string, pd?.business_name || pd?.farm_name || 'Unknown food truck')
    }
  }

  const days = assembleParkWeekDays({
    dates, todayISO, bookings, standing, spotLabelById, activeSpotIds, vendorNameById,
  })

  // Attendance for TODAY only — check-in is daily and there's no pre-check-in,
  // so only today's row reflects who's actually here.
  const todayDay = days.find((d) => d.isToday)
  if (todayDay && todayDay.trucks.length > 0) {
    const { data: checkins } = await observed(serviceClient
      .from('market_day_checkins')
      .select('vendor_profile_id')
      .eq('market_id', marketId)
      .eq('market_date', todayISO), { table: 'market_day_checkins' })
    const present = new Set((checkins ?? []).map((c) => c.vendor_profile_id as string))
    for (const t of todayDay.trucks) t.checkedIn = present.has(t.vendorProfileId)
  }

  return { spotsTotal, needingApproval, days }
}
