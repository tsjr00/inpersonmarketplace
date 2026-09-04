/**
 * Event ↔ location availability (R3-4, owner rule 2026-08-27).
 *
 * THE RULE: a vendor cannot do an event AND another scheduled location at the
 * same time — same calendar date with overlapping hours — unless they have
 * affirmatively said they can cover both (FT: "more than one truck", FM: "can
 * staff more than one location at once"; both live in
 * profile_data.multiple_trucks). A vendor who has NOT said so must choose:
 *   · if the other location already holds open pre-orders for that date, the
 *     event is refused until those are fulfilled or cancelled;
 *   · otherwise they may take the event, and the location is BLACKED OUT for
 *     the whole day (lib/events/blackouts.ts → mig 238) so no order can land
 *     for a day they will not be there.
 *
 * What counts as a commitment (owner):
 *   · active weekly schedules at traditional markets / parks
 *   · paid FT park-spot bookings and paid FM booth-rental weeks
 *   · other accepted (not benched) events — never skippable
 *   · the vendor's OWN private-pickup locations ONLY when they hold open
 *     orders that day (someone else can hand a farm pickup over; nobody can
 *     serve a pre-order the truck is not there to make)
 *
 * The check runs at invitation render, at acceptance, and — because a
 * promoted backup re-enters through the accept route — for backups too.
 *
 * `evaluateConflicts` is pure (unit-tested against the rule above);
 * `loadVendorAvailability` does the reads and calls it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'

export type ConflictKind = 'schedule' | 'park_booking' | 'booth_rental' | 'event' | 'private_pickup'

export interface VendorConflict {
  kind: ConflictKind
  marketId: string
  marketName: string
  marketType: string
  /** YYYY-MM-DD — the event date this commitment collides with */
  date: string
  startTime: string | null
  endTime: string | null
  /** order_items at that location for that date, not fulfilled/cancelled */
  openOrderCount: number
  /** market-box pickups scheduled/ready at that location for that date */
  marketBoxPickupCount: number
  /** money already on the line (paid spot / paid booth week) */
  paid: boolean
}

export interface VendorAvailability {
  multiCapable: boolean
  eventDates: string[]
  eventStartTime: string | null
  eventEndTime: string | null
  conflicts: VendorConflict[]
  /** non-flagged vendor + a conflict with open work → cannot accept */
  blockedByOrders: boolean
  /** non-flagged vendor + another accepted event overlapping → cannot accept */
  blockedByEvent: boolean
  /** non-flagged vendor, conflicts, nothing blocking → must acknowledge the skip */
  needsSkipAcknowledgment: boolean
  /** flagged vendor with conflicts → must confirm they will cover both */
  needsMultiConfirmation: boolean
}

// ── pure inputs ──────────────────────────────────────────────────────────

export interface ScheduleCommitment {
  marketId: string
  marketName: string
  marketType: string
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface DateCommitment {
  kind: 'park_booking' | 'booth_rental' | 'event'
  marketId: string
  marketName: string
  marketType: string
  date: string
  /** null = whole day */
  startTime: string | null
  endTime: string | null
}

export interface OpenWork {
  marketId: string
  date: string
  orders: number
  boxPickups: number
}

export interface EvaluateInput {
  eventDates: string[]
  eventStartTime: string | null
  eventEndTime: string | null
  multiCapable: boolean
  schedules: ScheduleCommitment[]
  dateCommitments: DateCommitment[]
  /** the vendor's own private-pickup locations (id → name) */
  privatePickups: Array<{ marketId: string; marketName: string }>
  openWork: OpenWork[]
}

const ALL_DAY_START = '00:00:00'
const ALL_DAY_END = '23:59:59'

export function padTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t
}

/** Adjacent ranges (A ends exactly when B starts) do NOT overlap. */
export function hoursOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
): boolean {
  const sA = padTime(aStart ?? ALL_DAY_START)
  const eA = padTime(aEnd ?? ALL_DAY_END)
  const sB = padTime(bStart ?? ALL_DAY_START)
  const eB = padTime(bEnd ?? ALL_DAY_END)
  return sA < eB && sB < eA
}

/** 0 = Sunday … 6 = Saturday, from a YYYY-MM-DD string (no timezone shift). */
export function dayOfWeekOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y!, m! - 1, d!).getDay()
}

/** Inclusive list of YYYY-MM-DD dates from start to end (end null = start). */
export function datesBetween(start: string, end: string | null): string[] {
  const out: string[] = []
  const [y, m, d] = start.split('-').map(Number)
  const cur = new Date(y!, m! - 1, d!)
  const last = end ?? start
  for (let i = 0; i < 31; i++) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    out.push(iso)
    if (iso >= last) break
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

const KIND_RANK: Record<ConflictKind, number> = {
  event: 4,
  park_booking: 3,
  booth_rental: 2,
  schedule: 1,
  private_pickup: 0,
}

export function evaluateConflicts(input: EvaluateInput): VendorAvailability {
  const work = new Map<string, OpenWork>()
  for (const w of input.openWork) work.set(`${w.marketId}|${w.date}`, w)
  const workFor = (marketId: string, date: string) => work.get(`${marketId}|${date}`)

  const byKey = new Map<string, VendorConflict>()
  const consider = (c: VendorConflict) => {
    const key = `${c.marketId}|${c.date}`
    const prev = byKey.get(key)
    if (!prev || KIND_RANK[c.kind] > KIND_RANK[prev.kind]) byKey.set(key, c)
  }

  for (const date of input.eventDates) {
    const dow = dayOfWeekOf(date)

    for (const s of input.schedules) {
      if (s.dayOfWeek !== dow) continue
      if (s.marketType === 'event') continue // events are handled as date commitments
      if (!hoursOverlap(input.eventStartTime, input.eventEndTime, s.startTime, s.endTime)) continue
      const w = workFor(s.marketId, date)
      consider({
        kind: 'schedule',
        marketId: s.marketId,
        marketName: s.marketName,
        marketType: s.marketType,
        date,
        startTime: padTime(s.startTime),
        endTime: padTime(s.endTime),
        openOrderCount: w?.orders ?? 0,
        marketBoxPickupCount: w?.boxPickups ?? 0,
        paid: false,
      })
    }

    for (const dc of input.dateCommitments) {
      if (dc.date !== date) continue
      if (!hoursOverlap(input.eventStartTime, input.eventEndTime, dc.startTime, dc.endTime)) continue
      const w = workFor(dc.marketId, date)
      consider({
        kind: dc.kind,
        marketId: dc.marketId,
        marketName: dc.marketName,
        marketType: dc.marketType,
        date,
        startTime: dc.startTime ? padTime(dc.startTime) : null,
        endTime: dc.endTime ? padTime(dc.endTime) : null,
        openOrderCount: w?.orders ?? 0,
        marketBoxPickupCount: w?.boxPickups ?? 0,
        paid: dc.kind !== 'event',
      })
    }

    // Own private pickups: a commitment only when orders are already waiting.
    for (const p of input.privatePickups) {
      const w = workFor(p.marketId, date)
      if (!w || w.orders + w.boxPickups === 0) continue
      consider({
        kind: 'private_pickup',
        marketId: p.marketId,
        marketName: p.marketName,
        marketType: 'private_pickup',
        date,
        startTime: null,
        endTime: null,
        openOrderCount: w.orders,
        marketBoxPickupCount: w.boxPickups,
        paid: false,
      })
    }
  }

  const conflicts = [...byKey.values()].sort((a, b) =>
    a.date === b.date ? a.marketName.localeCompare(b.marketName) : a.date.localeCompare(b.date)
  )
  const hasWork = conflicts.some(c => c.openOrderCount + c.marketBoxPickupCount > 0)
  const hasEvent = conflicts.some(c => c.kind === 'event')
  const blockedByOrders = !input.multiCapable && hasWork
  const blockedByEvent = !input.multiCapable && hasEvent

  return {
    multiCapable: input.multiCapable,
    eventDates: input.eventDates,
    eventStartTime: input.eventStartTime,
    eventEndTime: input.eventEndTime,
    conflicts,
    blockedByOrders,
    blockedByEvent,
    needsSkipAcknowledgment: !input.multiCapable && conflicts.length > 0 && !blockedByOrders && !blockedByEvent,
    needsMultiConfirmation: input.multiCapable && conflicts.length > 0,
  }
}

// ── loader ───────────────────────────────────────────────────────────────

type MarketEmbed = { id?: string; name: string; market_type: string } | { id?: string; name: string; market_type: string }[] | null
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

/**
 * Everything this vendor has on the event's dates. Returns null when the
 * market is not an event or has no date yet (nothing to check).
 */
export async function loadVendorAvailability(
  service: SupabaseClient,
  vendorProfileId: string,
  eventMarketId: string
): Promise<VendorAvailability | null> {
  const { data: event } = await observed(service
    .from('markets')
    .select('id, market_type, event_start_date, event_end_date, catering_request_id')
    .eq('id', eventMarketId)
    .maybeSingle(), { table: 'markets' })
  if (!event || event.market_type !== 'event' || !event.event_start_date) return null

  let eventStartTime: string | null = null
  let eventEndTime: string | null = null
  if (event.catering_request_id) {
    const { data: cReq } = await observed(service
      .from('catering_requests')
      .select('event_start_time, event_end_time')
      .eq('id', event.catering_request_id)
      .maybeSingle(), { table: 'catering_requests' })
    eventStartTime = (cReq?.event_start_time as string | null) ?? null
    eventEndTime = (cReq?.event_end_time as string | null) ?? null
  }

  const eventDates = datesBetween(event.event_start_date as string, (event.event_end_date as string | null) ?? null)
  const dows = new Set(eventDates.map(dayOfWeekOf))

  const { data: vp } = await observed(service
    .from('vendor_profiles')
    .select('profile_data')
    .eq('id', vendorProfileId)
    .maybeSingle(), { table: 'vendor_profiles' })
  const multiCapable = ((vp?.profile_data as Record<string, unknown> | null)?.multiple_trucks) === true

  // 1. Active weekly schedules elsewhere (vendor time overrides win).
  const { data: vmsRows } = await observed(service
    .from('vendor_market_schedules')
    .select(`
      market_id, vendor_start_time, vendor_end_time,
      markets!inner ( id, name, market_type ),
      market_schedules!inner ( day_of_week, start_time, end_time, active )
    `)
    .eq('vendor_profile_id', vendorProfileId)
    .eq('is_active', true)
    .neq('market_id', eventMarketId), { table: 'vendor_market_schedules' })

  const schedules: ScheduleCommitment[] = []
  for (const r of vmsRows ?? []) {
    const m = one(r.markets as MarketEmbed)
    const ms = one(r.market_schedules as { day_of_week: number; start_time: string; end_time: string; active: boolean | null } | { day_of_week: number; start_time: string; end_time: string; active: boolean | null }[] | null)
    if (!m || !ms || ms.active === false) continue
    if (!dows.has(ms.day_of_week)) continue
    schedules.push({
      marketId: r.market_id as string,
      marketName: m.name,
      marketType: m.market_type,
      dayOfWeek: ms.day_of_week,
      startTime: (r.vendor_start_time as string | null) ?? ms.start_time,
      endTime: (r.vendor_end_time as string | null) ?? ms.end_time,
    })
  }

  const dateCommitments: DateCommitment[] = []

  // 2. Paid park-spot days (FT). A barred booking is not a commitment.
  const { data: parkRows } = await observed(service
    .from('park_spot_bookings')
    .select('market_id, booking_date, markets:market_id ( id, name, market_type )')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('status', 'paid')
    .is('manager_barred_at', null)
    .in('booking_date', eventDates)
    .neq('market_id', eventMarketId), { table: 'park_spot_bookings' })

  // 3. Paid booth weeks (FM) whose week contains an event date.
  const minDate = eventDates[0]!
  const maxDate = eventDates[eventDates.length - 1]!
  const weekFloor = datesBetween(minDate, null)[0]!
  const { data: boothRows } = await observed(service
    .from('weekly_booth_rentals')
    .select('market_id, week_start_date, markets:market_id ( id, name, market_type )')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('status', 'paid')
    .gte('week_start_date', shiftDate(weekFloor, -6))
    .lte('week_start_date', maxDate)
    .neq('market_id', eventMarketId), { table: 'weekly_booth_rentals' })

  // Hours for park/booth days come from the location's schedule on that weekday.
  const hoursMarketIds = new Set<string>()
  for (const r of parkRows ?? []) hoursMarketIds.add(r.market_id as string)
  for (const r of boothRows ?? []) hoursMarketIds.add(r.market_id as string)
  const hoursByMarketDow = new Map<string, { start: string; end: string }>()
  if (hoursMarketIds.size > 0) {
    const { data: msRows } = await observed(service
      .from('market_schedules')
      .select('market_id, day_of_week, start_time, end_time')
      .in('market_id', [...hoursMarketIds])
      .eq('active', true), { table: 'market_schedules' })
    for (const s of msRows ?? []) {
      const key = `${s.market_id}|${s.day_of_week}`
      const prev = hoursByMarketDow.get(key)
      // widest window if a market has several slots that day
      hoursByMarketDow.set(key, {
        start: prev && prev.start < (s.start_time as string) ? prev.start : (s.start_time as string),
        end: prev && prev.end > (s.end_time as string) ? prev.end : (s.end_time as string),
      })
    }
  }
  const hoursFor = (marketId: string, date: string) => hoursByMarketDow.get(`${marketId}|${dayOfWeekOf(date)}`)

  for (const r of parkRows ?? []) {
    const m = one(r.markets as MarketEmbed)
    if (!m) continue
    const h = hoursFor(r.market_id as string, r.booking_date as string)
    dateCommitments.push({
      kind: 'park_booking',
      marketId: r.market_id as string,
      marketName: m.name,
      marketType: m.market_type,
      date: r.booking_date as string,
      startTime: h?.start ?? null,
      endTime: h?.end ?? null,
    })
  }
  for (const r of boothRows ?? []) {
    const m = one(r.markets as MarketEmbed)
    if (!m) continue
    const weekStart = r.week_start_date as string
    for (const date of eventDates) {
      if (date < weekStart || date > shiftDate(weekStart, 6)) continue
      const h = hoursFor(r.market_id as string, date)
      if (!h) continue // the market is not open that weekday — no commitment
      dateCommitments.push({
        kind: 'booth_rental',
        marketId: r.market_id as string,
        marketName: m.name,
        marketType: m.market_type,
        date,
        startTime: h.start,
        endTime: h.end,
      })
    }
  }

  // 4. Other accepted, not-benched events overlapping in date.
  const { data: otherEvents } = await observed(service
    .from('market_vendors')
    .select('market_id, is_backup, markets:market_id ( id, name, market_type, event_start_date, event_end_date, catering_request_id )')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('response_status', 'accepted')
    .neq('market_id', eventMarketId), { table: 'market_vendors' })
  const otherEventReqIds: string[] = []
  const otherEventRows: Array<{ marketId: string; name: string; start: string; end: string; reqId: string | null }> = []
  for (const r of otherEvents ?? []) {
    const m = one(r.markets as ({ id: string; name: string; market_type: string; event_start_date: string | null; event_end_date: string | null; catering_request_id: string | null }) | ({ id: string; name: string; market_type: string; event_start_date: string | null; event_end_date: string | null; catering_request_id: string | null })[] | null)
    if (!m || m.market_type !== 'event' || !m.event_start_date || r.is_backup === true) continue
    const start = m.event_start_date
    const end = m.event_end_date ?? start
    if (start > maxDate || end < minDate) continue
    otherEventRows.push({ marketId: r.market_id as string, name: m.name, start, end, reqId: m.catering_request_id })
    if (m.catering_request_id) otherEventReqIds.push(m.catering_request_id)
  }
  const timesByReq = new Map<string, { start: string | null; end: string | null }>()
  if (otherEventReqIds.length > 0) {
    const { data: reqs } = await observed(service
      .from('catering_requests')
      .select('id, event_start_time, event_end_time')
      .in('id', otherEventReqIds), { table: 'catering_requests' })
    for (const q of reqs ?? []) {
      timesByReq.set(q.id as string, { start: (q.event_start_time as string | null) ?? null, end: (q.event_end_time as string | null) ?? null })
    }
  }
  for (const ev of otherEventRows) {
    const t = ev.reqId ? timesByReq.get(ev.reqId) : undefined
    for (const date of eventDates) {
      if (date < ev.start || date > ev.end) continue
      dateCommitments.push({
        kind: 'event',
        marketId: ev.marketId,
        marketName: ev.name,
        marketType: 'event',
        date,
        startTime: t?.start ?? null,
        endTime: t?.end ?? null,
      })
    }
  }

  // 5. Own private pickups (only count when they hold open work — see rule).
  const { data: privateRows } = await observed(service
    .from('markets')
    .select('id, name')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('market_type', 'private_pickup')
    .eq('status', 'active'), { table: 'markets' })
  const privatePickups = (privateRows ?? []).map(p => ({ marketId: p.id as string, marketName: p.name as string }))

  // 6. Open work on the event dates at every candidate location.
  const candidateIds = new Set<string>()
  for (const s of schedules) candidateIds.add(s.marketId)
  for (const d of dateCommitments) if (d.kind !== 'event') candidateIds.add(d.marketId)
  for (const p of privatePickups) candidateIds.add(p.marketId)

  const openWork: OpenWork[] = []
  if (candidateIds.size > 0) {
    const ids = [...candidateIds]
    const counts = new Map<string, OpenWork>()
    const bump = (marketId: string, date: string, field: 'orders' | 'boxPickups') => {
      const key = `${marketId}|${date}`
      const w = counts.get(key) ?? { marketId, date, orders: 0, boxPickups: 0 }
      w[field] += 1
      counts.set(key, w)
    }

    const { data: items } = await observed(service
      .from('order_items')
      .select('market_id, pickup_date')
      .eq('vendor_profile_id', vendorProfileId)
      .in('market_id', ids)
      .in('pickup_date', eventDates)
      .not('status', 'in', '("fulfilled","cancelled")'), { table: 'order_items' })
    for (const it of items ?? []) {
      if (it.market_id && it.pickup_date) bump(it.market_id as string, it.pickup_date as string, 'orders')
    }

    const { data: offerings } = await observed(service
      .from('market_box_offerings')
      .select('id, pickup_market_id')
      .eq('vendor_profile_id', vendorProfileId)
      .in('pickup_market_id', ids), { table: 'market_box_offerings' })
    const marketByOffering = new Map<string, string>()
    for (const o of offerings ?? []) marketByOffering.set(o.id as string, o.pickup_market_id as string)
    if (marketByOffering.size > 0) {
      const { data: subs } = await observed(service
        .from('market_box_subscriptions')
        .select('id, offering_id')
        .in('offering_id', [...marketByOffering.keys()]), { table: 'market_box_subscriptions' })
      const marketBySub = new Map<string, string>()
      for (const s of subs ?? []) {
        const mk = marketByOffering.get(s.offering_id as string)
        if (mk) marketBySub.set(s.id as string, mk)
      }
      if (marketBySub.size > 0) {
        const { data: pickups } = await observed(service
          .from('market_box_pickups')
          .select('subscription_id, scheduled_date')
          .in('subscription_id', [...marketBySub.keys()])
          .in('scheduled_date', eventDates)
          .in('status', ['scheduled', 'ready']), { table: 'market_box_pickups' })
        for (const p of pickups ?? []) {
          const mk = marketBySub.get(p.subscription_id as string)
          if (mk) bump(mk, p.scheduled_date as string, 'boxPickups')
        }
      }
    }
    openWork.push(...counts.values())
  }

  return evaluateConflicts({
    eventDates,
    eventStartTime,
    eventEndTime,
    multiCapable,
    schedules,
    dateCommitments,
    privatePickups,
    openWork,
  })
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d! + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** One-line, vendor-facing description of a conflict for messages/notes. */
export function describeConflict(c: VendorConflict): string {
  const when = c.startTime && c.endTime ? ` ${c.startTime.slice(0, 5)}–${c.endTime.slice(0, 5)}` : ''
  const what =
    c.kind === 'park_booking' ? 'paid spot' :
    c.kind === 'booth_rental' ? 'paid booth' :
    c.kind === 'event' ? 'event' :
    c.kind === 'private_pickup' ? 'pickup location' : 'schedule'
  const work = c.openOrderCount + c.marketBoxPickupCount
  return `${c.marketName} (${what}, ${c.date}${when}${work > 0 ? `, ${work} open order${work === 1 ? '' : 's'}` : ''})`
}
