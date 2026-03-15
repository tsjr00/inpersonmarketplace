/**
 * Pickup Formatter Tests
 *
 * Tests the pure utility functions in src/types/pickup.ts that format
 * RPC output for display to buyers and vendors.
 *
 * Business Rules Covered:
 * VJ-R12: Listing availability calculation — display layer
 *
 * Run: npx vitest run src/lib/__tests__/pickup-formatters.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  groupPickupDatesByMarket,
  formatPickupTime,
  formatPickupDate,
  formatCutoffRemaining,
  getPickupDateColor,
  PICKUP_DATE_COLORS,
} from '@/types/pickup'
import type { AvailablePickupDate } from '@/types/pickup'

// =============================================================================
// formatPickupTime — HH:MM:SS → h:MM AM/PM
// =============================================================================

describe('formatPickupTime', () => {
  it('formats morning time', () => {
    expect(formatPickupTime('08:00:00')).toBe('8:00 AM')
  })

  it('formats afternoon time', () => {
    expect(formatPickupTime('13:30:00')).toBe('1:30 PM')
  })

  it('formats midnight', () => {
    expect(formatPickupTime('00:00:00')).toBe('12:00 AM')
  })

  it('formats noon', () => {
    expect(formatPickupTime('12:00:00')).toBe('12:00 PM')
  })

  it('formats time without seconds (HH:MM)', () => {
    expect(formatPickupTime('08:00')).toBe('8:00 AM')
  })

  it('formats 11 PM', () => {
    expect(formatPickupTime('23:00:00')).toBe('11:00 PM')
  })

  it('preserves minutes', () => {
    expect(formatPickupTime('14:45:00')).toBe('2:45 PM')
  })
})

// =============================================================================
// formatCutoffRemaining — hours → human-readable countdown
// =============================================================================

describe('formatCutoffRemaining', () => {
  it('returns Closed for null', () => {
    expect(formatCutoffRemaining(null)).toBe('Closed')
  })

  it('returns Closed for 0', () => {
    expect(formatCutoffRemaining(0)).toBe('Closed')
  })

  it('returns Closed for negative values', () => {
    expect(formatCutoffRemaining(-1)).toBe('Closed')
    expect(formatCutoffRemaining(-0.5)).toBe('Closed')
  })

  it('shows minutes for sub-hour values', () => {
    expect(formatCutoffRemaining(0.25)).toBe('15 min left')
    expect(formatCutoffRemaining(0.5)).toBe('30 min left')
  })

  it('shows minimum 1 minute', () => {
    expect(formatCutoffRemaining(0.016)).toBe('1 min left')
    expect(formatCutoffRemaining(0.001)).toBe('1 min left')
  })

  it('shows singular hour', () => {
    expect(formatCutoffRemaining(1)).toBe('1 hr left')
  })

  it('shows plural hours and floors', () => {
    expect(formatCutoffRemaining(5.7)).toBe('5 hrs left')
  })

  it('shows hours up to 23', () => {
    expect(formatCutoffRemaining(23)).toBe('23 hrs left')
  })

  it('shows days for 24+ hours', () => {
    expect(formatCutoffRemaining(24)).toBe('1 day left')
    expect(formatCutoffRemaining(48)).toBe('2 days left')
    expect(formatCutoffRemaining(72)).toBe('3 days left')
  })

  it('floors partial days', () => {
    expect(formatCutoffRemaining(36)).toBe('1 day left')
    expect(formatCutoffRemaining(50)).toBe('2 days left')
  })
})

// =============================================================================
// formatPickupDate — date string → Today/Tomorrow/formatted date
// =============================================================================

describe('formatPickupDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns Today for current date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-14T12:00:00'))

    expect(formatPickupDate('2026-03-14')).toBe('Today')
  })

  it('returns Tomorrow for next date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-14T12:00:00'))

    expect(formatPickupDate('2026-03-15')).toBe('Tomorrow')
  })

  it('returns formatted date for other dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-14T12:00:00'))

    const result = formatPickupDate('2026-03-20')
    // Should be "Fri, Mar 20" format
    expect(result).toContain('Fri')
    expect(result).toContain('Mar')
    expect(result).toContain('20')
  })

  it('returns formatted date for past dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-14T12:00:00'))

    const result = formatPickupDate('2026-03-10')
    expect(result).toContain('Tue')
    expect(result).toContain('Mar')
    expect(result).toContain('10')
  })
})

// =============================================================================
// groupPickupDatesByMarket — flat dates → grouped by market
// =============================================================================

describe('groupPickupDatesByMarket', () => {
  const makeDate = (overrides: Partial<AvailablePickupDate> = {}): AvailablePickupDate => ({
    market_id: 'market-1',
    market_name: 'Downtown Market',
    market_type: 'traditional',
    address: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    schedule_id: 'sched-1',
    day_of_week: 6,
    pickup_date: '2026-03-14',
    start_time: '08:00:00',
    end_time: '14:00:00',
    cutoff_at: '2026-03-13T14:00:00Z',
    is_accepting: true,
    hours_until_cutoff: 10,
    cutoff_hours: 18,
    ...overrides,
  })

  it('returns empty array for empty input', () => {
    expect(groupPickupDatesByMarket([])).toEqual([])
  })

  it('groups multiple dates under same market', () => {
    const dates = [
      makeDate({ pickup_date: '2026-03-14' }),
      makeDate({ pickup_date: '2026-03-21' }),
    ]

    const result = groupPickupDatesByMarket(dates)
    expect(result).toHaveLength(1)
    expect(result[0].market_id).toBe('market-1')
    expect(result[0].dates).toHaveLength(2)
  })

  it('separates dates from different markets', () => {
    const dates = [
      makeDate({ market_id: 'market-1', market_name: 'Downtown' }),
      makeDate({ market_id: 'market-2', market_name: 'Uptown' }),
    ]

    const result = groupPickupDatesByMarket(dates)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.market_id)).toContain('market-1')
    expect(result.map(r => r.market_id)).toContain('market-2')
  })

  it('preserves market metadata', () => {
    const dates = [makeDate({
      market_name: 'Test Market',
      market_type: 'event',
      address: '456 Oak Ave',
      city: 'Chicago',
      state: 'IL',
    })]

    const result = groupPickupDatesByMarket(dates)
    expect(result[0].market_name).toBe('Test Market')
    expect(result[0].market_type).toBe('event')
    expect(result[0].address).toBe('456 Oak Ave')
    expect(result[0].city).toBe('Chicago')
    expect(result[0].state).toBe('IL')
  })

  it('sorts dates within market by pickup_date', () => {
    const dates = [
      makeDate({ pickup_date: '2026-03-21' }),
      makeDate({ pickup_date: '2026-03-14' }),
      makeDate({ pickup_date: '2026-03-17' }),
    ]

    const result = groupPickupDatesByMarket(dates)
    expect(result[0].dates[0].pickup_date).toBe('2026-03-14')
    expect(result[0].dates[1].pickup_date).toBe('2026-03-17')
    expect(result[0].dates[2].pickup_date).toBe('2026-03-21')
  })

  it('sorts markets with accepting dates first', () => {
    const dates = [
      makeDate({ market_id: 'closed-market', market_name: 'AA Closed', is_accepting: false }),
      makeDate({ market_id: 'open-market', market_name: 'ZZ Open', is_accepting: true }),
    ]

    const result = groupPickupDatesByMarket(dates)
    expect(result[0].market_id).toBe('open-market')
    expect(result[1].market_id).toBe('closed-market')
  })

  it('sorts markets alphabetically when both have same accepting status', () => {
    const dates = [
      makeDate({ market_id: 'market-b', market_name: 'Bravo Market', is_accepting: true }),
      makeDate({ market_id: 'market-a', market_name: 'Alpha Market', is_accepting: true }),
    ]

    const result = groupPickupDatesByMarket(dates)
    expect(result[0].market_name).toBe('Alpha Market')
    expect(result[1].market_name).toBe('Bravo Market')
  })

  it('includes all date fields in grouped output', () => {
    const dates = [makeDate({
      schedule_id: 'sched-42',
      day_of_week: 3,
      pickup_date: '2026-03-18',
      start_time: '09:00:00',
      end_time: '15:00:00',
      cutoff_at: '2026-03-17T15:00:00Z',
      is_accepting: true,
      hours_until_cutoff: 12,
      cutoff_hours: 18,
    })]

    const result = groupPickupDatesByMarket(dates)
    const dateEntry = result[0].dates[0]
    expect(dateEntry.schedule_id).toBe('sched-42')
    expect(dateEntry.day_of_week).toBe(3)
    expect(dateEntry.pickup_date).toBe('2026-03-18')
    expect(dateEntry.start_time).toBe('09:00:00')
    expect(dateEntry.end_time).toBe('15:00:00')
    expect(dateEntry.cutoff_at).toBe('2026-03-17T15:00:00Z')
    expect(dateEntry.is_accepting).toBe(true)
    expect(dateEntry.hours_until_cutoff).toBe(12)
    expect(dateEntry.cutoff_hours).toBe(18)
  })
})

// =============================================================================
// getPickupDateColor — index → color from palette
// =============================================================================

describe('getPickupDateColor', () => {
  it('returns first color for index 0', () => {
    expect(getPickupDateColor(0)).toBe(PICKUP_DATE_COLORS[0])
  })

  it('wraps around when index exceeds palette length', () => {
    expect(getPickupDateColor(PICKUP_DATE_COLORS.length)).toBe(PICKUP_DATE_COLORS[0])
    expect(getPickupDateColor(PICKUP_DATE_COLORS.length + 1)).toBe(PICKUP_DATE_COLORS[1])
  })
})
