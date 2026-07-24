import { describe, it, expect } from 'vitest'
import {
  PARK_SAME_DAY_CUTOFF_MINUTES,
  timeToMinutes,
  earliestOpenByDow,
  localMinutesOfDay,
  isPastSameDayCutoff,
  formatClockMinutes,
  denySameDayReason,
} from '../park-booking-window'

/**
 * Business rule (owner decision 2026-07-23, from tester feedback):
 * same-day park booking is allowed only (a) up to 1 hour before that day's
 * opening time and (b) for trucks with a completed past day at the park or
 * operator-reviewed documents.
 */
describe('park same-day booking window', () => {
  it('the cutoff is 1 hour before opening', () => {
    expect(PARK_SAME_DAY_CUTOFF_MINUTES).toBe(60)
  })

  describe('timeToMinutes', () => {
    it('parses Postgres TIME values', () => {
      expect(timeToMinutes('11:00:00')).toBe(660)
      expect(timeToMinutes('11:00')).toBe(660)
      expect(timeToMinutes('00:00:00')).toBe(0)
      expect(timeToMinutes('23:59:00')).toBe(1439)
      expect(timeToMinutes('9:30:00')).toBe(570)
    })

    it('returns null for unusable input rather than guessing a time', () => {
      expect(timeToMinutes(null)).toBeNull()
      expect(timeToMinutes(undefined)).toBeNull()
      expect(timeToMinutes('')).toBeNull()
      expect(timeToMinutes('noon')).toBeNull()
      expect(timeToMinutes('25:00:00')).toBeNull()
      expect(timeToMinutes('11:75:00')).toBeNull()
    })
  })

  describe('earliestOpenByDow', () => {
    it('maps each weekday to its opening time', () => {
      const map = earliestOpenByDow([
        { day_of_week: 6, start_time: '11:00:00' },
        { day_of_week: 0, start_time: '12:00:00' },
      ])
      expect(map.get(6)).toBe(660)
      expect(map.get(0)).toBe(720)
    })

    it('uses the EARLIEST slot when a day has several (lunch + dinner blocks)', () => {
      const map = earliestOpenByDow([
        { day_of_week: 6, start_time: '17:00:00' },
        { day_of_week: 6, start_time: '11:00:00' },
        { day_of_week: 6, start_time: '14:00:00' },
      ])
      expect(map.get(6)).toBe(660)
    })

    it('skips unparseable times instead of poisoning the day', () => {
      const map = earliestOpenByDow([
        { day_of_week: 3, start_time: 'whenever' },
        { day_of_week: 3, start_time: '10:00:00' },
      ])
      expect(map.get(3)).toBe(600)
    })

    it('omits days with no usable time at all', () => {
      const map = earliestOpenByDow([{ day_of_week: 2, start_time: 'bad' }])
      expect(map.has(2)).toBe(false)
    })
  })

  describe('isPastSameDayCutoff', () => {
    const OPEN_11AM = 660

    it('allows booking well before the cutoff', () => {
      expect(isPastSameDayCutoff(8 * 60, OPEN_11AM)).toBe(false)
    })

    it('allows booking AT the cutoff instant (10:00 for an 11:00 open)', () => {
      expect(isPastSameDayCutoff(600, OPEN_11AM)).toBe(false)
    })

    it('blocks one minute after the cutoff', () => {
      expect(isPastSameDayCutoff(601, OPEN_11AM)).toBe(true)
    })

    it('blocks once the park has opened', () => {
      expect(isPastSameDayCutoff(OPEN_11AM, OPEN_11AM)).toBe(true)
    })

    it('blocks after the park has already run for the day', () => {
      expect(isPastSameDayCutoff(20 * 60, OPEN_11AM)).toBe(true)
    })

    it('does not enforce a cutoff when the opening time is unknown', () => {
      expect(isPastSameDayCutoff(23 * 60, null)).toBe(false)
    })

    it('handles an early-morning open where the cutoff lands before midnight', () => {
      // Opens 00:30 — cutoff is 23:30 the PREVIOUS day, so any same-day
      // minute is already past it.
      expect(isPastSameDayCutoff(0, 30)).toBe(true)
      expect(isPastSameDayCutoff(29, 30)).toBe(true)
    })
  })

  describe('formatClockMinutes', () => {
    it('formats 12-hour clock times', () => {
      expect(formatClockMinutes(0)).toBe('12:00 AM')
      expect(formatClockMinutes(600)).toBe('10:00 AM')
      expect(formatClockMinutes(660)).toBe('11:00 AM')
      expect(formatClockMinutes(720)).toBe('12:00 PM')
      expect(formatClockMinutes(1035)).toBe('5:15 PM')
      expect(formatClockMinutes(1439)).toBe('11:59 PM')
    })
  })

  describe('denySameDayReason', () => {
    const OPEN_11AM = 660

    it('allows an established truck before the cutoff', () => {
      expect(denySameDayReason(true, 9 * 60, OPEN_11AM)).toBeNull()
    })

    it('refuses a truck with no completed day and no reviewed docs', () => {
      expect(denySameDayReason(false, 9 * 60, OPEN_11AM)).toBe('not_established')
    })

    it('reports the relationship reason FIRST when both apply', () => {
      // Telling an ineligible truck "you missed the cutoff" would send them
      // back tomorrow to hit a different wall.
      expect(denySameDayReason(false, 20 * 60, OPEN_11AM)).toBe('not_established')
    })

    it('refuses an established truck that missed the cutoff', () => {
      expect(denySameDayReason(true, 601, OPEN_11AM)).toBe('past_cutoff')
    })

    it('allows an established truck when the opening time is unknown', () => {
      expect(denySameDayReason(true, 23 * 60, null)).toBeNull()
    })
  })

  describe('localMinutesOfDay', () => {
    it('reads minutes-since-midnight off a park-timezone Date', () => {
      expect(localMinutesOfDay(new Date(2026, 6, 18, 10, 30))).toBe(630)
      expect(localMinutesOfDay(new Date(2026, 6, 18, 0, 0))).toBe(0)
      expect(localMinutesOfDay(new Date(2026, 6, 18, 23, 59))).toBe(1439)
    })
  })
})
