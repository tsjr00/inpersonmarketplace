/**
 * Schedule overlap detection tests.
 *
 * Business Rules Covered:
 * VJ-R14: Single-truck vendors cannot have overlapping schedules at different markets
 */
import { describe, it, expect } from 'vitest'
import {
  padTime,
  timesOverlap,
  findScheduleConflicts,
  dayOfWeekName,
  formatTimeDisplay,
  type ScheduleSlot,
} from '@/lib/utils/schedule-overlap'

// ── padTime ─────────────────────────────────────────────────────

describe('padTime', () => {
  it('pads HH:MM to HH:MM:SS', () => {
    expect(padTime('08:00')).toBe('08:00:00')
    expect(padTime('14:30')).toBe('14:30:00')
  })

  it('leaves HH:MM:SS unchanged', () => {
    expect(padTime('08:00:00')).toBe('08:00:00')
    expect(padTime('14:30:45')).toBe('14:30:45')
  })

  it('handles falsy input', () => {
    expect(padTime('')).toBe('')
  })
})

// ── timesOverlap ────────────────────────────────────────────────

describe('timesOverlap', () => {
  it('detects exact same times as overlap', () => {
    expect(timesOverlap('10:00', '14:00', '10:00', '14:00')).toBe(true)
  })

  it('detects partial overlap (A starts during B)', () => {
    expect(timesOverlap('12:00', '16:00', '10:00', '14:00')).toBe(true)
  })

  it('detects partial overlap (B starts during A)', () => {
    expect(timesOverlap('10:00', '14:00', '12:00', '16:00')).toBe(true)
  })

  it('detects A fully inside B', () => {
    expect(timesOverlap('11:00', '13:00', '10:00', '14:00')).toBe(true)
  })

  it('detects B fully inside A', () => {
    expect(timesOverlap('10:00', '14:00', '11:00', '13:00')).toBe(true)
  })

  it('adjacent times (A ends when B starts) are NOT overlap', () => {
    expect(timesOverlap('10:00', '14:00', '14:00', '18:00')).toBe(false)
  })

  it('adjacent times (B ends when A starts) are NOT overlap', () => {
    expect(timesOverlap('14:00', '18:00', '10:00', '14:00')).toBe(false)
  })

  it('no overlap when completely separate', () => {
    expect(timesOverlap('08:00', '10:00', '14:00', '18:00')).toBe(false)
  })

  it('handles mixed HH:MM and HH:MM:SS formats', () => {
    expect(timesOverlap('10:00', '14:00', '10:00:00', '14:00:00')).toBe(true)
    expect(timesOverlap('10:00', '14:00:00', '14:00', '18:00:00')).toBe(false)
  })
})

// ── findScheduleConflicts ───────────────────────────────────────

describe('findScheduleConflicts', () => {
  const makeSlot = (overrides: Partial<ScheduleSlot>): ScheduleSlot => ({
    marketId: 'market-1',
    marketName: 'Market 1',
    scheduleId: 'sched-1',
    dayOfWeek: 2, // Tuesday
    startTime: '10:00:00',
    endTime: '14:00:00',
    ...overrides,
  })

  it('finds conflict: same day, different market, overlapping times', () => {
    const candidate = makeSlot({
      marketId: 'market-2',
      marketName: 'Market 2',
      scheduleId: 'sched-2',
      startTime: '12:00:00',
      endTime: '16:00:00',
    })
    const existing = [makeSlot({})]
    const conflicts = findScheduleConflicts(candidate, existing)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].existing.marketName).toBe('Market 1')
    expect(conflicts[0].incoming.marketName).toBe('Market 2')
  })

  it('no conflict: same day, SAME market (multiple slots at one market OK)', () => {
    const candidate = makeSlot({
      scheduleId: 'sched-2',
      startTime: '12:00:00',
      endTime: '16:00:00',
    })
    const existing = [makeSlot({})]
    expect(findScheduleConflicts(candidate, existing)).toHaveLength(0)
  })

  it('no conflict: different day, overlapping times', () => {
    const candidate = makeSlot({
      marketId: 'market-2',
      marketName: 'Market 2',
      scheduleId: 'sched-2',
      dayOfWeek: 3, // Wednesday, not Tuesday
    })
    const existing = [makeSlot({})]
    expect(findScheduleConflicts(candidate, existing)).toHaveLength(0)
  })

  it('no conflict: same day, different market, adjacent times', () => {
    const candidate = makeSlot({
      marketId: 'market-2',
      marketName: 'Market 2',
      scheduleId: 'sched-2',
      startTime: '14:00:00',
      endTime: '18:00:00',
    })
    const existing = [makeSlot({})] // ends at 14:00
    expect(findScheduleConflicts(candidate, existing)).toHaveLength(0)
  })

  it('finds multiple conflicts across markets', () => {
    const candidate = makeSlot({
      marketId: 'market-3',
      marketName: 'Market 3',
      scheduleId: 'sched-3',
      startTime: '11:00:00',
      endTime: '15:00:00',
    })
    const existing = [
      makeSlot({ marketId: 'market-1', marketName: 'Market 1', scheduleId: 'sched-1' }),
      makeSlot({ marketId: 'market-2', marketName: 'Market 2', scheduleId: 'sched-2', startTime: '13:00:00', endTime: '17:00:00' }),
    ]
    expect(findScheduleConflicts(candidate, existing)).toHaveLength(2)
  })

  it('empty existing list returns no conflicts', () => {
    const candidate = makeSlot({})
    expect(findScheduleConflicts(candidate, [])).toHaveLength(0)
  })
})

// ── Formatting helpers ──────────────────────────────────────────

describe('dayOfWeekName', () => {
  it('maps day numbers to names', () => {
    expect(dayOfWeekName(0)).toBe('Sunday')
    expect(dayOfWeekName(1)).toBe('Monday')
    expect(dayOfWeekName(6)).toBe('Saturday')
  })

  it('handles out-of-range gracefully', () => {
    expect(dayOfWeekName(7)).toBe('Day 7')
  })
})

describe('formatTimeDisplay', () => {
  it('formats morning times', () => {
    expect(formatTimeDisplay('08:00:00')).toBe('8:00 AM')
    expect(formatTimeDisplay('11:30:00')).toBe('11:30 AM')
  })

  it('formats afternoon times', () => {
    expect(formatTimeDisplay('14:00:00')).toBe('2:00 PM')
    expect(formatTimeDisplay('18:30:00')).toBe('6:30 PM')
  })

  it('handles noon and midnight', () => {
    expect(formatTimeDisplay('12:00:00')).toBe('12:00 PM')
    expect(formatTimeDisplay('00:00:00')).toBe('12:00 AM')
  })

  it('handles HH:MM format', () => {
    expect(formatTimeDisplay('14:00')).toBe('2:00 PM')
  })
})
