import { describe, it, expect } from 'vitest'
import {
  MIN_EVENT_LEAD_DAYS,
  RUSHED_EVENT_LEAD_DAYS,
  eventLeadDays,
  leadTimeStatus,
  earliestBookableDate,
} from '../events/lead-time'

// Fixed reference so nothing here depends on when it runs.
const NOW = new Date(Date.UTC(2026, 7, 9, 15, 30, 0)) // 2026-08-09, mid-afternoon UTC

/** Build a YYYY-MM-DD that is `n` days after NOW. */
function inDays(n: number): string {
  const d = new Date(Date.UTC(2026, 7, 9 + n))
  return d.toISOString().slice(0, 10)
}

describe('event lead time — the thresholds themselves', () => {
  // These are the BUSINESS RULE, set by the owner 2026-08-09, not an artifact of
  // the implementation. Lead time is a revenue lever: no runway means no
  // pre-orders, and pre-orders are what the platform earns on. If either number
  // is meant to move, the owner moves it — a failure here is a decision point,
  // not a value to update.
  it('hard floor is 10 days', () => {
    expect(MIN_EVENT_LEAD_DAYS).toBe(10)
  })

  it('rushed window runs up to 14 days', () => {
    expect(RUSHED_EVENT_LEAD_DAYS).toBe(14)
  })

  it('the warning window is a real band, not an empty one', () => {
    expect(RUSHED_EVENT_LEAD_DAYS).toBeGreaterThan(MIN_EVENT_LEAD_DAYS)
  })
})

describe('eventLeadDays', () => {
  it('counts whole calendar days ahead', () => {
    expect(eventLeadDays(inDays(0), NOW)).toBe(0)
    expect(eventLeadDays(inDays(1), NOW)).toBe(1)
    expect(eventLeadDays(inDays(10), NOW)).toBe(10)
    expect(eventLeadDays(inDays(365), NOW)).toBe(365)
  })

  it('is negative for past dates', () => {
    expect(eventLeadDays(inDays(-1), NOW)).toBe(-1)
    expect(eventLeadDays('2020-01-01', NOW)).toBeLessThan(0)
  })

  it('ignores the time of day — a late-afternoon submission is not a day short', () => {
    const earlyUTC = new Date(Date.UTC(2026, 7, 9, 0, 1, 0))
    const lateUTC = new Date(Date.UTC(2026, 7, 9, 23, 59, 0))
    expect(eventLeadDays('2026-08-19', earlyUTC)).toBe(10)
    expect(eventLeadDays('2026-08-19', lateUTC)).toBe(10)
  })

  it('crosses a DST boundary without drifting', () => {
    // US DST ends 2026-11-01. Counting across it must still be whole days.
    const oct = new Date(Date.UTC(2026, 9, 25, 12, 0, 0)) // 2026-10-25
    expect(eventLeadDays('2026-11-08', oct)).toBe(14)
  })

  it('rejects anything that is not YYYY-MM-DD', () => {
    for (const bad of ['', '   ', 'tomorrow', '08/19/2026', '2026-8-19', '2026-08-19T00:00:00']) {
      expect(eventLeadDays(bad, NOW), bad).toBeNull()
    }
  })

  it('rejects a date that looks well-formed but does not exist', () => {
    // Date.UTC silently rolls 2026-02-31 into March. A round-trip guard catches it.
    expect(eventLeadDays('2026-02-31', NOW)).toBeNull()
    expect(eventLeadDays('2026-13-01', NOW)).toBeNull()
    expect(eventLeadDays('2026-00-10', NOW)).toBeNull()
  })

  it('accepts a real leap day', () => {
    expect(eventLeadDays('2028-02-29', NOW)).not.toBeNull()
  })
})

describe('leadTimeStatus', () => {
  it('rejects anything inside the hard floor', () => {
    for (const d of [-5, 0, 1, 5, 9]) {
      expect(leadTimeStatus(inDays(d), NOW), `${d} days out`).toBe('too_soon')
    }
  })

  it('warns across the whole rushed band, inclusive of its lower edge', () => {
    for (const d of [10, 11, 12, 13]) {
      expect(leadTimeStatus(inDays(d), NOW), `${d} days out`).toBe('rushed')
    }
  })

  it('stops warning at exactly the rushed threshold', () => {
    expect(leadTimeStatus(inDays(14), NOW)).toBe('ok')
    expect(leadTimeStatus(inDays(30), NOW)).toBe('ok')
  })

  it('reports invalid rather than guessing', () => {
    expect(leadTimeStatus('not-a-date', NOW)).toBe('invalid')
  })

  it('leaves no gap between the bands — every valid date lands somewhere', () => {
    for (let d = -2; d <= 20; d++) {
      expect(['too_soon', 'rushed', 'ok']).toContain(leadTimeStatus(inDays(d), NOW))
    }
  })
})

describe('earliestBookableDate', () => {
  it('is exactly the hard floor away, so the picker and the server agree', () => {
    const min = earliestBookableDate(NOW)
    expect(leadTimeStatus(min, NOW)).not.toBe('too_soon')
  })

  it('the day before it is rejected — the boundary is not off by one', () => {
    const min = earliestBookableDate(NOW)
    const dayBefore = new Date(Date.parse(min + 'T00:00:00Z') - 86_400_000)
      .toISOString()
      .slice(0, 10)
    expect(leadTimeStatus(dayBefore, NOW)).toBe('too_soon')
  })

  it('emits YYYY-MM-DD, which is what a date input requires for `min`', () => {
    expect(earliestBookableDate(NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
