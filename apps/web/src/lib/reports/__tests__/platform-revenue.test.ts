import { describe, it, expect } from 'vitest'
import {
  estimateStripeCostCents,
  computeOrderPlatformRevenue,
  STRIPE_ESTIMATE_PCT,
  STRIPE_ESTIMATE_FLAT_CENTS,
} from '../platform-revenue'

describe('estimateStripeCostCents', () => {
  it('2.9% + $0.30 on a Stripe charge (per charge, not per item)', () => {
    // $21.45 charge → round(2145*0.029)=62 + 30 = 92
    expect(estimateStripeCostCents(2145, true)).toBe(92)
  })
  it('is zero for external (non-Stripe) payments', () => {
    expect(estimateStripeCostCents(2145, false)).toBe(0)
  })
  it('is zero for a non-positive charge', () => {
    expect(estimateStripeCostCents(0, true)).toBe(0)
  })
  it('constants are the documented Stripe standard', () => {
    expect(STRIPE_ESTIMATE_PCT).toBe(0.029)
    expect(STRIPE_ESTIMATE_FLAT_CENTS).toBe(30)
  })
})

describe('computeOrderPlatformRevenue', () => {
  it('single vendor, one $20 item, default fees, no tip, no refund', () => {
    // subtotal 2000; buyer 6.5%=130 + flat 15 → total_cents 2145
    // vendor 6.5%=130 + flat 15 → payout 1855; platform take = 290
    const r = computeOrderPlatformRevenue({
      totalCents: 2145,
      tipAmount: 0,
      tipOnPlatformFeeCents: 0,
      isStripe: true,
      items: [{ vendorPayoutCents: 1855, refundAmountCents: 0, cancelled: false }],
    })
    expect(r.grossPlatformCents).toBe(290)      // 2145 − 1855
    expect(r.stripeCostCents).toBe(92)          // round(2145*.029)+30
    expect(r.netPlatformCents).toBe(198)        // 290 − 92
    expect(r.vendorPayoutCents).toBe(1855)
  })

  it('MULTI-VENDOR: one order, 2 items/2 vendors, $20+$30, $5 tip — order-level amounts counted ONCE', () => {
    // total_cents = 5340 (buyerTotal) + 500 tip = 5840  [ONE charge for the cart]
    // payouts: A 2000−130−7=1863, B 3000−195−8=2797 → Σ 4660
    // tip 500 all to vendors (tip_on_platform_fee 0) → vendorTipShare 500
    // gross = 5840 − 4660 − 500 = 680  (= buyer 325 + buyer flat 15 + vendor 325 + vendor flat 15)
    const r = computeOrderPlatformRevenue({
      totalCents: 5840,
      tipAmount: 500,
      tipOnPlatformFeeCents: 0,
      isStripe: true,
      items: [
        { vendorPayoutCents: 1863, refundAmountCents: 0, cancelled: false },
        { vendorPayoutCents: 2797, refundAmountCents: 0, cancelled: false },
      ],
    })
    expect(r.vendorPayoutCents).toBe(4660)
    expect(r.vendorTipShareCents).toBe(500)
    expect(r.grossPlatformCents).toBe(680)
    expect(r.stripeCostCents).toBe(199)         // round(5840*.029)+30
    expect(r.netPlatformCents).toBe(481)        // 680 − 199
  })

  it('per-item refund is subtracted at its exact value (never estimated)', () => {
    const r = computeOrderPlatformRevenue({
      totalCents: 2145,
      tipAmount: 0,
      tipOnPlatformFeeCents: 0,
      isStripe: true,
      items: [{ vendorPayoutCents: 1855, refundAmountCents: 500, cancelled: false }],
    })
    expect(r.refundCents).toBe(500)
    expect(r.grossPlatformCents).toBe(290)      // gross unchanged
    expect(r.netPlatformCents).toBe(-302)       // 290 − 92 − 500 (refund flows through exactly)
  })

  it('cancelled item is excluded from vendor payout but its refund still counts', () => {
    const r = computeOrderPlatformRevenue({
      totalCents: 5840,
      tipAmount: 0,
      tipOnPlatformFeeCents: 0,
      isStripe: true,
      items: [
        { vendorPayoutCents: 1863, refundAmountCents: 0, cancelled: false },
        { vendorPayoutCents: 2797, refundAmountCents: 3203, cancelled: true },
      ],
    })
    expect(r.vendorPayoutCents).toBe(1863)      // B excluded
    expect(r.refundCents).toBe(3203)
  })

  it('uses the ACTUAL Stripe fee when provided, overriding the estimate', () => {
    // estimate on 2145 would be 92; actual captured fee is 118 (e.g. intl card)
    const r = computeOrderPlatformRevenue({
      totalCents: 2145,
      tipAmount: 0,
      tipOnPlatformFeeCents: 0,
      isStripe: true,
      actualStripeFeeCents: 118,
      items: [{ vendorPayoutCents: 1855, refundAmountCents: 0, cancelled: false }],
    })
    expect(r.stripeCostCents).toBe(118)
    expect(r.stripeCostIsActual).toBe(true)
    expect(r.netPlatformCents).toBe(172) // 290 − 118
  })

  it('falls back to the estimate (flagged not-actual) when no actual fee given', () => {
    const r = computeOrderPlatformRevenue({
      totalCents: 2145,
      tipAmount: 0,
      tipOnPlatformFeeCents: 0,
      isStripe: true,
      items: [{ vendorPayoutCents: 1855, refundAmountCents: 0, cancelled: false }],
    })
    expect(r.stripeCostCents).toBe(92)
    expect(r.stripeCostIsActual).toBe(false)
  })

  it('external payment: no Stripe cost deducted', () => {
    const r = computeOrderPlatformRevenue({
      totalCents: 2130,
      tipAmount: 0,
      tipOnPlatformFeeCents: 0,
      isStripe: false,
      items: [{ vendorPayoutCents: 2000, refundAmountCents: 0, cancelled: false }],
    })
    expect(r.stripeCostCents).toBe(0)
    expect(r.netPlatformCents).toBe(r.grossPlatformCents)
  })
})
