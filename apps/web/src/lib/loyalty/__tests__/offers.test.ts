/**
 * VIP perk offer math (Phase B1). Spec source: owner decisions 2026-09-04
 * (vendor-funded, VIP-only, spend-threshold "10% off if you spend more than
 * $30") + the conservation rule — allocated parts sum EXACTLY to the whole,
 * and a discount can never exceed the subtotal it discounts.
 */

import { describe, it, expect } from 'vitest'
import {
  computeSpendThresholdDiscount,
  allocateDiscount,
  parseSpendThreshold,
  SPEND_THRESHOLD_BOUNDS,
  type VendorOffer,
} from '../offers'

const offer = (config: Record<string, unknown>, enabled = true): VendorOffer => ({
  id: 'o1',
  vendor_profile_id: 'v1',
  kind: 'spend_threshold',
  enabled,
  config,
})

describe('computeSpendThresholdDiscount', () => {
  const tenOverThirty = { threshold_cents: 3000, pct: 10 } // the owner's example

  it("the owner's example: 10% off when spending more than $30 with the vendor", () => {
    expect(computeSpendThresholdDiscount(offer(tenOverThirty), true, 3500)).toBe(350)
  })

  it('below the threshold: nothing', () => {
    expect(computeSpendThresholdDiscount(offer(tenOverThirty), true, 2999)).toBe(0)
  })

  it('VIP-only (owner Q3): a non-VIP buyer gets nothing regardless of spend', () => {
    expect(computeSpendThresholdDiscount(offer(tenOverThirty), false, 10000)).toBe(0)
  })

  it('a disabled offer produces nothing', () => {
    expect(computeSpendThresholdDiscount(offer(tenOverThirty, false), true, 10000)).toBe(0)
  })

  it('out-of-bounds configs are ignored, never applied (the 90%-off fat-finger guard)', () => {
    expect(computeSpendThresholdDiscount(offer({ threshold_cents: 3000, pct: 90 }), true, 10000)).toBe(0)
    expect(computeSpendThresholdDiscount(offer({ threshold_cents: 200, pct: 10 }), true, 10000)).toBe(0)
    expect(computeSpendThresholdDiscount(offer({}), true, 10000)).toBe(0)
  })
})

describe('parseSpendThreshold bounds', () => {
  it('accepts the corners of the allowed range', () => {
    const b = SPEND_THRESHOLD_BOUNDS
    expect(parseSpendThreshold({ threshold_cents: b.minThresholdCents, pct: b.minPct })).not.toBeNull()
    expect(parseSpendThreshold({ threshold_cents: b.maxThresholdCents, pct: b.maxPct })).not.toBeNull()
  })
  it('rejects just outside the corners and non-integers', () => {
    const b = SPEND_THRESHOLD_BOUNDS
    expect(parseSpendThreshold({ threshold_cents: b.minThresholdCents - 1, pct: 10 })).toBeNull()
    expect(parseSpendThreshold({ threshold_cents: 3000, pct: b.maxPct + 1 })).toBeNull()
    expect(parseSpendThreshold({ threshold_cents: 3000.5, pct: 10 })).toBeNull()
  })
})

describe('allocateDiscount — conservation by construction', () => {
  it('parts sum exactly to the discount, across uneven items', () => {
    const parts = allocateDiscount([1099, 750, 333], 218)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(218)
    expect(parts).toHaveLength(3)
  })

  it('never allocates more than an item can absorb in total (cap at subtotal sum)', () => {
    const parts = allocateDiscount([500, 300], 2000)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(800)
  })

  it('zero discount or empty items → all zeros', () => {
    expect(allocateDiscount([500, 300], 0)).toEqual([0, 0])
    expect(allocateDiscount([], 100)).toEqual([])
  })

  it('deterministic: same inputs, same split (LCG-free sanity over a sweep)', () => {
    for (let d = 1; d <= 50; d++) {
      const a = allocateDiscount([701, 407, 199], d)
      const b = allocateDiscount([701, 407, 199], d)
      expect(a).toEqual(b)
      expect(a.reduce((x, y) => x + y, 0)).toBe(Math.min(d, 1307))
    }
  })
})
