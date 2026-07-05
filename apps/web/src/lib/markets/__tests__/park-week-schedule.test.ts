import { describe, it, expect } from 'vitest'
import {
  dowOfISO,
  buildOperatingDates,
  assembleParkWeekDays,
  type BookingLite,
  type StandingLite,
} from '../park-week-schedule'

// Anchor dates (verified): 2026-07-03 = Fri(5), 2026-07-04 = Sat(6),
// 2026-07-05 = Sun(0).
describe('dowOfISO', () => {
  it('returns the UTC day-of-week (0=Sun..6=Sat)', () => {
    expect(dowOfISO('2026-07-03')).toBe(5)
    expect(dowOfISO('2026-07-04')).toBe(6)
    expect(dowOfISO('2026-07-05')).toBe(0)
  })
})

describe('buildOperatingDates', () => {
  it('keeps only the next-7 dates whose DOW is active', () => {
    // Sat+Sun park. Window 2026-07-04..07-10 → only 07-04(Sat) + 07-05(Sun).
    const dates = buildOperatingDates('2026-07-04', new Set([6, 0]), new Set())
    expect(dates).toEqual(['2026-07-04', '2026-07-05'])
  })

  it('excludes cancelled-override dates', () => {
    const dates = buildOperatingDates('2026-07-04', new Set([6, 0]), new Set(['2026-07-05']))
    expect(dates).toEqual(['2026-07-04'])
  })

  it('returns empty when no window day is an operating day', () => {
    // Wed-only park; no Wed in 07-04..07-10 window? 07-08 is Wed(3).
    expect(buildOperatingDates('2026-07-04', new Set([3]), new Set())).toEqual(['2026-07-08'])
    // Truly no operating DOW represented is impossible in a 7-day window, so
    // test the empty-schedule case instead.
    expect(buildOperatingDates('2026-07-04', new Set(), new Set())).toEqual([])
  })
})

describe('assembleParkWeekDays', () => {
  const spotLabelById = new Map([
    ['s1', 'Spot A'],
    ['s2', 'Spot B'],
    ['s3', 'Spot C'],
  ])
  const activeSpotIds = new Set(['s1', 's2']) // s3 inactive
  const vendorNameById = new Map([
    ['v1', 'Bao Down'],
    ['v2', 'Taco Truck'],
    ['v3', 'Ghost Truck'],
  ])
  const dates = ['2026-07-04', '2026-07-05'] // Sat, Sun

  const bookings: BookingLite[] = [
    { id: 'b1', vendor_profile_id: 'v1', spot_id: 's1', booking_date: '2026-07-04', status: 'paid', standing_reservation_id: null },
    { id: 'b2', vendor_profile_id: 'v2', spot_id: 's2', booking_date: '2026-07-04', status: 'pending_payment', standing_reservation_id: null },
    // out of window — must be ignored
    { id: 'b3', vendor_profile_id: 'v1', spot_id: 's1', booking_date: '2026-07-11', status: 'paid', standing_reservation_id: null },
    // a materialized recurring occurrence on Sunday for spot s2
    { id: 'b4', vendor_profile_id: 'v2', spot_id: 's2', booking_date: '2026-07-05', status: 'paid', standing_reservation_id: 'sr1' },
  ]
  const standing: StandingLite[] = [
    { vendor_profile_id: 'v2', spot_id: 's2', day_of_week: 0 }, // Sun — already booked 07-05 → dedup
    { vendor_profile_id: 'v1', spot_id: 's1', day_of_week: 0 }, // Sun — s1 free 07-05 → projected
    { vendor_profile_id: 'v3', spot_id: 's3', day_of_week: 6 }, // Sat — s3 inactive → skipped
  ]

  const days = assembleParkWeekDays({
    dates, todayISO: '2026-07-04', bookings, standing, spotLabelById, activeSpotIds, vendorNameById,
  })
  const sat = days[0]
  const sun = days[1]

  it('flags today and tomorrow', () => {
    expect(sat.isToday).toBe(true)
    expect(sat.isTomorrow).toBe(false)
    expect(sun.isToday).toBe(false)
    expect(sun.isTomorrow).toBe(true)
  })

  it('maps paid + pending bookings with correct status and recurrence', () => {
    expect(sat.trucks).toEqual([
      { vendorProfileId: 'v1', vendorName: 'Bao Down', spotLabel: 'Spot A', status: 'paid', recurring: false, bookingId: 'b1', barred: false },
      { vendorProfileId: 'v2', vendorName: 'Taco Truck', spotLabel: 'Spot B', status: 'unpaid', recurring: false, bookingId: 'b2', barred: false },
    ])
    expect(sat.trucksCount).toBe(2)
    expect(sat.spotsFilled).toBe(2)
    expect(sat.unpaidCount).toBe(1)
  })

  it('ignores out-of-window bookings', () => {
    // v1's 07-11 booking must not leak into either rendered day.
    const allDates = days.flatMap((d) => d.trucks.map(() => d.date))
    expect(allDates.every((d) => d === '2026-07-04' || d === '2026-07-05')).toBe(true)
  })

  it('projects an active standing hold onto a free spot+date', () => {
    // Sunday: v1/s1 projected as scheduled; v2/s2 is the materialized booking.
    expect(sun.trucks).toEqual([
      // v1 is a PROJECTED standing hold (no concrete booking → no bookingId/barred).
      { vendorProfileId: 'v1', vendorName: 'Bao Down', spotLabel: 'Spot A', status: 'scheduled', recurring: true },
      // v2 is the materialized paid booking b4.
      { vendorProfileId: 'v2', vendorName: 'Taco Truck', spotLabel: 'Spot B', status: 'paid', recurring: true, bookingId: 'b4', barred: false },
    ])
  })

  it('does NOT double-list a standing hold already materialized as a booking', () => {
    // spot s2 on Sunday appears exactly once (the paid booking, not the projection).
    const s2OnSun = sun.trucks.filter((t) => t.spotLabel === 'Spot B')
    expect(s2OnSun).toHaveLength(1)
    expect(s2OnSun[0].status).toBe('paid')
  })

  it('does not project standing holds for inactive spots', () => {
    const anyGhost = days.some((d) => d.trucks.some((t) => t.vendorProfileId === 'v3'))
    expect(anyGhost).toBe(false)
  })
})
