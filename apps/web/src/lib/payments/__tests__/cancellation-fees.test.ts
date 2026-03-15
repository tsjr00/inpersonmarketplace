/**
 * Cancellation fee calculation tests.
 *
 * Business Rules Covered:
 * OL-R5: Cancel route uses allowlist (pending/confirmed/ready)
 * OL-R7: Per-vertical early cancel window — FM=1hr, FT=15min
 * OL-R8: Full refund within window OR if vendor hasn't confirmed
 * OL-R9: 25% cancellation fee after window when vendor confirmed
 */
import { describe, it, expect } from 'vitest'
import {
  calculateCancellationFee,
  CANCELLATION_FEE_PERCENT,
  GRACE_PERIOD_BY_VERTICAL,
  DEFAULT_GRACE_PERIOD_MS,
  getGracePeriodMs,
} from '@/lib/payments/cancellation-fees'

describe('getGracePeriodMs', () => {
  it('FM grace period is 1 hour', () => {
    expect(getGracePeriodMs('farmers_market')).toBe(60 * 60 * 1000)
  })

  it('FT grace period is 15 minutes', () => {
    expect(getGracePeriodMs('food_trucks')).toBe(15 * 60 * 1000)
  })

  it('fire_works grace period is 1 hour', () => {
    expect(getGracePeriodMs('fire_works')).toBe(60 * 60 * 1000)
  })

  it('unknown vertical gets default (1 hour)', () => {
    expect(getGracePeriodMs('unknown')).toBe(DEFAULT_GRACE_PERIOD_MS)
  })

  it('no vertical gets default (1 hour)', () => {
    expect(getGracePeriodMs()).toBe(DEFAULT_GRACE_PERIOD_MS)
  })
})

describe('calculateCancellationFee — FM (1-hour grace period)', () => {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

  it('gives full refund within 1hr grace period regardless of status', () => {
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'confirmed',
      orderCreatedAt: thirtyMinAgo,
      vertical: 'farmers_market',
    })

    expect(result.feeApplied).toBe(false)
    expect(result.withinGracePeriod).toBe(true)
    expect(result.cancellationFeeCents).toBe(0)
    expect(result.vendorShareCents).toBe(0)
    expect(result.platformShareCents).toBe(0)
    // Refund = full buyer payment: 1000 + round(1000*0.065) + round(15/1) = 1000 + 65 + 15 = 1080
    expect(result.refundAmountCents).toBe(1080)
  })

  it('gives full refund after 1hr grace when vendor has NOT confirmed', () => {
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'pending',
      orderCreatedAt: twoHoursAgo,
      vertical: 'farmers_market',
    })

    expect(result.feeApplied).toBe(false)
    expect(result.withinGracePeriod).toBe(false)
    expect(result.vendorHadConfirmed).toBe(false)
    expect(result.cancellationFeeCents).toBe(0)
    expect(result.refundAmountCents).toBe(1080)
  })

  it('applies 25% fee after 1hr grace when vendor confirmed', () => {
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'confirmed',
      orderCreatedAt: twoHoursAgo,
      vertical: 'farmers_market',
    })

    expect(result.feeApplied).toBe(true)
    expect(result.withinGracePeriod).toBe(false)
    expect(result.vendorHadConfirmed).toBe(true)

    // Buyer paid 1080. 25% fee = 270. Refund = 810.
    expect(result.refundAmountCents).toBe(810)
    expect(result.cancellationFeeCents).toBe(270)

    // Platform + vendor shares should sum to cancellation fee
    expect(result.platformShareCents + result.vendorShareCents).toBe(270)

    // Platform share: round(270 * 13% application fee) = round(270 * 0.13) = 35
    expect(result.platformShareCents).toBe(35)
    expect(result.vendorShareCents).toBe(235)
  })

  it('prorates flat fee correctly for multi-item orders', () => {
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 3,
      orderStatus: 'pending',
      orderCreatedAt: thirtyMinAgo,
      vertical: 'farmers_market',
    })

    // Flat fee per item: round(15/3) = 5
    // Buyer paid: 1000 + round(1000*0.065) + 5 = 1000 + 65 + 5 = 1070
    expect(result.refundAmountCents).toBe(1070)
  })
})

describe('calculateCancellationFee — FT (15-minute grace period)', () => {
  it('gives full refund within 15min grace period', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'confirmed',
      orderCreatedAt: tenMinAgo,
      vertical: 'food_trucks',
    })

    expect(result.feeApplied).toBe(false)
    expect(result.withinGracePeriod).toBe(true)
    expect(result.refundAmountCents).toBe(1080)
  })

  it('applies 25% fee after 15min when vendor confirmed', () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000)
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'confirmed',
      orderCreatedAt: twentyMinAgo,
      vertical: 'food_trucks',
    })

    expect(result.feeApplied).toBe(true)
    expect(result.withinGracePeriod).toBe(false)
    expect(result.vendorHadConfirmed).toBe(true)
    expect(result.refundAmountCents).toBe(810)
    expect(result.cancellationFeeCents).toBe(270)
  })

  it('gives full refund after 15min when vendor NOT confirmed (pre-confirm override)', () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000)
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'pending',
      orderCreatedAt: twentyMinAgo,
      vertical: 'food_trucks',
    })

    expect(result.feeApplied).toBe(false)
    expect(result.withinGracePeriod).toBe(false)
    expect(result.vendorHadConfirmed).toBe(false)
    expect(result.refundAmountCents).toBe(1080)
  })

  it('FT 15min boundary: at exactly 15min still within grace', () => {
    // 14min 59sec ago — just inside
    const justInside = new Date(Date.now() - (15 * 60 * 1000 - 1000))
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'confirmed',
      orderCreatedAt: justInside,
      vertical: 'food_trucks',
    })

    expect(result.withinGracePeriod).toBe(true)
    expect(result.feeApplied).toBe(false)
  })

  it('FT 15min boundary: at 16min past grace', () => {
    const sixteenMinAgo = new Date(Date.now() - 16 * 60 * 1000)
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'confirmed',
      orderCreatedAt: sixteenMinAgo,
      vertical: 'food_trucks',
    })

    expect(result.withinGracePeriod).toBe(false)
    expect(result.feeApplied).toBe(true)
  })
})

// =============================================================================
// OL-R9b: Cancellation fee split uses applicationFeePercent (13%)
// Business rule: The 25% cancellation fee is split using the same platform
// fee percentage (13%) as normal transactions. Vendor gets 87%, platform 13%.
// This is intentional — the vendor prepared the order, so they get the majority.
// =============================================================================
describe('OL-R9b: Cancellation fee split matches applicationFeePercent', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 1000 * 60)

  it('platform share is applicationFeePercent (13%) of cancellation fee', () => {
    // Business rule: platform share = cancellationFee * 0.13
    const result = calculateCancellationFee({
      subtotalCents: 2000, // $20 item
      totalItemsInOrder: 1,
      orderStatus: 'confirmed',
      orderCreatedAt: twoHoursAgo,
      vertical: 'farmers_market',
    })

    expect(result.feeApplied).toBe(true)

    // Buyer paid: 2000 + round(2000*0.065) + 15 = 2000 + 130 + 15 = 2145
    // Cancellation fee: 2145 - round(2145 * 0.75) = 2145 - 1609 = 536
    expect(result.cancellationFeeCents).toBe(536)

    // Platform share: round(536 * 0.13) = round(69.68) = 70
    expect(result.platformShareCents).toBe(Math.round(result.cancellationFeeCents * 0.13))
    // Vendor share: 536 - 70 = 466
    expect(result.vendorShareCents).toBe(result.cancellationFeeCents - result.platformShareCents)
  })

  it('vendor always gets majority (87%) of cancellation fee', () => {
    const result = calculateCancellationFee({
      subtotalCents: 5000, // $50 item
      totalItemsInOrder: 1,
      orderStatus: 'ready',
      orderCreatedAt: twoHoursAgo,
      vertical: 'food_trucks',
    })

    expect(result.feeApplied).toBe(true)
    // Vendor share must be > 80% of cancellation fee (87% expected)
    expect(result.vendorShareCents / result.cancellationFeeCents).toBeGreaterThan(0.80)
    // Platform share must be < 20% of cancellation fee (13% expected)
    expect(result.platformShareCents / result.cancellationFeeCents).toBeLessThan(0.20)
  })

  it('platform + vendor shares always sum to exactly the cancellation fee', () => {
    // Test across multiple amounts to catch rounding errors
    for (const subtotal of [500, 1000, 1999, 2000, 3333, 5000, 9999]) {
      const result = calculateCancellationFee({
        subtotalCents: subtotal,
        totalItemsInOrder: 1,
        orderStatus: 'confirmed',
        orderCreatedAt: twoHoursAgo,
        vertical: 'farmers_market',
      })
      if (result.feeApplied) {
        expect(result.platformShareCents + result.vendorShareCents).toBe(result.cancellationFeeCents)
      }
    }
  })

  it('split is consistent across verticals (same fee structure)', () => {
    const fmResult = calculateCancellationFee({
      subtotalCents: 2000,
      totalItemsInOrder: 1,
      orderStatus: 'confirmed',
      orderCreatedAt: twoHoursAgo,
      vertical: 'farmers_market',
    })
    const ftResult = calculateCancellationFee({
      subtotalCents: 2000,
      totalItemsInOrder: 1,
      orderStatus: 'confirmed',
      orderCreatedAt: twoHoursAgo,
      vertical: 'food_trucks',
    })

    // Same subtotal + same status = same fee split regardless of vertical
    expect(fmResult.cancellationFeeCents).toBe(ftResult.cancellationFeeCents)
    expect(fmResult.platformShareCents).toBe(ftResult.platformShareCents)
    expect(fmResult.vendorShareCents).toBe(ftResult.vendorShareCents)
  })
})

describe('calculateCancellationFee — no vertical (default = 1 hour)', () => {
  it('uses 1-hour default when no vertical provided', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 1,
      orderStatus: 'confirmed',
      orderCreatedAt: thirtyMinAgo,
    })

    expect(result.withinGracePeriod).toBe(true)
    expect(result.feeApplied).toBe(false)
  })
})
