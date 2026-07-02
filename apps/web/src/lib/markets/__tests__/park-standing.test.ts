import { describe, it, expect } from 'vitest'
import {
  addDaysISO,
  nextOccurrenceOnOrAfter,
  prepayCutoffISO,
  isPastPrepayCutoff,
  countLiveStrikes,
  PARK_STANDING_PREPAY_CUTOFF_DAYS,
  PARK_STANDING_STRIKE_WINDOW_DAYS,
} from '@/lib/markets/park-standing'

const dow = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay()

describe('addDaysISO', () => {
  it('adds and subtracts days across month boundaries', () => {
    expect(addDaysISO('2026-07-01', 4)).toBe('2026-07-05')
    expect(addDaysISO('2026-07-01', -2)).toBe('2026-06-29')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2026-07-01', 0)).toBe('2026-07-01')
  })
})

describe('nextOccurrenceOnOrAfter', () => {
  it('returns the same date when it already matches the day-of-week', () => {
    const from = '2026-07-01'
    expect(nextOccurrenceOnOrAfter(dow(from), from)).toBe(from)
  })

  it('returns a date with the requested DOW within the next 7 days, on or after `from`', () => {
    const from = '2026-07-01'
    for (let d = 0; d <= 6; d++) {
      const occ = nextOccurrenceOnOrAfter(d, from)
      expect(dow(occ)).toBe(d)
      expect(occ >= from).toBe(true)
      expect(occ <= addDaysISO(from, 6)).toBe(true)
    }
  })
})

describe('prepay cutoff', () => {
  it('cutoff is CUTOFF_DAYS before the occurrence', () => {
    expect(PARK_STANDING_PREPAY_CUTOFF_DAYS).toBe(2)
    expect(prepayCutoffISO('2026-07-10')).toBe('2026-07-08')
  })

  it('is not past on or before the cutoff day, and past after it', () => {
    const booking = '2026-07-10' // cutoff 2026-07-08
    expect(isPastPrepayCutoff(booking, '2026-07-07')).toBe(false)
    expect(isPastPrepayCutoff(booking, '2026-07-08')).toBe(false) // pay-by day still allowed
    expect(isPastPrepayCutoff(booking, '2026-07-09')).toBe(true)
    expect(isPastPrepayCutoff(booking, '2026-07-10')).toBe(true)
  })
})

describe('countLiveStrikes', () => {
  const today = '2026-08-01' // window start = today - 32 = 2026-06-30

  it('counts events strictly inside the rolling window', () => {
    expect(PARK_STANDING_STRIKE_WINDOW_DAYS).toBe(32)
    expect(countLiveStrikes(['2026-07-15', '2026-07-20'], today, null)).toBe(2)
  })

  it('excludes events on or before the window start', () => {
    expect(countLiveStrikes(['2026-06-30', '2026-06-29'], today, null)).toBe(0)
    expect(countLiveStrikes(['2026-07-01'], today, null)).toBe(1)
  })

  it('excludes events on or before a manager reset', () => {
    const events = ['2026-07-15', '2026-07-20']
    expect(countLiveStrikes(events, today, '2026-07-18T10:00:00Z')).toBe(1)
    expect(countLiveStrikes(events, today, '2026-07-20T00:00:00Z')).toBe(0)
    expect(countLiveStrikes(events, today, '2026-07-01T00:00:00Z')).toBe(2)
  })

  it('returns 0 for no events', () => {
    expect(countLiveStrikes([], today, null)).toBe(0)
  })
})
