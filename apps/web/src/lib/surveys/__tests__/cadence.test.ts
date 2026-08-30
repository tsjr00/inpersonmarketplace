/**
 * Survey cadence (owner 2026-08-29): vendors weekly, buyers after purchases
 * 1 and 2 then weekly. Week = Monday→Sunday, fires Sunday 18:00 local.
 */
import { describe, it, expect } from 'vitest'
import { lastEndedWeek, datesInWindow, lastDateOnDows, isEarlyBuyerCount, formatWeekDisplay, EARLY_BUYER_MAX_ORDERS } from '../cadence'

describe('lastEndedWeek', () => {
  // 2026-08-30 is a Sunday.
  it('on Sunday before 18:00 the CURRENT week has not ended — use the previous one', () => {
    expect(lastEndedWeek('2026-08-30T17:59:00')).toEqual({ weekStart: '2026-08-17', weekEnd: '2026-08-23' })
  })
  it('on Sunday at/after 18:00 the current week has ended', () => {
    expect(lastEndedWeek('2026-08-30T18:00:00')).toEqual({ weekStart: '2026-08-24', weekEnd: '2026-08-30' })
  })
  it('Monday through Saturday evaluate the week that ended last Sunday', () => {
    expect(lastEndedWeek('2026-08-31T09:00:00')).toEqual({ weekStart: '2026-08-24', weekEnd: '2026-08-30' }) // Mon
    expect(lastEndedWeek('2026-09-05T23:30:00')).toEqual({ weekStart: '2026-08-24', weekEnd: '2026-08-30' }) // Sat
  })
  it('rejects garbage', () => {
    expect(lastEndedWeek('not a date')).toBeNull()
  })
})

describe('datesInWindow / lastDateOnDows', () => {
  const week = { weekStart: '2026-08-24', weekEnd: '2026-08-30' }
  it('enumerates the seven days', () => {
    expect(datesInWindow(week)).toEqual([
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30',
    ])
  })
  it('stores the weekly row against the LAST attended day', () => {
    expect(lastDateOnDows(week, [2, 4])).toBe('2026-08-27') // Tue + Thu → Thu
    expect(lastDateOnDows(week, [6])).toBe('2026-08-29')
    expect(lastDateOnDows(week, [0])).toBe('2026-08-30')
    expect(lastDateOnDows(week, [])).toBeNull()
  })
})

describe('isEarlyBuyerCount', () => {
  it('first and second purchases are immediate; the third moves to weekly', () => {
    expect(EARLY_BUYER_MAX_ORDERS).toBe(2)
    expect(isEarlyBuyerCount(1)).toBe(true)
    expect(isEarlyBuyerCount(2)).toBe(true)
    expect(isEarlyBuyerCount(3)).toBe(false)
  })
})

describe('formatWeekDisplay', () => {
  it('reads as a range', () => {
    expect(formatWeekDisplay({ weekStart: '2026-08-24', weekEnd: '2026-08-30' })).toBe('Aug 24 – Aug 30')
  })
})
