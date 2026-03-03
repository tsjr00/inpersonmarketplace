import { describe, it, expect } from 'vitest'
import {
  calculateOrderPricing,
  calculateBuyerPrice,
  calculateItemDisplayPrice,
  calculateVendorPayout,
  calculateSmallOrderFee,
  getSmallOrderFeeConfig,
  amountToAvoidSmallOrderFee,
  formatPrice,
  FEES,
  SMALL_ORDER_FEE_DEFAULTS,
} from '@/lib/pricing'

/**
 * End-to-end order pricing tests.
 * Validates complete pricing scenarios that a real order would encounter,
 * including multi-item orders, tip calculations, and per-vertical minimums.
 *
 * Business Rules Covered:
 * MP-R1: Buyer fee = 6.5% + $0.15 flat (Stripe)
 * MP-R2: Vendor fee = 6.5%, prorated per item
 * MP-R5: Small order fee when displayed subtotal < threshold
 * MP-R9: Per-item rounding (display subtotal = sum of per-item prices)
 * MP-R11: External buyer fee = 6.5%, NO flat fee
 * MP-R12: Flat fee prorated across items
 * MP-R13: No minimum rejection, small order fee instead
 */

describe('Order Pricing — Real-World Scenarios', () => {
  describe('Scenario: FM buyer orders 3 items from a farm vendor', () => {
    const items = [
      { price_cents: 800, quantity: 2 },   // Organic tomatoes $8 x2
      { price_cents: 1200, quantity: 1 },  // Fresh bread $12
      { price_cents: 450, quantity: 3 },   // Herb bundle $4.50 x3
    ]

    it('calculates correct subtotal', () => {
      const pricing = calculateOrderPricing(items)
      // 800*2 + 1200*1 + 450*3 = 1600 + 1200 + 1350 = 4150
      expect(pricing.subtotalCents).toBe(4150)
    })

    it('buyer total includes both percentage and flat fees', () => {
      const pricing = calculateOrderPricing(items)
      // Buyer: 4150 * 0.065 = 269.75 → 270 + 15 flat = 4435
      expect(pricing.buyerPercentFeeCents).toBe(270)
      expect(pricing.buyerFlatFeeCents).toBe(15)
      expect(pricing.buyerTotalCents).toBe(4435)
    })

    it('vendor payout deducts both fees from subtotal', () => {
      const pricing = calculateOrderPricing(items)
      // Vendor: 4150 - 270 - 15 = 3865
      expect(pricing.vendorPayoutCents).toBe(3865)
    })

    it('platform captures all fees', () => {
      const pricing = calculateOrderPricing(items)
      // Platform: buyer% + buyerFlat + vendor% + vendorFlat = 270 + 15 + 270 + 15 = 570
      expect(pricing.platformFeeCents).toBe(570)
    })

    it('money in = money out (conservation)', () => {
      const pricing = calculateOrderPricing(items)
      // Buyer pays → vendor gets + platform gets
      expect(pricing.buyerTotalCents).toBe(pricing.vendorPayoutCents + pricing.platformFeeCents)
    })
  })

  describe('Scenario: FT buyer orders a single $5 taco', () => {
    const items = [{ price_cents: 500, quantity: 1 }]

    it('calculates correct pricing for small order', () => {
      const pricing = calculateOrderPricing(items)
      expect(pricing.subtotalCents).toBe(500)
      // Buyer: 500 * 0.065 = 32.5 → 33 + 15 = 548
      expect(pricing.buyerTotalCents).toBe(548)
    })

    it('avoids FT small order fee ($5) but not FM fee ($10)', () => {
      // base 500 → display 533 → above FT threshold (500), below FM threshold (1000)
      expect(calculateSmallOrderFee(500, 'food_trucks')).toBe(0)
      expect(calculateSmallOrderFee(500, 'farmers_market')).toBe(100)
    })
  })

  describe('Scenario: Per-item display price vs order-level pricing', () => {
    // This is a critical rounding scenario that caused bugs before (Session 40)
    // calculateItemDisplayPrice: round(price * 1.065) — NO flat fee (per-item display)
    // calculateBuyerPrice: round(subtotal * 1.065) + 15 — WITH flat fee (order total)
    it('per-item display price excludes flat fee, order-level includes it', () => {
      // $9 item — per-item display: round(900 * 1.065) = 959
      const perItem = calculateItemDisplayPrice(900)
      expect(perItem).toBe(959)

      // 2x $9 items — order-level: round(1800 * 1.065) + 15 = 1917 + 15 = 1932
      const orderLevel = calculateBuyerPrice(1800)
      expect(orderLevel).toBe(1932)

      // Per-item total (959 * 2 = 1918) != order-level total (1932)
      // Difference is: rounding variance + flat fee
      expect(perItem * 2).not.toBe(orderLevel)
    })

    it('tip should be based on display subtotal (per-item rounding), not base price', () => {
      const itemPrice = 900
      const quantity = 2
      const displaySubtotal = calculateItemDisplayPrice(itemPrice) * quantity
      // Display subtotal: 959 * 2 = 1918
      expect(displaySubtotal).toBe(1918)

      // 15% tip on display subtotal: round(1918 * 0.15) = 288
      const tipPercent = 15
      const tipAmount = Math.round(displaySubtotal * tipPercent / 100)
      expect(tipAmount).toBe(288)
    })
  })

  describe('Money Conservation — buyer total = vendor payout + platform fee', () => {
    const scenarios = [
      { name: 'single cheap item', items: [{ price_cents: 100, quantity: 1 }] },
      { name: 'single expensive item', items: [{ price_cents: 50000, quantity: 1 }] },
      { name: 'many cheap items', items: [{ price_cents: 100, quantity: 20 }] },
      { name: 'mixed items', items: [
        { price_cents: 999, quantity: 1 },
        { price_cents: 1, quantity: 1 },
        { price_cents: 5000, quantity: 3 },
      ]},
      { name: 'round dollar amounts', items: [{ price_cents: 1000, quantity: 5 }] },
      { name: 'penny amounts', items: [{ price_cents: 1, quantity: 100 }] },
    ]

    for (const scenario of scenarios) {
      it(`conserves money for: ${scenario.name}`, () => {
        const pricing = calculateOrderPricing(scenario.items)
        expect(pricing.buyerTotalCents).toBe(pricing.vendorPayoutCents + pricing.platformFeeCents)
      })

      it(`all amounts are non-negative for: ${scenario.name}`, () => {
        const pricing = calculateOrderPricing(scenario.items)
        expect(pricing.subtotalCents).toBeGreaterThanOrEqual(0)
        expect(pricing.buyerTotalCents).toBeGreaterThanOrEqual(0)
        expect(pricing.vendorPayoutCents).toBeGreaterThanOrEqual(0)
        expect(pricing.platformFeeCents).toBeGreaterThanOrEqual(0)
      })

      it(`all amounts are integers for: ${scenario.name}`, () => {
        const pricing = calculateOrderPricing(scenario.items)
        expect(Number.isInteger(pricing.subtotalCents)).toBe(true)
        expect(Number.isInteger(pricing.buyerTotalCents)).toBe(true)
        expect(Number.isInteger(pricing.vendorPayoutCents)).toBe(true)
        expect(Number.isInteger(pricing.platformFeeCents)).toBe(true)
      })
    }
  })
})

describe('Per-Vertical Small Order Fee Thresholds', () => {
  it('FM threshold is $10 (1000 cents), fee is $1.00', () => {
    const config = getSmallOrderFeeConfig('farmers_market')
    expect(config.thresholdCents).toBe(1000)
    expect(config.feeCents).toBe(100)
  })

  it('FT threshold is $5 (500 cents), fee is $0.50', () => {
    const config = getSmallOrderFeeConfig('food_trucks')
    expect(config.thresholdCents).toBe(500)
    expect(config.feeCents).toBe(50)
  })

  it('fire_works threshold is $40 (4000 cents), fee is $4.00', () => {
    const config = getSmallOrderFeeConfig('fire_works')
    expect(config.thresholdCents).toBe(4000)
    expect(config.feeCents).toBe(400)
  })

  it('unknown vertical gets FM default threshold', () => {
    const config = getSmallOrderFeeConfig('unknown_vertical')
    expect(config.thresholdCents).toBe(SMALL_ORDER_FEE_DEFAULTS.farmers_market.thresholdCents)
  })

  it('amountToAvoidSmallOrderFee boundary check — exactly at threshold returns 0', () => {
    // FM: base 940 → display 1001 → at/above 1000 → 0
    expect(amountToAvoidSmallOrderFee(940, 'farmers_market')).toBe(0)
    // FM: base 939 → display round(939×1.065) = 1000 → at threshold → 0
    expect(amountToAvoidSmallOrderFee(939, 'farmers_market')).toBe(0)
    // FM: base 938 → display round(938×1.065) = 999 → below → 1
    expect(amountToAvoidSmallOrderFee(938, 'farmers_market')).toBe(1)
  })
})

describe('Small Order Fee', () => {
  it('FM: applies $1.00 fee when displayed subtotal below $10.00', () => {
    // base 300 → display 320 → below 1000 → fee $1.00
    expect(calculateSmallOrderFee(300, 'farmers_market')).toBe(100)
  })

  it('FM: no fee when displayed subtotal at or above threshold', () => {
    // base 940 → display 1001 → above 1000 → no fee
    expect(calculateSmallOrderFee(940, 'farmers_market')).toBe(0)
  })

  it('FT: no fee for large orders', () => {
    expect(calculateSmallOrderFee(5000, 'food_trucks')).toBe(0)
  })
})

describe('Fee Configuration Integrity', () => {
  it('buyer and vendor percentage fees are equal', () => {
    expect(FEES.buyerFeePercent).toBe(FEES.vendorFeePercent)
  })

  it('buyer and vendor flat fees are equal', () => {
    expect(FEES.buyerFlatFeeCents).toBe(FEES.vendorFlatFeeCents)
  })

  it('percentage fee is 6.5%', () => {
    expect(FEES.buyerFeePercent).toBe(6.5)
  })

  it('flat fee is $0.15', () => {
    expect(FEES.buyerFlatFeeCents).toBe(15)
  })
})

describe('Price Formatting', () => {
  it('formats cents to dollar string', () => {
    expect(formatPrice(1000)).toBe('$10.00')
    expect(formatPrice(999)).toBe('$9.99')
    expect(formatPrice(1)).toBe('$0.01')
    expect(formatPrice(0)).toBe('$0.00')
  })

  it('handles large amounts', () => {
    // formatPrice uses simple division, no locale comma separators
    expect(formatPrice(100000)).toBe('$1000.00')
    expect(formatPrice(999999)).toBe('$9999.99')
  })
})
