import { describe, it, expect } from 'vitest'
import { buildManagerStripDays, sundayOf, addDays, dayOfWeekOf } from '../manager-week-strip'

/**
 * Manager next-14-days strip (owner 2026-09-19, OB-029 part D). The spec:
 *  - one line per OPERATING date in the window: a weekday the active schedule
 *    lists (inside the season) or a manager-added 'special' date;
 *  - declared vendors count by weekday (declarations point at a schedule row);
 *  - booth weeks are SUNDAY-keyed — a paid week covers every date in it;
 *  - orders are counted as distinct ORDERS, not items;
 *  - a cancelled date is still listed, struck, with its make-up date.
 */

// 2026-09-20 is a Sunday.
const START = '2026-09-20'
const SCHED_WED = { id: 'wed', day_of_week: 3, start_time: '15:00', end_time: '19:00', active: true }
const SCHED_SAT = { id: 'sat', day_of_week: 6, start_time: '08:00', end_time: '12:00', active: true }
const SCHED_OLD_MON = { id: 'mon', day_of_week: 1, start_time: '08:00', end_time: '12:00', active: false }

const base = {
  start: START,
  seasonStart: null,
  seasonEnd: null,
  schedules: [SCHED_WED, SCHED_SAT, SCHED_OLD_MON],
  declarations: [],
  rentals: [],
  orders: [],
  overrides: [],
}

describe('date helpers', () => {
  it('sundayOf returns the Sunday that starts the booth week', () => {
    expect(dayOfWeekOf('2026-09-20')).toBe(0)
    expect(sundayOf('2026-09-23')).toBe('2026-09-20') // Wed → that Sunday
    expect(sundayOf('2026-09-26')).toBe('2026-09-20') // Sat → same week
    expect(sundayOf('2026-09-27')).toBe('2026-09-27') // next Sunday starts a new week
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
  })
})

describe('buildManagerStripDays', () => {
  it('lists only active operating weekdays in the 14-day window, in order', () => {
    const days = buildManagerStripDays(base)
    expect(days.map(d => d.date)).toEqual(['2026-09-23', '2026-09-26', '2026-09-30', '2026-10-03'])
    expect(days.every(d => d.status === 'on')).toBe(true)
    expect(days[0]!.startTime).toBe('15:00')
    // The inactive Monday row contributes nothing.
    expect(days.some(d => d.dayOfWeek === 1)).toBe(false)
  })

  it('respects the season window on both ends', () => {
    const days = buildManagerStripDays({ ...base, seasonStart: '2026-09-25', seasonEnd: '2026-09-30' })
    expect(days.map(d => d.date)).toEqual(['2026-09-26', '2026-09-30'])
  })

  it('counts declared vendors per weekday via the schedule row they picked', () => {
    const days = buildManagerStripDays({
      ...base,
      declarations: [{ schedule_id: 'sat' }, { schedule_id: 'sat' }, { schedule_id: 'wed' }, { schedule_id: 'mon' }],
    })
    const byDate = Object.fromEntries(days.map(d => [d.date, d]))
    expect(byDate['2026-09-23']!.declaredVendors).toBe(1)
    expect(byDate['2026-09-26']!.declaredVendors).toBe(2)
    expect(byDate['2026-09-30']!.declaredVendors).toBe(1) // same weekday next week
  })

  it('a paid booth week covers every operating date of its Sunday-keyed week; unpaid shown separately', () => {
    const days = buildManagerStripDays({
      ...base,
      rentals: [
        { week_start_date: '2026-09-20', status: 'paid' },
        { week_start_date: '2026-09-20', status: 'paid' },
        { week_start_date: '2026-09-20', status: 'pending_payment' },
        { week_start_date: '2026-09-27', status: 'paid' },
        { week_start_date: '2026-09-27', status: 'cancelled' },
      ],
    })
    const byDate = Object.fromEntries(days.map(d => [d.date, d]))
    expect(byDate['2026-09-23']!.paidBoothWeeks).toBe(2)
    expect(byDate['2026-09-23']!.unpaidBoothWeeks).toBe(1)
    expect(byDate['2026-09-26']!.paidBoothWeeks).toBe(2)
    expect(byDate['2026-09-30']!.paidBoothWeeks).toBe(1)
    expect(byDate['2026-09-30']!.unpaidBoothWeeks).toBe(0) // cancelled is neither
  })

  it('counts distinct orders, not items', () => {
    const days = buildManagerStripDays({
      ...base,
      orders: [
        { order_id: 'o1', pickup_date: '2026-09-26' },
        { order_id: 'o1', pickup_date: '2026-09-26' },
        { order_id: 'o2', pickup_date: '2026-09-26' },
        { order_id: 'o3', pickup_date: '2026-09-21' }, // not an operating day → not shown
      ],
    })
    const byDate = Object.fromEntries(days.map(d => [d.date, d]))
    expect(byDate['2026-09-26']!.ordersScheduled).toBe(2)
    expect(byDate['2026-09-21']).toBeUndefined()
  })

  it('a cancelled day stays listed, struck, with its make-up date; a special date is added', () => {
    const days = buildManagerStripDays({
      ...base,
      overrides: [
        { override_date: '2026-09-26', status: 'cancelled', reschedule_date: '2026-09-28' },
        { override_date: '2026-09-24', status: 'special', reschedule_date: null },
      ],
    })
    const byDate = Object.fromEntries(days.map(d => [d.date, d]))
    expect(byDate['2026-09-26']!.status).toBe('cancelled')
    expect(byDate['2026-09-26']!.note).toBe('Cancelled — make-up day 2026-09-28')
    expect(byDate['2026-09-24']!.status).toBe('special')
    expect(days.map(d => d.date)).toEqual(['2026-09-23', '2026-09-24', '2026-09-26', '2026-09-30', '2026-10-03'])
  })

  it('an empty schedule yields an empty strip (the card says so; it never hides)', () => {
    expect(buildManagerStripDays({ ...base, schedules: [] })).toEqual([])
  })
})
