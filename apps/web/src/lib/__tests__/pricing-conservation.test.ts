/**
 * Pricing Conservation Properties (review residue, 2026-07-13)
 *
 * The tip/fee bugs of the pre-re-release review (VOR-4, CHK-6, CHK-14,
 * MBX-1) were all one shape: THE PARTS STOPPED SUMMING TO THE WHOLE —
 * money was paid or refunded on the wrong side of a fee line. These
 * property loops assert the documented conservation identities of the
 * pure pricing functions over thousands of randomized inputs.
 *
 * Deterministic PRNG (LCG) — failures reproduce exactly.
 * Every asserted identity is documented in pricing.ts / tip-math.ts or in
 * decisions.md; none is derived from incidental code behavior.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateOrderPricing,
  calculateBuyerPrice,
  calculateItemDisplayPrice,
  calculateVendorPayout,
  proratedFlatFee,
  proratedFlatFeeSimple,
  calculateBoothRentalFees,
  FEES,
} from '../pricing'
import { calculateTipShare, calculateVendorTip, calculatePlatformFeeTip } from '../payments/tip-math'

/** Deterministic LCG so failures reproduce. */
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}
const rng = makeRng(0xC0FFEE)
const randInt = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))

const CASES = 2000

describe('Conservation — prorated flat fee is zero-sum', () => {
  it('Σ proratedFlatFee(fee, N, i) === fee, exactly, for all fee/N', () => {
    for (let c = 0; c < CASES; c++) {
      const fee = randInt(0, 500)
      const n = randInt(1, 40)
      let sum = 0
      for (let i = 0; i < n; i++) sum += proratedFlatFee(fee, n, i)
      expect(sum, `fee=${fee} N=${n}: shares sum to ${sum}, not ${fee}`).toBe(fee)
    }
  })

  it('proratedFlatFeeSimple is the documented floor(fee/N) (NOT zero-sum — refund paths accept the floor)', () => {
    for (let c = 0; c < CASES; c++) {
      const fee = randInt(0, 500)
      const n = randInt(1, 40)
      expect(proratedFlatFeeSimple(fee, n)).toBe(Math.floor(fee / n))
    }
  })
})

describe('Conservation — order pricing identities', () => {
  it('buyerTotal − vendorPayout === platformFee, exactly (nothing leaks, nothing is minted)', () => {
    for (let c = 0; c < CASES; c++) {
      const items = Array.from({ length: randInt(1, 8) }, () => ({
        price_cents: randInt(100, 15000),
        quantity: randInt(1, 6),
      }))
      const p = calculateOrderPricing(items)
      expect(p.buyerTotalCents - p.vendorPayoutCents, `items=${JSON.stringify(items)}`).toBe(p.platformFeeCents)
      // And the sides decompose exactly as documented:
      expect(p.buyerTotalCents).toBe(p.subtotalCents + p.buyerPercentFeeCents + p.buyerFlatFeeCents)
      expect(p.vendorPayoutCents).toBe(p.subtotalCents - p.vendorPercentFeeCents - p.vendorFlatFeeCents)
      expect(p.platformFeeCents).toBe(
        p.buyerPercentFeeCents + p.buyerFlatFeeCents + p.vendorPercentFeeCents + p.vendorFlatFeeCents
      )
    }
  })

  it('buyer price ≥ base ≥ vendor payout (the platform never inverts the fee line)', () => {
    for (let c = 0; c < CASES; c++) {
      const base = randInt(100, 30000) // ≥ $1 (listing minimum)
      expect(calculateBuyerPrice(base)).toBeGreaterThanOrEqual(base + FEES.buyerFlatFeeCents)
      expect(calculateItemDisplayPrice(base)).toBeGreaterThanOrEqual(base)
      expect(calculateVendorPayout(base)).toBeLessThanOrEqual(base)
    }
  })
})

describe('Conservation — tip split (decision 2026-02-20: vendor tips on food cost only)', () => {
  it('vendorTip + platformFeeTip === totalTip, exactly, both non-negative', () => {
    for (let c = 0; c < CASES; c++) {
      const subtotal = randInt(100, 20000)
      const pct = randInt(1, 30)
      // Tip as charged: percentage of the displayed subtotal (food + buyer fee)
      const displayed = calculateItemDisplayPrice(subtotal)
      const totalTip = Math.round(displayed * pct / 100)
      if (totalTip <= 0) continue

      const platformTip = calculatePlatformFeeTip(totalTip, subtotal, pct)
      const vendorTip = calculateVendorTip(totalTip, platformTip)

      expect(vendorTip + platformTip, `subtotal=${subtotal} pct=${pct} tip=${totalTip}`).toBe(totalTip)
      expect(vendorTip).toBeGreaterThanOrEqual(0)
      expect(platformTip).toBeGreaterThanOrEqual(0)
    }
  })

  it('per-item tip shares drift from the tip by at most ⌈N/2⌉ cents (documented round(tip/N) split)', () => {
    // NOTE: exact conservation is NOT guaranteed by design — each item gets
    // round(tip/N). The drift is bounded; if this bound ever matters, the fix
    // is a zero-sum split like proratedFlatFee (ledger note 2026-07-13).
    for (let c = 0; c < CASES; c++) {
      const tip = randInt(1, 5000)
      const n = randInt(1, 12)
      const share = calculateTipShare(tip, n)
      expect(share).toBe(Math.round(tip / n))
      expect(Math.abs(n * share - tip), `tip=${tip} N=${n} share=${share}`).toBeLessThanOrEqual(Math.ceil(n / 2))
    }
  })
})

describe('Conservation — booth/park rental split (operator_keep_pct, mig 177)', () => {
  it('vendorPays > managerReceives ≥ 0 and managerReceives ≤ base, for all keep ∈ [0.935, 1.0]', () => {
    for (let c = 0; c < CASES; c++) {
      const base = randInt(100, 50000)
      const keep = 0.935 + Math.floor(rng() * 66) / 1000 // 0.935 .. 1.000
      const fees = calculateBoothRentalFees(base, keep)
      expect(fees.vendorPaysCents, `base=${base} keep=${keep}`).toBeGreaterThan(fees.managerReceivesCents)
      expect(fees.managerReceivesCents).toBeGreaterThanOrEqual(0)
      expect(fees.managerReceivesCents).toBeLessThanOrEqual(base)
    }
  })

  it('at keep=1.0 the manager receives exactly the base (full rebate) and the platform still nets the buyer side', () => {
    for (let c = 0; c < 200; c++) {
      const base = randInt(100, 50000)
      const fees = calculateBoothRentalFees(base, 1.0)
      expect(fees.managerReceivesCents).toBe(base)
      expect(fees.vendorPaysCents).toBeGreaterThan(base)
    }
  })
})
