import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { isWithinSeason } from '@/lib/markets/season-window'

/**
 * The manager's next-14-days strip (owner 2026-09-19, OB-029 part D) — the
 * manager-side twin of the vendor's "Your next two weeks"
 * (lib/vendor/week-strip.ts). Date-based, in the MARKET's timezone: every
 * operating date in the window with what the manager wants to know at a
 * glance — how many vendors declared that day, how many hold a PAID booth
 * week covering it (and how many booked but haven't paid), how many buyer
 * orders are scheduled for pickup, and a struck line when the manager
 * cancelled the day (with the make-up date if one was set). A 'special'
 * override adds a date the weekly schedule does not have.
 *
 * Awareness only — the click-and-finish items live in Action Items. This is
 * where the old "Next market day · N orders" line went.
 *
 * `buildManagerStripDays` is pure (dates + rows in → days out) so the date
 * logic is unit-tested without a database; `loadManagerWeekStrip` does the
 * five reads. Service client — market_schedules is public but the rest are
 * manager-scoped (RLS default-deny); auth is verified upstream by the
 * dashboard page's isMarketManager().
 */

export interface ManagerStripDay {
  /** YYYY-MM-DD in the market's timezone. */
  date: string
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number
  startTime: string | null
  endTime: string | null
  /** Active declarations (vendor_market_schedules) for this weekday. */
  declaredVendors: number
  /** PAID weekly_booth_rentals whose week (Sunday-keyed) covers this date. */
  paidBoothWeeks: number
  /** Booked but still pending_payment for the same week. */
  unpaidBoothWeeks: number
  /** Distinct buyer orders with an item picking up here on this date. */
  ordersScheduled: number
  status: 'on' | 'cancelled' | 'special'
  /** Struck-line note for a cancelled day. */
  note: string | null
}

export interface ManagerStripInputs {
  /** First date of the window (market-local today), YYYY-MM-DD. */
  start: string
  days?: number
  seasonStart: string | null
  seasonEnd: string | null
  schedules: Array<{ id: string; day_of_week: number; start_time: string | null; end_time: string | null; active: boolean | null }>
  /** Active declarations: which schedule row each vendor picked. */
  declarations: Array<{ schedule_id: string }>
  rentals: Array<{ week_start_date: string; status: string }>
  /** Distinct (order_id, pickup_date) pairs — the loader dedupes items to orders. */
  orders: Array<{ order_id: string; pickup_date: string }>
  overrides: Array<{ override_date: string; status: string; reschedule_date: string | null }>
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n))
  return dt.toISOString().slice(0, 10)
}

export function dayOfWeekOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
}

/** The Sunday that starts the booth week containing `ymd` (rentals are Sunday-keyed — mig 139 / OB-028 C12). */
export function sundayOf(ymd: string): string {
  return addDays(ymd, -dayOfWeekOf(ymd))
}

export function buildManagerStripDays(input: ManagerStripInputs): ManagerStripDay[] {
  const span = input.days ?? 14
  const activeByDow = new Map<number, ManagerStripInputs['schedules'][number]>()
  for (const s of input.schedules) {
    if (s.active === false) continue
    // One row per weekday is the norm; keep the earliest start if there are two.
    const cur = activeByDow.get(s.day_of_week)
    if (!cur || (s.start_time ?? '99') < (cur.start_time ?? '99')) activeByDow.set(s.day_of_week, s)
  }

  const declaredByDow = new Map<number, number>()
  const dowBySchedule = new Map(input.schedules.map(s => [s.id, s.day_of_week]))
  for (const d of input.declarations) {
    const dow = dowBySchedule.get(d.schedule_id)
    if (dow === undefined) continue
    declaredByDow.set(dow, (declaredByDow.get(dow) ?? 0) + 1)
  }

  const paidByWeek = new Map<string, number>()
  const unpaidByWeek = new Map<string, number>()
  for (const r of input.rentals) {
    const bucket = r.status === 'paid' ? paidByWeek : r.status === 'pending_payment' ? unpaidByWeek : null
    if (!bucket) continue
    bucket.set(r.week_start_date, (bucket.get(r.week_start_date) ?? 0) + 1)
  }

  const ordersByDate = new Map<string, Set<string>>()
  for (const o of input.orders) {
    const set = ordersByDate.get(o.pickup_date) ?? new Set<string>()
    set.add(o.order_id)
    ordersByDate.set(o.pickup_date, set)
  }

  const overrideByDate = new Map(input.overrides.map(o => [o.override_date, o]))

  const out: ManagerStripDay[] = []
  for (let i = 0; i < span; i++) {
    const date = addDays(input.start, i)
    const dow = dayOfWeekOf(date)
    const sched = activeByDow.get(dow)
    const ov = overrideByDate.get(date)
    const inSeason = isWithinSeason(date, input.seasonStart, input.seasonEnd)
    const special = ov?.status === 'special'
    // An operating date: the weekly schedule says so (and the season allows
    // it), or the manager added it as a special date.
    if (!special && !(sched && inSeason)) continue

    const week = sundayOf(date)
    const cancelled = ov?.status === 'cancelled'
    out.push({
      date,
      dayOfWeek: dow,
      startTime: sched?.start_time ?? null,
      endTime: sched?.end_time ?? null,
      declaredVendors: declaredByDow.get(dow) ?? 0,
      paidBoothWeeks: paidByWeek.get(week) ?? 0,
      unpaidBoothWeeks: unpaidByWeek.get(week) ?? 0,
      ordersScheduled: ordersByDate.get(date)?.size ?? 0,
      status: cancelled ? 'cancelled' : special ? 'special' : 'on',
      note: cancelled
        ? (ov?.reschedule_date ? `Cancelled — make-up day ${ov.reschedule_date}` : 'Cancelled')
        : special ? 'Added date' : null,
    })
  }
  return out
}

export async function loadManagerWeekStrip(
  service: SupabaseClient,
  marketId: string,
  marketTimezone: string | null,
  seasonStart: string | null,
  seasonEnd: string | null,
  days = 14,
): Promise<{ today: string; days: ManagerStripDay[] }> {
  const tz = marketTimezone || 'America/Chicago'
  // Market-local today — the canonical cron pattern (expire-orders route),
  // never server-local: Vercel runs UTC.
  const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const start = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`
  const end = addDays(start, days - 1)
  // Rentals are Sunday-keyed: the week holding `start` may begin before it.
  const firstWeek = sundayOf(start)

  const [schedulesRes, declarationsRes, rentalsRes, ordersRes, overridesRes] = await Promise.all([
    observed(service
      .from('market_schedules')
      .select('id, day_of_week, start_time, end_time, active')
      .eq('market_id', marketId), { table: 'market_schedules' }),
    observed(service
      .from('vendor_market_schedules')
      .select('schedule_id')
      .eq('market_id', marketId)
      .eq('is_active', true), { table: 'vendor_market_schedules' }),
    observed(service
      .from('weekly_booth_rentals')
      .select('week_start_date, status')
      .eq('market_id', marketId)
      .in('status', ['paid', 'pending_payment'])
      .gte('week_start_date', firstWeek)
      .lte('week_start_date', end), { table: 'weekly_booth_rentals' }),
    observed(service
      .from('order_items')
      .select('order_id, pickup_date')
      .eq('market_id', marketId)
      .in('status', ['pending', 'confirmed', 'ready'])
      .gte('pickup_date', start)
      .lte('pickup_date', end), { table: 'order_items' }),
    observed(service
      .from('market_date_overrides')
      .select('override_date, status, reschedule_date')
      .eq('market_id', marketId)
      .in('status', ['cancelled', 'special'])
      .gte('override_date', start)
      .lte('override_date', end), { table: 'market_date_overrides' }),
  ])

  const built = buildManagerStripDays({
    start,
    days,
    seasonStart,
    seasonEnd,
    schedules: (schedulesRes.data ?? []).map(s => ({
      id: s.id as string,
      day_of_week: s.day_of_week as number,
      start_time: (s.start_time as string | null) ?? null,
      end_time: (s.end_time as string | null) ?? null,
      active: (s.active as boolean | null) ?? null,
    })),
    declarations: (declarationsRes.data ?? []).map(d => ({ schedule_id: d.schedule_id as string })),
    rentals: (rentalsRes.data ?? []).map(r => ({ week_start_date: r.week_start_date as string, status: r.status as string })),
    orders: (ordersRes.data ?? [])
      .filter(o => typeof o.pickup_date === 'string')
      .map(o => ({ order_id: o.order_id as string, pickup_date: o.pickup_date as string })),
    overrides: (overridesRes.data ?? []).map(o => ({
      override_date: o.override_date as string,
      status: o.status as string,
      reschedule_date: (o.reschedule_date as string | null) ?? null,
    })),
  })
  return { today: start, days: built }
}
