import { describe, it, expect } from 'vitest'
import { calculateTipShare } from '@/lib/payments/tip-math'

describe('calculateTipShare', () => {
  it('splits tip evenly across items', () => {
    // $5 tip (500 cents) / 2 items = 250 each
    expect(calculateTipShare(500, 2)).toBe(250)
  })

  it('rounds when tip does not divide evenly', () => {
    // $1 tip (100 cents) / 3 items = 33.33 → 33
    expect(calculateTipShare(100, 3)).toBe(33)
  })

  it('returns 0 for null tip', () => {
    expect(calculateTipShare(null, 2)).toBe(0)
  })

  it('returns 0 for undefined tip', () => {
    expect(calculateTipShare(undefined, 2)).toBe(0)
  })

  it('returns 0 for zero tip', () => {
    expect(calculateTipShare(0, 2)).toBe(0)
  })

  it('returns 0 for null item count', () => {
    expect(calculateTipShare(500, null)).toBe(0)
  })

  it('returns 0 for zero item count', () => {
    expect(calculateTipShare(500, 0)).toBe(0)
  })
})
