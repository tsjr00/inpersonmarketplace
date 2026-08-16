import { describe, it, expect } from 'vitest'
import {
  FEE_PROTECTION_WINDOW_HOURS,
  WAIVE_WINDOW_DAYS,
  decideFeeOutcome,
  waivableUntil,
  isWaivable,
} from '../events/fee-cancellation'

/**
 * Backup bench Phase 3 — cancellation money bands (2026-08-16).
 *
 * Expected values come from the OWNER'S decisions (decisions.md "Backup
 * vendors — model decided" #6 + the 2026-08-16 session answers), not from
 * the implementation:
 *   - "cancel before the protection window → fee refunded, no stain; inside
 *      72h (matches late_event_cancellation) → fee forfeited"
 *   - "give organizer 14 days to refund it if they choose"
 */
describe('event fee cancellation bands (owner decision 2026-08-15/16)', () => {
  it('protection window is 72 hours — the same "late" the quality finding uses', () => {
    expect(FEE_PROTECTION_WINDOW_HOURS).toBe(72)
  })

  it('waive window is 14 days after the event date', () => {
    expect(WAIVE_WINDOW_DAYS).toBe(14)
  })

  it('cancelling at or beyond 72h out refunds', () => {
    expect(decideFeeOutcome(72)).toBe('refund')
    expect(decideFeeOutcome(73)).toBe('refund')
    expect(decideFeeOutcome(24 * 30)).toBe('refund')
  })

  it('cancelling inside 72h forfeits', () => {
    expect(decideFeeOutcome(71.9)).toBe('forfeit')
    expect(decideFeeOutcome(24)).toBe('forfeit')
    expect(decideFeeOutcome(1)).toBe('forfeit')
  })

  it('cancelling AFTER the event started still forfeits — walking past zero must not reach the refund band', () => {
    expect(decideFeeOutcome(0)).toBe('forfeit')
    expect(decideFeeOutcome(-5)).toBe('forfeit')
    expect(decideFeeOutcome(-1000)).toBe('forfeit')
  })

  it('waive is available through the 14th day after the event and closed on the 15th', () => {
    const eventDate = '2026-09-01'
    // Same date convention as the route math: local server clock.
    const dayAfterEvent = new Date('2026-09-02T12:00:00')
    const day14 = new Date('2026-09-15T12:00:00')
    const day16 = new Date('2026-09-17T12:00:00')

    expect(isWaivable(eventDate, dayAfterEvent)).toBe(true)
    expect(isWaivable(eventDate, day14)).toBe(true)
    expect(isWaivable(eventDate, day16)).toBe(false)
  })

  it('waivableUntil lands 15 days after the event date at midnight (through end of day 14)', () => {
    const deadline = waivableUntil('2026-09-01')
    expect(deadline.getFullYear()).toBe(2026)
    expect(deadline.getMonth()).toBe(8) // September
    expect(deadline.getDate()).toBe(16)
  })
})
