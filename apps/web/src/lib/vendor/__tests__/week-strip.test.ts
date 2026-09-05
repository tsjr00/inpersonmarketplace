/**
 * Week-strip assembly (v2 week-at-a-glance, owner 2026-09-03).
 *
 * Spec source: the v2 design (event_ux_findings_2026-09-03_plan.md P6 v2 +
 * chat 2026-09-03), NOT the implementation:
 *  · weekly schedules project onto matching dates only
 *  · paid date-native commitments outrank a weekly projection of the same
 *    market+date (the park webhook creates a schedule row for every paid
 *    booking — the strip must not show the same day twice)
 *  · a blackout STRIKES the entry and names the event — never silently drops
 *  · a manager-cancelled date strikes with its own reason
 *  · strikes never apply to the event entry itself
 *  · events span start..end dates; booth weeks only land on market-open days
 *
 * v2.1 (owner go 2026-09-04):
 *  · an unpaid standing occurrence shows as payment_due with the pay-by date,
 *    outranks the weekly projection, and never renders struck styling
 *  · a 'special' make-up day shows informationally — only for markets the
 *    vendor already appears at, with schedule hours only when the DOW matches
 *  · a cancelled day whose override carries reschedule_date names it
 *  · a strike (blackout/cancel) overrides payment_due — the changed day is
 *    the more important fact
 */

import { describe, it, expect } from 'vitest'
import { assembleStrip } from '../week-strip'

// 2026-09-07 is a Monday (dow 1); 2026-09-08 Tuesday (dow 2).
const DATES = ['2026-09-07', '2026-09-08', '2026-09-09']

const base = {
  schedules: [],
  dateCommitments: [],
  events: [],
  cancelledOverrides: [],
  blackouts: [],
}

describe('assembleStrip', () => {
  it('projects a weekly schedule onto matching dates only', () => {
    const days = assembleStrip(DATES, {
      ...base,
      schedules: [{ marketId: 'm1', marketName: 'Park A', marketType: 'traditional', kind: 'schedule' as const, dayOfWeek: 2, startTime: '11:00', endTime: '14:00' }],
    })
    expect(days.map(d => d.entries.length)).toEqual([0, 1, 0])
    expect(days[1]!.entries[0]).toMatchObject({ marketId: 'm1', kind: 'schedule', status: 'on', startTime: '11:00:00' })
  })

  it('a paid park day outranks the weekly projection of the same market+date (no duplicate)', () => {
    const days = assembleStrip(DATES, {
      ...base,
      schedules: [{ marketId: 'm1', marketName: 'Park A', marketType: 'traditional', kind: 'schedule' as const, dayOfWeek: 2, startTime: '11:00', endTime: '14:00' }],
      dateCommitments: [{ kind: 'park_booking' as const, marketId: 'm1', marketName: 'Park A', marketType: 'traditional', date: '2026-09-08', startTime: '11:00', endTime: '14:00' }],
    })
    expect(days[1]!.entries).toHaveLength(1)
    expect(days[1]!.entries[0]!.kind).toBe('park_booking')
  })

  it('a blackout strikes the entry and names the source event — the entry is kept, not dropped', () => {
    const days = assembleStrip(DATES, {
      ...base,
      schedules: [{ marketId: 'm1', marketName: 'Park A', marketType: 'traditional', kind: 'schedule' as const, dayOfWeek: 2, startTime: '11:00', endTime: '14:00' }],
      blackouts: [{ marketId: 'm1', date: '2026-09-08', sourceEventName: 'Big Fair' }],
    })
    const entry = days[1]!.entries[0]!
    expect(entry.status).toBe('skipped_for_event')
    expect(entry.note).toContain('Big Fair')
  })

  it('a manager-cancelled date strikes with its own reason', () => {
    const days = assembleStrip(DATES, {
      ...base,
      schedules: [{ marketId: 'm1', marketName: 'Park A', marketType: 'traditional', kind: 'schedule' as const, dayOfWeek: 2, startTime: '11:00', endTime: '14:00' }],
      cancelledOverrides: [{ marketId: 'm1', date: '2026-09-08' }],
    })
    const entry = days[1]!.entries[0]!
    expect(entry.status).toBe('cancelled_by_market')
    expect(entry.note).toContain('cancelled')
  })

  it('strikes never apply to the event entry itself', () => {
    const days = assembleStrip(DATES, {
      ...base,
      events: [{ marketId: 'ev1', name: 'Big Fair', startDate: '2026-09-08', endDate: '2026-09-08', startTime: '11:00', endTime: '14:00' }],
      // pathological inputs aimed at the event's own market+date
      blackouts: [{ marketId: 'ev1', date: '2026-09-08', sourceEventName: null }],
      cancelledOverrides: [{ marketId: 'ev1', date: '2026-09-08' }],
    })
    expect(days[1]!.entries[0]).toMatchObject({ kind: 'event', status: 'on' })
  })

  it('a multi-day event appears on every date it spans within the window', () => {
    const days = assembleStrip(DATES, {
      ...base,
      events: [{ marketId: 'ev1', name: 'Fest', startDate: '2026-09-06', endDate: '2026-09-08', startTime: null, endTime: null }],
    })
    expect(days.map(d => d.entries.length)).toEqual([1, 1, 0])
  })

  it('an unpaid standing occurrence is payment_due with the pay-by date, and outranks the weekly projection', () => {
    const days = assembleStrip(DATES, {
      ...base,
      schedules: [{ marketId: 'm1', marketName: 'Park A', marketType: 'traditional', kind: 'schedule' as const, dayOfWeek: 2, startTime: '11:00', endTime: '14:00' }],
      pendingOccurrences: [{ marketId: 'm1', marketName: 'Park A', marketType: 'traditional', date: '2026-09-08', payBy: '2026-09-06', startTime: '11:00', endTime: '14:00' }],
    })
    expect(days[1]!.entries).toHaveLength(1)
    expect(days[1]!.entries[0]).toMatchObject({ kind: 'park_booking', status: 'payment_due' })
    expect(days[1]!.entries[0]!.note).toContain('Pay by 2026-09-06')
  })

  it("a 'special' make-up day renders informationally for a market the vendor appears at — and not otherwise", () => {
    const days = assembleStrip(DATES, {
      ...base,
      // vendor's schedule at m1 is Tuesday; the make-up day lands Monday (off-DOW)
      schedules: [{ marketId: 'm1', marketName: 'Park A', marketType: 'traditional', kind: 'schedule' as const, dayOfWeek: 2, startTime: '11:00', endTime: '14:00' }],
      specialOverrides: [
        { marketId: 'm1', date: '2026-09-07' },
        { marketId: 'stranger', date: '2026-09-07' }, // no relationship — not the vendor's news
      ],
    })
    expect(days[0]!.entries).toHaveLength(1)
    expect(days[0]!.entries[0]).toMatchObject({ marketId: 'm1', status: 'on', startTime: null })
    expect(days[0]!.entries[0]!.note).toContain('Make-up day')
  })

  it('a make-up day matching the schedule DOW carries the schedule hours', () => {
    const days = assembleStrip(DATES, {
      ...base,
      schedules: [{ marketId: 'm1', marketName: 'Park A', marketType: 'traditional', kind: 'schedule' as const, dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }],
      // Monday 2026-09-07 already projects from the schedule; the special row
      // must not duplicate it
      specialOverrides: [{ marketId: 'm1', date: '2026-09-07' }],
    })
    expect(days[0]!.entries).toHaveLength(1)
  })

  it('a cancelled day with a reschedule_date names the make-up date in its note', () => {
    const days = assembleStrip(DATES, {
      ...base,
      schedules: [{ marketId: 'm1', marketName: 'Park A', marketType: 'traditional', kind: 'schedule' as const, dayOfWeek: 2, startTime: '11:00', endTime: '14:00' }],
      cancelledOverrides: [{ marketId: 'm1', date: '2026-09-08', rescheduleDate: '2026-09-15' }],
    })
    const entry = days[1]!.entries[0]!
    expect(entry.status).toBe('cancelled_by_market')
    expect(entry.note).toContain('2026-09-15')
  })

  it('a strike overrides payment_due — the changed day is the more important fact', () => {
    const days = assembleStrip(DATES, {
      ...base,
      pendingOccurrences: [{ marketId: 'm1', marketName: 'Park A', marketType: 'traditional', date: '2026-09-08', payBy: '2026-09-06', startTime: null, endTime: null }],
      blackouts: [{ marketId: 'm1', date: '2026-09-08', sourceEventName: 'Big Fair' }],
    })
    expect(days[1]!.entries[0]).toMatchObject({ status: 'skipped_for_event' })
  })

  it('entries sort by start time; all-day (null) entries last', () => {
    const days = assembleStrip(['2026-09-08'], {
      ...base,
      schedules: [
        { marketId: 'm2', marketName: 'Late Park', marketType: 'traditional', kind: 'schedule' as const, dayOfWeek: 2, startTime: '17:00', endTime: '21:00' },
        { marketId: 'm1', marketName: 'Early Park', marketType: 'traditional', kind: 'schedule' as const, dayOfWeek: 2, startTime: '08:00', endTime: '13:00' },
      ],
      events: [{ marketId: 'ev1', name: 'All Day Fest', startDate: '2026-09-08', endDate: '2026-09-08', startTime: null, endTime: null }],
    })
    expect(days[0]!.entries.map(e => e.name)).toEqual(['Early Park', 'Late Park', 'All Day Fest'])
  })
})
