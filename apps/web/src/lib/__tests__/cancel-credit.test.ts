/**
 * Phase E — vendor whole-group cancel credit (Layer 1, pure/deterministic).
 *
 * IMPORTANT: asserts the BUSINESS RULE, not the code. If a test fails, fix the
 * code — do NOT change the expectation. See CLAUDE.md ABSOLUTE RULE 2.
 *
 * Rule (LOCKED 2026-06-27): credit = manager-held base (managerReceivesCents).
 *  - before season start (or no reference) → full base of ALL weeks, no penalty,
 *    cancel every week.
 *  - after start → base of the REMAINING (week_start >= today) weeks × (1 − 25%),
 *    rounded; elapsed weeks earn nothing and are not cancelled.
 */
import { describe, it, expect } from 'vitest'
import { computeCancelCredit } from '@/lib/markets/cancel-credit'

const PENALTY = 25 // POST_START_PENALTY_PCT (cancel route)
const MGR = 2337   // $25.00/week manager-held base (pricing.ts)

// Four $25 weeks with stable ids.
const weeks = [
  { id: 'w1', weekStartDate: '2026-05-03', priceCents: 2500 },
  { id: 'w2', weekStartDate: '2026-05-10', priceCents: 2500 },
  { id: 'w3', weekStartDate: '2026-05-17', priceCents: 2500 },
  { id: 'w4', weekStartDate: '2026-05-24', priceCents: 2500 },
]

describe('computeCancelCredit — before season start', () => {
  it('grants the full manager-held base of every week and cancels them all', () => {
    const r = computeCancelCredit(weeks, '2026-04-15', '2026-05-03', PENALTY)
    expect(r).toEqual({
      beforeStart: true,
      creditCents: MGR * 4, // 9348 — no penalty
      source: 'vendor_cancel_pre',
      idsToCancel: ['w1', 'w2', 'w3', 'w4'],
    })
  })

  it('treats a missing reference date as before-start (full credit)', () => {
    const r = computeCancelCredit(weeks, '2026-05-20', null, PENALTY)
    expect(r.beforeStart).toBe(true)
    expect(r.creditCents).toBe(MGR * 4)
    expect(r.source).toBe('vendor_cancel_pre')
  })
})

describe('computeCancelCredit — after season start', () => {
  it('credits only remaining weeks, minus the 25% penalty, and cancels only those', () => {
    // today 2026-05-12: w1/w2 elapsed; w3/w4 remain. 2 × 2337 = 4674 × 0.75 = 3505.5 → 3506.
    const r = computeCancelCredit(weeks, '2026-05-12', '2026-05-03', PENALTY)
    expect(r).toEqual({
      beforeStart: false,
      creditCents: 3506,
      source: 'vendor_cancel_post',
      idsToCancel: ['w3', 'w4'],
    })
  })

  it('includes a week whose start equals today (not yet elapsed)', () => {
    // today 2026-05-10: w1 elapsed; w2/w3/w4 remain (w2 starts today).
    const r = computeCancelCredit(weeks, '2026-05-10', '2026-05-03', PENALTY)
    expect(r.idsToCancel).toEqual(['w2', 'w3', 'w4'])
    expect(r.creditCents).toBe(Math.round(MGR * 3 * 0.75)) // 5258
  })

  it('grants nothing when every week has already elapsed', () => {
    const r = computeCancelCredit(weeks, '2026-06-01', '2026-05-03', PENALTY)
    expect(r).toEqual({
      beforeStart: false,
      creditCents: 0,
      source: 'vendor_cancel_post',
      idsToCancel: [],
    })
  })
})
