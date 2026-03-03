/**
 * Pricing module unit tests.
 *
 * Business Rules Covered:
 * MP-R1: Buyer fee = 6.5% + $0.15 flat fee (Stripe only)
 * MP-R2: Vendor fee = 6.5% of base subtotal, prorated per item
 * MP-R5: Small order fee when displayed subtotal < threshold (per-vertical)
 * MP-R9: Per-item rounding (display subtotal = sum of per-item prices)
 * MP-R11: External buyer fee = 6.5%, NO flat fee
 * MP-R12: Flat fee prorated across items
 * MP-R13: No minimum rejection, small order fee instead
 */
import { describe, it, expect } from 'vitest'
import {
  calculateOrderPricing,
  calculateBuyerPrice,
  calculateVendorPayout,
  calculateItemDisplayPrice,
  amountToAvoidSmallOrderFee,
  formatPrice,
  calculateSmallOrderFee,
  getSmallOrderFeeConfig,
  FEES,
  DEFAULT_SMALL_ORDER_FEE,
  SMALL_ORDER_FEE_DEFAULTS,
} from '@/lib/pricing'

// ── MP-R1: Buyer fee constants ──────────────────────────────────────
describe('MP-R1: Fee configuration', () => {
  it('buyer percentage fee is 6.5%', () => {
    expect(FEES.buyerFeePercent).toBe(6.5)
  })

  it('buyer flat fee is $0.15 (15 cents)', () => {
    expect(FEES.buyerFlatFeeCents).toBe(15)
  })

  it('vendor percentage fee is 6.5%', () => {
    expect(FEES.vendorFeePercent).toBe(6.5)
  })

  it('vendor flat fee is $0.15 (15 cents)', () => {
    expect(FEES.vendorFlatFeeCents).toBe(15)
  })
})

describe('calculateOrderPricing', () => {
  it('calculates correctly for a single $10 item', () => {
    const pricing = calculateOrderPricing([{ price_cents: 1000, quantity: 1 }])

    expect(pricing.subtotalCents).toBe(1000)
    // Buyer: 1000 * 6.5% = 65, + 15 flat = 1080
    expect(pricing.buyerPercentFeeCents).toBe(65)
    expect(pricing.buyerFlatFeeCents).toBe(15)
    expect(pricing.buyerTotalCents).toBe(1080)
    // Vendor: 1000 - 65 - 15 = 920
    expect(pricing.vendorPercentFeeCents).toBe(65)
    expect(pricing.vendorFlatFeeCents).toBe(15)
    expect(pricing.vendorPayoutCents).toBe(920)
    // Platform: 65 + 15 + 65 + 15 = 160
    expect(pricing.platformFeeCents).toBe(160)
  })

  it('applies flat fee once for multi-item orders', () => {
    const pricing = calculateOrderPricing([
      { price_cents: 1000, quantity: 2 },
      { price_cents: 500, quantity: 1 },
    ])

    // Subtotal: 2*1000 + 1*500 = 2500
    expect(pricing.subtotalCents).toBe(2500)
    // Flat fee is 15 once, not 15*3
    expect(pricing.buyerFlatFeeCents).toBe(15)
    expect(pricing.vendorFlatFeeCents).toBe(15)
    // Buyer: 2500 + round(2500*0.065) + 15 = 2500 + 163 + 15 = 2678
    expect(pricing.buyerPercentFeeCents).toBe(163)
    expect(pricing.buyerTotalCents).toBe(2678)
  })

  it('rounds correctly for fractional-cent amounts', () => {
    // $7.77 → 777 cents. 777 * 0.065 = 50.505 → rounds to 51
    const pricing = calculateOrderPricing([{ price_cents: 777, quantity: 1 }])

    expect(pricing.buyerPercentFeeCents).toBe(51)
    expect(pricing.vendorPercentFeeCents).toBe(51)
    // No fractional cents in any output
    expect(Number.isInteger(pricing.buyerTotalCents)).toBe(true)
    expect(Number.isInteger(pricing.vendorPayoutCents)).toBe(true)
    expect(Number.isInteger(pricing.platformFeeCents)).toBe(true)
  })

  it('handles zero subtotal', () => {
    const pricing = calculateOrderPricing([{ price_cents: 0, quantity: 1 }])

    expect(pricing.subtotalCents).toBe(0)
    expect(pricing.buyerPercentFeeCents).toBe(0)
    expect(pricing.buyerTotalCents).toBe(15) // flat fee only
    expect(pricing.vendorPayoutCents).toBe(-15) // negative — edge case to document
  })
})

// ── MP-R1: calculateBuyerPrice ──────────────────────────────────────
describe('calculateBuyerPrice', () => {
  it('matches calculateOrderPricing buyer total', () => {
    const subtotal = 2500
    const orderTotal = calculateOrderPricing([{ price_cents: 2500, quantity: 1 }]).buyerTotalCents
    const directTotal = calculateBuyerPrice(subtotal)
    expect(directTotal).toBe(orderTotal)
  })
})

// ── MP-R2: calculateVendorPayout ────────────────────────────────────
describe('calculateVendorPayout', () => {
  it('calculates vendor payout correctly', () => {
    // $10 subtotal: 1000 - round(1000*0.065) - 15 = 1000 - 65 - 15 = 920
    expect(calculateVendorPayout(1000)).toBe(920)
  })
})

// ── MP-R9: Per-item display price (percentage only, no flat fee) ────
describe('MP-R9: calculateItemDisplayPrice', () => {
  it('adds percentage fee without flat fee', () => {
    // $10 item: 1000 + round(1000*0.065) = 1065
    expect(calculateItemDisplayPrice(1000)).toBe(1065)
  })
})

// ── MP-R13: Amount needed to avoid fee ──────────────────────────────
describe('MP-R13: amountToAvoidSmallOrderFee', () => {
  it('food_trucks: returns displayed cents needed to reach $5.00 threshold', () => {
    // base 300 → display 320 → need 500-320 = 180 more displayed cents
    expect(amountToAvoidSmallOrderFee(300, 'food_trucks')).toBe(180)
  })

  it('food_trucks: returns 0 when already above threshold', () => {
    // base 500 → display 533 → above 500 → 0
    expect(amountToAvoidSmallOrderFee(500, 'food_trucks')).toBe(0)
  })

  it('farmers_market: returns displayed cents needed to reach $10.00 threshold', () => {
    // base 600 → display 639 → need 1000-639 = 361 more
    expect(amountToAvoidSmallOrderFee(600, 'farmers_market')).toBe(361)
  })

  it('farmers_market: returns 0 when above threshold', () => {
    // base 940 → display 1001 → above 1000 → 0
    expect(amountToAvoidSmallOrderFee(940, 'farmers_market')).toBe(0)
  })

  it('fire_works: returns displayed cents needed to reach $40.00 threshold', () => {
    // base 2000 → display 2130 → need 4000-2130 = 1870 more
    expect(amountToAvoidSmallOrderFee(2000, 'fire_works')).toBe(1870)
  })

  it('fire_works: returns 0 when above threshold', () => {
    // base 3756 → display 4000 → at threshold → 0
    expect(amountToAvoidSmallOrderFee(3756, 'fire_works')).toBe(0)
  })

  it('uses default threshold for unknown vertical', () => {
    // default threshold is 1000 (FM), base 300 → display 320 → need 680
    expect(amountToAvoidSmallOrderFee(300, 'unknown_vertical')).toBe(680)
  })

  it('uses default threshold when no vertical provided', () => {
    expect(amountToAvoidSmallOrderFee(300)).toBe(680)
    expect(amountToAvoidSmallOrderFee(940)).toBe(0)
  })

  it('returns full threshold for zero subtotal', () => {
    expect(amountToAvoidSmallOrderFee(0, 'food_trucks')).toBe(500)
    expect(amountToAvoidSmallOrderFee(0, 'farmers_market')).toBe(1000)
    expect(amountToAvoidSmallOrderFee(0, 'fire_works')).toBe(4000)
  })
})

describe('formatPrice', () => {
  it('formats zero', () => {
    expect(formatPrice(0)).toBe('$0.00')
  })

  it('formats typical amount', () => {
    expect(formatPrice(1234)).toBe('$12.34')
  })

  it('formats single-digit cents', () => {
    expect(formatPrice(5)).toBe('$0.05')
  })
})

// ── MP-R5/MP-R13: Small order fee ───────────────────────────────────
describe('MP-R5/MP-R13: calculateSmallOrderFee', () => {
  // Threshold compared against displayed subtotal (base + 6.5% buyer fee)
  // Per-vertical: FT=$5/$0.50, FM=$10/$1.00, FW=$40/$4.00

  it('food_trucks: returns $0.50 fee when displayed subtotal below $5.00', () => {
    // base 300 → display round(300×1.065) = 320 → below 500 → fee $0.50
    expect(calculateSmallOrderFee(300, 'food_trucks')).toBe(50)
  })

  it('food_trucks: returns 0 when display above threshold', () => {
    // base 500 → display round(500×1.065) = 533 → above 500 → no fee
    expect(calculateSmallOrderFee(500, 'food_trucks')).toBe(0)
  })

  it('food_trucks: edge case boundary — display just above threshold', () => {
    // base 470 → display round(470×1.065) = 501 → above 500 → no fee
    expect(calculateSmallOrderFee(470, 'food_trucks')).toBe(0)
  })

  it('food_trucks: edge case boundary — display just below threshold', () => {
    // base 469 → display round(469×1.065) = 499 → below 500 → fee
    expect(calculateSmallOrderFee(469, 'food_trucks')).toBe(50)
  })

  it('farmers_market: returns $1.00 fee when displayed subtotal below $10.00', () => {
    // base 300 → display 320 → below 1000 → fee $1.00
    expect(calculateSmallOrderFee(300, 'farmers_market')).toBe(100)
    // base 600 → display 639 → below 1000 → fee $1.00
    expect(calculateSmallOrderFee(600, 'farmers_market')).toBe(100)
  })

  it('farmers_market: returns 0 when display above $10.00 threshold', () => {
    // base 940 → display round(940×1.065) = 1001 → above 1000 → no fee
    expect(calculateSmallOrderFee(940, 'farmers_market')).toBe(0)
  })

  it('fire_works: returns $4.00 fee when displayed subtotal below $40.00', () => {
    // base 300 → display 320 → below 4000 → fee $4.00
    expect(calculateSmallOrderFee(300, 'fire_works')).toBe(400)
    // base 2000 → display 2130 → below 4000 → fee $4.00
    expect(calculateSmallOrderFee(2000, 'fire_works')).toBe(400)
  })

  it('fire_works: returns 0 when display above $40.00 threshold', () => {
    // base 3756 → display round(3756×1.065) = 4000 → at threshold → no fee
    expect(calculateSmallOrderFee(3756, 'fire_works')).toBe(0)
  })

  it('falls back to default ($10/$1.00) for unknown vertical', () => {
    expect(calculateSmallOrderFee(300, 'unknown_vertical')).toBe(DEFAULT_SMALL_ORDER_FEE.feeCents)
    // base 940 → display 1001 → above 1000 → no fee
    expect(calculateSmallOrderFee(940, 'unknown_vertical')).toBe(0)
  })

  it('falls back to default ($10/$1.00) when no vertical provided', () => {
    expect(calculateSmallOrderFee(300)).toBe(DEFAULT_SMALL_ORDER_FEE.feeCents)
    // base 940 → display 1001 → above 1000 → no fee
    expect(calculateSmallOrderFee(940)).toBe(0)
  })

  it('returns fee for zero subtotal', () => {
    expect(calculateSmallOrderFee(0, 'food_trucks')).toBe(50)
    expect(calculateSmallOrderFee(0, 'farmers_market')).toBe(100)
    expect(calculateSmallOrderFee(0, 'fire_works')).toBe(400)
  })
})

// ── MP-R13: Per-vertical thresholds ─────────────────────────────────
describe('MP-R13: getSmallOrderFeeConfig', () => {
  it('returns config for known verticals', () => {
    for (const [vertical, expected] of Object.entries(SMALL_ORDER_FEE_DEFAULTS)) {
      const config = getSmallOrderFeeConfig(vertical)
      expect(config.thresholdCents).toBe(expected.thresholdCents)
      expect(config.feeCents).toBe(expected.feeCents)
    }
  })

  it('returns default for unknown vertical', () => {
    const config = getSmallOrderFeeConfig('unknown_vertical')
    expect(config).toEqual(DEFAULT_SMALL_ORDER_FEE)
  })

  it('returns default when no vertical provided', () => {
    const config = getSmallOrderFeeConfig()
    expect(config).toEqual(DEFAULT_SMALL_ORDER_FEE)
  })
})
