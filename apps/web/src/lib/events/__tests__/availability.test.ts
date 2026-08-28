/**
 * Event ↔ location availability — spec = the owner's rule (decisions.md
 * "Event ↔ location conflicts — availability rule", 2026-08-27):
 *   · conflict = same calendar date + overlapping hours
 *   · weekly schedules and paid park/booth days count; private pickups only
 *     when they hold open orders; other accepted events always
 *   · non-flagged vendor: open orders at the conflict → blocked; another
 *     event → blocked; otherwise must acknowledge the skip
 *   · flagged vendor (multiple_trucks): never blocked, must confirm both
 */
import { describe, it, expect } from 'vitest'
import {
  evaluateConflicts,
  hoursOverlap,
  dayOfWeekOf,
  datesBetween,
  describeConflict,
  type EvaluateInput,
} from '../availability'

// 2026-09-05 is a Saturday, 2026-09-06 a Sunday.
const SAT = '2026-09-05'
const SUN = '2026-09-06'

function base(over: Partial<EvaluateInput> = {}): EvaluateInput {
  return {
    eventDates: [SAT],
    eventStartTime: '11:00:00',
    eventEndTime: '14:00:00',
    multiCapable: false,
    schedules: [],
    dateCommitments: [],
    privatePickups: [],
    openWork: [],
    ...over,
  }
}

const parkSat = { marketId: 'park', marketName: 'Downtown Park', marketType: 'traditional', dayOfWeek: 6, startTime: '11:00', endTime: '14:00' }

describe('date helpers', () => {
  it('reads the weekday from a YYYY-MM-DD string without timezone drift', () => {
    expect(dayOfWeekOf(SAT)).toBe(6)
    expect(dayOfWeekOf(SUN)).toBe(0)
  })
  it('lists inclusive date ranges', () => {
    expect(datesBetween(SAT, SUN)).toEqual([SAT, SUN])
    expect(datesBetween(SAT, null)).toEqual([SAT])
  })
  it('treats adjacent hours as NOT overlapping and null hours as all day', () => {
    expect(hoursOverlap('11:00', '14:00', '14:00', '18:00')).toBe(false)
    expect(hoursOverlap('11:00', '14:00', '13:00', '18:00')).toBe(true)
    expect(hoursOverlap(null, null, '13:00', '18:00')).toBe(true)
    expect(hoursOverlap('11:00', '14:00', null, null)).toBe(true)
  })
})

describe('what counts as a conflict', () => {
  it('a weekly schedule on the event weekday with overlapping hours conflicts', () => {
    const r = evaluateConflicts(base({ schedules: [parkSat] }))
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0]).toMatchObject({ kind: 'schedule', marketId: 'park', date: SAT, paid: false })
  })

  it('a weekly schedule on a different weekday does not', () => {
    const r = evaluateConflicts(base({ schedules: [{ ...parkSat, dayOfWeek: 2 }] }))
    expect(r.conflicts).toEqual([])
  })

  it('same day, non-overlapping hours is NOT a conflict (a morning park and an evening event)', () => {
    const r = evaluateConflicts(base({ schedules: [{ ...parkSat, startTime: '07:00', endTime: '10:00' }] }))
    expect(r.conflicts).toEqual([])
  })

  it('an event with no times counts as all day', () => {
    const r = evaluateConflicts(base({ eventStartTime: null, eventEndTime: null, schedules: [{ ...parkSat, startTime: '07:00', endTime: '10:00' }] }))
    expect(r.conflicts).toHaveLength(1)
  })

  it('a paid park day outranks the schedule row for the same place and day', () => {
    const r = evaluateConflicts(base({
      schedules: [parkSat],
      dateCommitments: [{ kind: 'park_booking', marketId: 'park', marketName: 'Downtown Park', marketType: 'traditional', date: SAT, startTime: '11:00', endTime: '14:00' }],
    }))
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0]).toMatchObject({ kind: 'park_booking', paid: true })
  })

  it('a private pickup counts ONLY when it holds open orders that day', () => {
    const quiet = evaluateConflicts(base({ privatePickups: [{ marketId: 'farm', marketName: 'Farm Gate' }] }))
    expect(quiet.conflicts).toEqual([])
    const busy = evaluateConflicts(base({
      privatePickups: [{ marketId: 'farm', marketName: 'Farm Gate' }],
      openWork: [{ marketId: 'farm', date: SAT, orders: 2, boxPickups: 0 }],
    }))
    expect(busy.conflicts).toHaveLength(1)
    expect(busy.conflicts[0]).toMatchObject({ kind: 'private_pickup', openOrderCount: 2 })
  })

  it('multi-day events check every date', () => {
    const r = evaluateConflicts(base({
      eventDates: [SAT, SUN],
      schedules: [{ ...parkSat, dayOfWeek: 0, marketId: 'sunday-market', marketName: 'Sunday Market' }],
    }))
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0]!.date).toBe(SUN)
  })
})

describe('what the vendor must do', () => {
  it('non-flagged + no conflicts → nothing to acknowledge', () => {
    const r = evaluateConflicts(base())
    expect(r).toMatchObject({ blockedByOrders: false, blockedByEvent: false, needsSkipAcknowledgment: false, needsMultiConfirmation: false })
  })

  it('non-flagged + conflict without orders → must acknowledge the skip (blackout follows)', () => {
    const r = evaluateConflicts(base({ schedules: [parkSat] }))
    expect(r).toMatchObject({ blockedByOrders: false, blockedByEvent: false, needsSkipAcknowledgment: true, needsMultiConfirmation: false })
  })

  it('non-flagged + open orders at the conflict → blocked (orders first)', () => {
    const r = evaluateConflicts(base({ schedules: [parkSat], openWork: [{ marketId: 'park', date: SAT, orders: 1, boxPickups: 0 }] }))
    expect(r.blockedByOrders).toBe(true)
    expect(r.needsSkipAcknowledgment).toBe(false)
  })

  it('market-box pickups count as open work', () => {
    const r = evaluateConflicts(base({ schedules: [parkSat], openWork: [{ marketId: 'park', date: SAT, orders: 0, boxPickups: 1 }] }))
    expect(r.blockedByOrders).toBe(true)
  })

  it('non-flagged + another accepted event that day → blocked, never skippable', () => {
    const r = evaluateConflicts(base({
      dateCommitments: [{ kind: 'event', marketId: 'other-event', marketName: 'Other Fest', marketType: 'event', date: SAT, startTime: '12:00', endTime: '15:00' }],
    }))
    expect(r.blockedByEvent).toBe(true)
    expect(r.needsSkipAcknowledgment).toBe(false)
  })

  it('flagged (multiple trucks / can staff two locations) → never blocked, must confirm both', () => {
    const r = evaluateConflicts(base({
      multiCapable: true,
      schedules: [parkSat],
      openWork: [{ marketId: 'park', date: SAT, orders: 3, boxPickups: 0 }],
      dateCommitments: [{ kind: 'event', marketId: 'other-event', marketName: 'Other Fest', marketType: 'event', date: SAT, startTime: null, endTime: null }],
    }))
    expect(r).toMatchObject({ blockedByOrders: false, blockedByEvent: false, needsSkipAcknowledgment: false, needsMultiConfirmation: true })
    expect(r.conflicts).toHaveLength(2)
  })
})

describe('describeConflict', () => {
  it('names the place, the kind, the date, the hours and the open work', () => {
    const r = evaluateConflicts(base({ schedules: [parkSat], openWork: [{ marketId: 'park', date: SAT, orders: 2, boxPickups: 0 }] }))
    expect(describeConflict(r.conflicts[0]!)).toBe('Downtown Park (schedule, 2026-09-05 11:00–14:00, 2 open orders)')
  })
})
