import { describe, it, expect } from 'vitest'
import { todayInTimezone, tomorrowInTimezone, addDaysToDateString, DEFAULT_TIMEZONE } from '../market-dates'

describe('market-dates timezone helpers', () => {
  // 2026-07-07T02:00:00Z = 21:00 CT / 22:00 ET on the 6th — UTC has already
  // rolled to the 7th but both US markets are still on the 6th. This is the
  // exact drift window the fix targets.
  const boundary = new Date('2026-07-07T02:00:00Z')

  it('todayInTimezone returns the market-local date, not the UTC date', () => {
    expect(todayInTimezone('America/Chicago', boundary)).toBe('2026-07-06')
    expect(todayInTimezone('America/New_York', boundary)).toBe('2026-07-06')
    expect(todayInTimezone('America/Los_Angeles', boundary)).toBe('2026-07-06')
  })

  it('tomorrowInTimezone is one market-local day ahead', () => {
    expect(tomorrowInTimezone('America/Chicago', boundary)).toBe('2026-07-07')
    expect(tomorrowInTimezone('America/New_York', boundary)).toBe('2026-07-07')
  })

  it('null/empty timezone falls back to America/Chicago', () => {
    expect(todayInTimezone(null, boundary)).toBe('2026-07-06')
    expect(todayInTimezone(undefined, boundary)).toBe('2026-07-06')
    expect(todayInTimezone('', boundary)).toBe('2026-07-06')
    expect(DEFAULT_TIMEZONE).toBe('America/Chicago')
  })

  it('midday UTC agrees with market date (no drift outside the window)', () => {
    const midday = new Date('2026-07-07T18:00:00Z') // 13:00 CT
    expect(todayInTimezone('America/Chicago', midday)).toBe('2026-07-07')
    expect(tomorrowInTimezone('America/Chicago', midday)).toBe('2026-07-08')
  })

  it('handles month/year rollover across the boundary', () => {
    // 2027-01-01T04:00:00Z = 22:00 CT on 2026-12-31
    const nye = new Date('2027-01-01T04:00:00Z')
    expect(todayInTimezone('America/Chicago', nye)).toBe('2026-12-31')
    expect(tomorrowInTimezone('America/Chicago', nye)).toBe('2027-01-01')
  })

  it('addDaysToDateString does pure calendar math (DST-safe)', () => {
    expect(addDaysToDateString('2026-07-06', 7)).toBe('2026-07-13')
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01') // year rollover
    expect(addDaysToDateString('2026-03-07', 1)).toBe('2026-03-08') // spring-forward weekend, no shift
    expect(addDaysToDateString('2026-07-06', 0)).toBe('2026-07-06')
  })
})
