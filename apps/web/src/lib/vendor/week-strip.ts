/**
 * Week strip — the vendor's own "where am I on what day" for the next 14
 * calendar DATES (v2 of the week-at-a-glance, owner 2026-09-03).
 *
 * Why dates and not a day-of-week grid: several facts in this system are
 * date-specific and a DOW grid cannot show them —
 *   · vendor_date_blackouts (mig 238): a park day skipped for an accepted
 *     event still rendered as a park day
 *   · market_date_overrides: a manager-cancelled market day still rendered
 *   · park_spot_bookings are date-native
 *   · events are dates
 * The strip renders the truth per date, including WHY a day is struck
 * ("Skipped for {event}", "Cancelled by the market").
 *
 * Relationship to lib/events/availability.ts: that module answers "does THIS
 * EVENT collide with the vendor's commitments" (a conflict decision); this one
 * answers "what does the vendor's next two weeks look like" (a display). The
 * commitment QUERIES follow availability.ts's patterns (schedules + paid park
 * days + paid booth weeks + events), the pure date helpers are imported from
 * it, but the outputs differ: availability collapses to conflicts, the strip
 * keeps every entry and layers blackouts + overrides on top.
 *
 * Events shown: SELECTED only (organizer_selected_at, not benched) — the same
 * accuracy rule as the event pill; an accepted-awaiting event is not a
 * commitment.
 *
 * v2.1 (owner go 2026-09-04): two more date-specific facts —
 *   · 'special' make-up-day overrides (market_date_overrides, written by the
 *     manager's season makeup-dates route) render as an INFORMATIONAL entry
 *     for vendors with a weekly schedule or commitment at that market ("the
 *     market added a day") — no attendance claim; booth weeks are NOT
 *     extended onto them. A cancelled day whose override carries
 *     reschedule_date names the make-up date in its strike note.
 *   · pending standing occurrences (park_spot_bookings status
 *     'pending_payment' WITH standing_reservation_id) render as
 *     status 'payment_due' with "Pay by {date}" — the date comes from
 *     park-standing.ts prepayCutoffISO, the ONE cutoff definition.
 *
 * `assembleStrip` is pure (unit-tested); `loadVendorWeekStrip` does the reads.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { dayOfWeekOf, datesBetween, padTime, shiftDate } from '@/lib/events/availability'
import { prepayCutoffISO } from '@/lib/markets/park-standing'

export type StripEntryKind = 'schedule' | 'park_booking' | 'booth' | 'private_pickup' | 'event'
export type StripEntryStatus = 'on' | 'skipped_for_event' | 'cancelled_by_market' | 'payment_due'

export interface StripEntry {
  marketId: string
  name: string
  kind: StripEntryKind
  marketType: string
  startTime: string | null
  endTime: string | null
  status: StripEntryStatus
  /** human sentence for a struck entry — "Skipped for {event}" etc. */
  note: string | null
}

export interface StripDay {
  date: string // YYYY-MM-DD
  entries: StripEntry[]
}

// ── pure inputs ──────────────────────────────────────────────────────────

export interface StripScheduleInput {
  marketId: string
  marketName: string
  marketType: string
  kind: 'schedule' | 'private_pickup'
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface StripDateInput {
  kind: 'park_booking' | 'booth'
  marketId: string
  marketName: string
  marketType: string
  date: string
  startTime: string | null
  endTime: string | null
}

export interface StripEventInput {
  marketId: string
  name: string
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
}

export interface StripPendingOccurrenceInput {
  marketId: string
  marketName: string
  marketType: string
  date: string
  /** last day to pay (prepayCutoffISO of the occurrence date) */
  payBy: string
  startTime: string | null
  endTime: string | null
}

export interface StripAssembleInput {
  schedules: StripScheduleInput[]
  dateCommitments: StripDateInput[]
  events: StripEventInput[]
  /** market_date_overrides with status='cancelled' in the window
   *  (rescheduleDate = the manager's advisory make-up date, when set) */
  cancelledOverrides: Array<{ marketId: string; date: string; rescheduleDate?: string | null }>
  /** vendor_date_blackouts in the window */
  blackouts: Array<{ marketId: string; date: string; sourceEventName: string | null }>
  /** v2.1: market_date_overrides with status='special' — make-up days the
   *  market added; shown only for markets the vendor already appears at */
  specialOverrides?: Array<{ marketId: string; date: string }>
  /** v2.1: unpaid standing-occurrence park days ("pay by X to keep your spot") */
  pendingOccurrences?: StripPendingOccurrenceInput[]
}

export function assembleStrip(dates: string[], input: StripAssembleInput): StripDay[] {
  const cancelledByKey = new Map(input.cancelledOverrides.map(o => [`${o.marketId}|${o.date}`, o]))
  const blackoutByKey = new Map(input.blackouts.map(b => [`${b.marketId}|${b.date}`, b]))

  // v2.1: market identity lookup for make-up-day entries — a special override
  // only renders for a market the vendor already has a relationship with.
  const marketInfo = new Map<string, { name: string; marketType: string }>()
  for (const s of input.schedules) marketInfo.set(s.marketId, { name: s.marketName, marketType: s.marketType })
  for (const dc of input.dateCommitments) {
    if (!marketInfo.has(dc.marketId)) marketInfo.set(dc.marketId, { name: dc.marketName, marketType: dc.marketType })
  }

  const days: StripDay[] = []
  for (const date of dates) {
    const dow = dayOfWeekOf(date)
    const entries: StripEntry[] = []
    const has = (marketId: string) => entries.some(e => e.marketId === marketId)

    // Paid, date-native commitments first — they outrank a weekly projection
    // of the same market+date (the park webhook creates a schedule row for
    // every paid booking, so both exist; show the paid fact once).
    for (const dc of input.dateCommitments) {
      if (dc.date !== date) continue
      entries.push({
        marketId: dc.marketId,
        name: dc.marketName,
        kind: dc.kind,
        marketType: dc.marketType,
        startTime: dc.startTime ? padTime(dc.startTime) : null,
        endTime: dc.endTime ? padTime(dc.endTime) : null,
        status: 'on',
        note: null,
      })
    }

    // v2.1: an unpaid standing occurrence is a real (conditional) commitment —
    // it outranks the weekly projection the same way a paid day does, but
    // renders as payment_due with the pay-by date.
    for (const po of input.pendingOccurrences ?? []) {
      if (po.date !== date || has(po.marketId)) continue
      entries.push({
        marketId: po.marketId,
        name: po.marketName,
        kind: 'park_booking',
        marketType: po.marketType,
        startTime: po.startTime ? padTime(po.startTime) : null,
        endTime: po.endTime ? padTime(po.endTime) : null,
        status: 'payment_due',
        note: `Pay by ${po.payBy} to keep your spot`,
      })
    }

    for (const s of input.schedules) {
      if (s.dayOfWeek !== dow) continue
      if (has(s.marketId)) continue
      entries.push({
        marketId: s.marketId,
        name: s.marketName,
        kind: s.kind,
        marketType: s.marketType,
        startTime: padTime(s.startTime),
        endTime: padTime(s.endTime),
        status: 'on',
        note: null,
      })
    }

    // v2.1: make-up days the market added ('special' overrides). Informational
    // — the vendor sees the market runs that day; booth weeks are not extended
    // and no attendance is implied. Hours come from the vendor's schedule for
    // that weekday when one exists (rare — make-up days usually fall off-DOW).
    for (const so of input.specialOverrides ?? []) {
      if (so.date !== date || has(so.marketId)) continue
      const m = marketInfo.get(so.marketId)
      if (!m) continue // no relationship with this market — not the vendor's news
      const sched = input.schedules.find(s => s.marketId === so.marketId && s.dayOfWeek === dow)
      entries.push({
        marketId: so.marketId,
        name: m.name,
        kind: 'schedule',
        marketType: m.marketType,
        startTime: sched ? padTime(sched.startTime) : null,
        endTime: sched ? padTime(sched.endTime) : null,
        status: 'on',
        note: 'Make-up day added by the market',
      })
    }

    for (const ev of input.events) {
      if (date < ev.startDate || date > ev.endDate) continue
      entries.push({
        marketId: ev.marketId,
        name: ev.name,
        kind: 'event',
        marketType: 'event',
        startTime: ev.startTime ? padTime(ev.startTime) : null,
        endTime: ev.endTime ? padTime(ev.endTime) : null,
        status: 'on',
        note: null,
      })
    }

    // Strike layers — an entry is kept and explained, never silently dropped.
    // Strikes also override payment_due: a cancelled/skipped day is the more
    // important fact than an open pay-by window on it.
    for (const e of entries) {
      if (e.kind === 'event') continue // blackouts/cancellations never apply to the event itself
      const b = blackoutByKey.get(`${e.marketId}|${date}`)
      if (b) {
        e.status = 'skipped_for_event'
        e.note = b.sourceEventName ? `Skipped — you're at ${b.sourceEventName}` : 'Skipped for this date'
        continue
      }
      const c = cancelledByKey.get(`${e.marketId}|${date}`)
      if (c) {
        e.status = 'cancelled_by_market'
        // v2.1: name the manager's advisory make-up date when the override has one.
        e.note = c.rescheduleDate
          ? `This day was cancelled by the market — make-up day ${c.rescheduleDate}`
          : 'This day was cancelled by the market'
      }
    }

    entries.sort((a, b) =>
      (a.startTime ?? '99') < (b.startTime ?? '99') ? -1
      : (a.startTime ?? '99') > (b.startTime ?? '99') ? 1
      : a.name.localeCompare(b.name)
    )
    days.push({ date, entries })
  }
  return days
}

// ── loader ───────────────────────────────────────────────────────────────

type MarketEmbed = { id?: string; name: string; market_type: string } | { id?: string; name: string; market_type: string }[] | null
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

export async function loadVendorWeekStrip(
  service: SupabaseClient,
  vendorProfileId: string,
  vertical: string,
  startDate: string,
  days = 14
): Promise<StripDay[]> {
  const dates = datesBetween(startDate, shiftDate(startDate, days - 1))
  const minDate = dates[0]!
  const maxDate = dates[dates.length - 1]!
  const dows = new Set(dates.map(dayOfWeekOf))

  // 1. Active weekly schedules (vendor time overrides win) — traditional
  //    markets and parks. Event-market schedule rows are excluded: an event's
  //    presence on the strip is the selection, handled in (4).
  const { data: vmsRows } = await observed(service
    .from('vendor_market_schedules')
    .select(`
      market_id, vendor_start_time, vendor_end_time,
      markets!inner ( id, name, market_type, vertical_id ),
      market_schedules!inner ( day_of_week, start_time, end_time, active )
    `)
    .eq('vendor_profile_id', vendorProfileId)
    .eq('is_active', true), { table: 'vendor_market_schedules' })

  const schedules: StripScheduleInput[] = []
  for (const r of vmsRows ?? []) {
    const m = one(r.markets as (MarketEmbed & { vertical_id?: string }) | null)
    const ms = one(r.market_schedules as { day_of_week: number; start_time: string; end_time: string; active: boolean | null } | { day_of_week: number; start_time: string; end_time: string; active: boolean | null }[] | null)
    if (!m || !ms || ms.active === false) continue
    if (m.market_type === 'event') continue
    if ((m as { vertical_id?: string }).vertical_id !== vertical) continue
    if (!dows.has(ms.day_of_week)) continue
    schedules.push({
      marketId: r.market_id as string,
      marketName: m.name,
      marketType: m.market_type,
      kind: 'schedule',
      dayOfWeek: ms.day_of_week,
      startTime: (r.vendor_start_time as string | null) ?? ms.start_time,
      endTime: (r.vendor_end_time as string | null) ?? ms.end_time,
    })
  }

  // 2. The vendor's own private-pickup windows.
  const { data: ppRows } = await observed(service
    .from('markets')
    .select('id, name, market_type, market_schedules ( day_of_week, start_time, end_time, active )')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('market_type', 'private_pickup')
    .eq('vertical_id', vertical)
    .eq('status', 'active'), { table: 'markets' })
  for (const m of ppRows ?? []) {
    for (const s of (m.market_schedules as Array<{ day_of_week: number; start_time: string; end_time: string; active: boolean | null }> | null) ?? []) {
      if (s.active === false || !dows.has(s.day_of_week)) continue
      schedules.push({
        marketId: m.id as string,
        marketName: m.name as string,
        marketType: 'private_pickup',
        kind: 'private_pickup',
        dayOfWeek: s.day_of_week,
        startTime: s.start_time,
        endTime: s.end_time,
      })
    }
  }

  // 3. Paid, date-native commitments: park-spot days (not barred) and booth
  //    weeks. Hours come from the location's schedule on that weekday.
  const dateCommitments: StripDateInput[] = []
  const [{ data: parkRows }, { data: boothRows }] = await Promise.all([
    // v2.1: pending_payment included — but only standing-occurrence rows
    // become entries (an unpaid ONE-OFF booking is an abandoned checkout,
    // not a commitment); filtered below.
    observed(service
      .from('park_spot_bookings')
      .select('market_id, booking_date, status, standing_reservation_id, markets:market_id ( id, name, market_type )')
      .eq('vendor_profile_id', vendorProfileId)
      .in('status', ['paid', 'pending_payment'])
      .is('manager_barred_at', null)
      .in('booking_date', dates), { table: 'park_spot_bookings' }),
    observed(service
      .from('weekly_booth_rentals')
      .select('market_id, week_start_date, markets:market_id ( id, name, market_type )')
      .eq('vendor_profile_id', vendorProfileId)
      .eq('status', 'paid')
      .gte('week_start_date', shiftDate(minDate, -6))
      .lte('week_start_date', maxDate), { table: 'weekly_booth_rentals' }),
  ])

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
      hoursByMarketDow.set(key, {
        start: prev && prev.start < (s.start_time as string) ? prev.start : (s.start_time as string),
        end: prev && prev.end > (s.end_time as string) ? prev.end : (s.end_time as string),
      })
    }
  }
  const hoursFor = (marketId: string, date: string) => hoursByMarketDow.get(`${marketId}|${dayOfWeekOf(date)}`)

  const pendingOccurrences: StripPendingOccurrenceInput[] = []
  for (const r of parkRows ?? []) {
    const m = one(r.markets as MarketEmbed)
    if (!m) continue
    const h = hoursFor(r.market_id as string, r.booking_date as string)
    if (r.status === 'pending_payment') {
      if (!r.standing_reservation_id) continue // abandoned one-off checkout
      pendingOccurrences.push({
        marketId: r.market_id as string,
        marketName: m.name,
        marketType: m.market_type,
        date: r.booking_date as string,
        payBy: prepayCutoffISO(r.booking_date as string),
        startTime: h?.start ?? null,
        endTime: h?.end ?? null,
      })
      continue
    }
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
    for (const date of dates) {
      if (date < weekStart || date > shiftDate(weekStart, 6)) continue
      const h = hoursFor(r.market_id as string, date)
      if (!h) continue // market not open that weekday
      dateCommitments.push({
        kind: 'booth',
        marketId: r.market_id as string,
        marketName: m.name,
        marketType: m.market_type,
        date,
        startTime: h.start,
        endTime: h.end,
      })
    }
  }

  // 4. SELECTED events in the window (same rule as the event pill).
  const { data: evRows } = await observed(service
    .from('market_vendors')
    .select('market_id, is_backup, organizer_selected_at, markets:market_id ( id, name, market_type, vertical_id, event_start_date, event_end_date, catering_request_id )')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('response_status', 'accepted')
    .not('organizer_selected_at', 'is', null), { table: 'market_vendors' })
  const events: StripEventInput[] = []
  const reqIds: string[] = []
  const pending: Array<{ ev: StripEventInput; reqId: string | null }> = []
  for (const r of evRows ?? []) {
    const m = one(r.markets as ({ id: string; name: string; market_type: string; vertical_id: string; event_start_date: string | null; event_end_date: string | null; catering_request_id: string | null }) | ({ id: string; name: string; market_type: string; vertical_id: string; event_start_date: string | null; event_end_date: string | null; catering_request_id: string | null })[] | null)
    if (!m || m.market_type !== 'event' || !m.event_start_date || r.is_backup === true) continue
    if (m.vertical_id !== vertical) continue
    const startDateEv = m.event_start_date
    const endDateEv = m.event_end_date ?? startDateEv
    if (startDateEv > maxDate || endDateEv < minDate) continue
    const ev: StripEventInput = { marketId: m.id, name: m.name, startDate: startDateEv, endDate: endDateEv, startTime: null, endTime: null }
    pending.push({ ev, reqId: m.catering_request_id })
    if (m.catering_request_id) reqIds.push(m.catering_request_id)
  }
  if (reqIds.length > 0) {
    const { data: reqs } = await observed(service
      .from('catering_requests')
      .select('id, event_start_time, event_end_time')
      .in('id', reqIds), { table: 'catering_requests' })
    const byId = new Map((reqs ?? []).map(q => [q.id as string, q]))
    for (const p of pending) {
      const q = p.reqId ? byId.get(p.reqId) : undefined
      if (q) {
        p.ev.startTime = (q.event_start_time as string | null) ?? null
        p.ev.endTime = (q.event_end_time as string | null) ?? null
      }
    }
  }
  for (const p of pending) events.push(p.ev)

  // 5. Strike layers: manager-cancelled days + the vendor's blackouts.
  //    v2.1: the same query now also carries 'special' make-up days and the
  //    cancelled rows' advisory reschedule_date.
  const involvedMarketIds = new Set<string>([
    ...schedules.map(s => s.marketId),
    ...dateCommitments.map(d => d.marketId),
    ...pendingOccurrences.map(p => p.marketId),
  ])
  const cancelledOverrides: Array<{ marketId: string; date: string; rescheduleDate: string | null }> = []
  const specialOverrides: Array<{ marketId: string; date: string }> = []
  if (involvedMarketIds.size > 0) {
    const { data: ovRows } = await observed(service
      .from('market_date_overrides')
      .select('market_id, override_date, status, reschedule_date')
      .in('market_id', [...involvedMarketIds])
      .gte('override_date', minDate)
      .lte('override_date', maxDate)
      .in('status', ['cancelled', 'special']), { table: 'market_date_overrides' })
    for (const o of ovRows ?? []) {
      if (o.status === 'special') {
        specialOverrides.push({ marketId: o.market_id as string, date: o.override_date as string })
      } else {
        cancelledOverrides.push({
          marketId: o.market_id as string,
          date: o.override_date as string,
          rescheduleDate: (o.reschedule_date as string | null) ?? null,
        })
      }
    }
  }

  const { data: boRows } = await observed(service
    .from('vendor_date_blackouts')
    .select('market_id, blackout_date, source_event_market_id')
    .eq('vendor_profile_id', vendorProfileId)
    .gte('blackout_date', minDate)
    .lte('blackout_date', maxDate), { table: 'vendor_date_blackouts' })
  const sourceEventIds = [...new Set((boRows ?? []).map(b => b.source_event_market_id as string | null).filter(Boolean))] as string[]
  const eventNameById = new Map<string, string>()
  if (sourceEventIds.length > 0) {
    const { data: evNames } = await observed(service
      .from('markets')
      .select('id, name')
      .in('id', sourceEventIds), { table: 'markets' })
    for (const e of evNames ?? []) eventNameById.set(e.id as string, e.name as string)
  }
  const blackouts = (boRows ?? []).map(b => ({
    marketId: b.market_id as string,
    date: b.blackout_date as string,
    sourceEventName: b.source_event_market_id ? eventNameById.get(b.source_event_market_id as string) ?? null : null,
  }))

  return assembleStrip(dates, { schedules, dateCommitments, events, cancelledOverrides, blackouts, specialOverrides, pendingOccurrences })
}
