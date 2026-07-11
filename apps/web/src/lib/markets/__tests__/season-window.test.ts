import { describe, it, expect } from 'vitest'
import {
  hasSeasonWindow,
  isWithinSeason,
  isBeforeSeason,
  isAfterSeason,
} from '@/lib/markets/season-window'

/**
 * Business rule: a market's operating window (markets.season_start/end) bounds
 * where it operates. A NULL bound is open on that side; NULL/NULL = year-round.
 * These assert the RULE, not the current code — the vendor booth flow + manager
 * dashboard must not surface operating/bookable dates outside the window.
 */
describe('season-window helpers', () => {
  const START = '2026-08-29'
  const END = '2026-12-12'

  describe('hasSeasonWindow', () => {
    it('false when both bounds null (year-round)', () => {
      expect(hasSeasonWindow(null, null)).toBe(false)
    })
    it('true when only start set', () => {
      expect(hasSeasonWindow(START, null)).toBe(true)
    })
    it('true when only end set', () => {
      expect(hasSeasonWindow(null, END)).toBe(true)
    })
  })

  describe('isWithinSeason (inclusive both ends)', () => {
    it('date before start is out', () => {
      expect(isWithinSeason('2026-07-11', START, END)).toBe(false)
    })
    it('start date itself is in', () => {
      expect(isWithinSeason(START, START, END)).toBe(true)
    })
    it('end date itself is in', () => {
      expect(isWithinSeason(END, START, END)).toBe(true)
    })
    it('date after end is out', () => {
      expect(isWithinSeason('2026-12-13', START, END)).toBe(false)
    })
    it('mid-season date is in', () => {
      expect(isWithinSeason('2026-10-01', START, END)).toBe(true)
    })
    it('null/null accepts any date (year-round)', () => {
      expect(isWithinSeason('2026-01-01', null, null)).toBe(true)
    })
    it('open-start: only end enforced', () => {
      expect(isWithinSeason('2020-01-01', null, END)).toBe(true)
      expect(isWithinSeason('2027-01-01', null, END)).toBe(false)
    })
    it('open-end: only start enforced', () => {
      expect(isWithinSeason('2026-07-11', START, null)).toBe(false)
      expect(isWithinSeason('2030-01-01', START, null)).toBe(true)
    })
  })

  describe('isBeforeSeason / isAfterSeason', () => {
    it('before season true only when strictly before start', () => {
      expect(isBeforeSeason('2026-07-11', START)).toBe(true)
      expect(isBeforeSeason(START, START)).toBe(false)
      expect(isBeforeSeason('2026-07-11', null)).toBe(false)
    })
    it('after season true only when strictly after end', () => {
      expect(isAfterSeason('2026-12-13', END)).toBe(true)
      expect(isAfterSeason(END, END)).toBe(false)
      expect(isAfterSeason('2026-12-13', null)).toBe(false)
    })
  })
})
