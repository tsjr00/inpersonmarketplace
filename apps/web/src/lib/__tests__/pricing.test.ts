import { describe, it, expect } from 'vitest'
import {
  calculateOrderPricing,
  calculateBuyerPrice,
  calculateVendorPayout,
  calculateItemDisplayPrice,
  meetsMinimumOrder,
  amountToMinimum,
  formatPrice,
  getMinimumOrderCents,
  FEES,
  VERTICAL_MINIMUM_DEFAULTS,
} from '@/lib/pricing'

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

describe('calculateBuyerPrice', () => {
  it('matches calculateOrderPricing buyer total', () => {
    const subtotal = 2500
    const orderTotal = calculateOrderPricing([{ price_cents: 2500, quantity: 1 }]).buyerTotalCents
    const directTotal = calculateBuyerPrice(subtotal)
    expect(directTotal).toBe(orderTotal)
  })
})

describe('calculateVendorPayout', () => {
  it('calculates vendor payout correctly', () => {
    // $10 subtotal: 1000 - round(1000*0.065) - 15 = 1000 - 65 - 15 = 920
    expect(calculateVendorPayout(1000)).toBe(920)
  })
})

describe('calculateItemDisplayPrice', () => {
  it('adds percentage fee without flat fee', () => {
    // $10 item: 1000 + round(1000*0.065) = 1065
    expect(calculateItemDisplayPrice(1000)).toBe(1065)
  })
})

describe('meetsMinimumOrder', () => {
  it('returns false below minimum', () => {
    expect(meetsMinimumOrder(999)).toBe(false)
  })

  it('returns true at minimum', () => {
    expect(meetsMinimumOrder(1000)).toBe(true)
  })

  it('returns true above minimum', () => {
    expect(meetsMinimumOrder(1001)).toBe(true)
  })

  it('uses custom minimum when provided', () => {
    // $5.00 minimum (food trucks)
    expect(meetsMinimumOrder(499, 500)).toBe(false)
    expect(meetsMinimumOrder(500, 500)).toBe(true)
    expect(meetsMinimumOrder(501, 500)).toBe(true)
    // $40.00 minimum (fireworks)
    expect(meetsMinimumOrder(3999, 4000)).toBe(false)
    expect(meetsMinimumOrder(4000, 4000)).toBe(true)
  })
})

describe('amountToMinimum', () => {
  it('returns difference when below minimum', () => {
    expect(amountToMinimum(800)).toBe(200)
  })

  it('returns 0 when at or above minimum', () => {
    expect(amountToMinimum(1000)).toBe(0)
    expect(amountToMinimum(1500)).toBe(0)
  })

  it('uses custom minimum when provided', () => {
    // $5.00 minimum
    expect(amountToMinimum(300, 500)).toBe(200)
    expect(amountToMinimum(500, 500)).toBe(0)
    // $40.00 minimum
    expect(amountToMinimum(3000, 4000)).toBe(1000)
    expect(amountToMinimum(4000, 4000)).toBe(0)
  })
})

describe('getMinimumOrderCents', () => {
  it('returns $10.00 for farmers_market', () => {
    expect(getMinimumOrderCents('farmers_market')).toBe(1000)
  })

  it('returns $5.00 for food_trucks', () => {
    expect(getMinimumOrderCents('food_trucks')).toBe(500)
  })

  it('returns $40.00 for fire_works', () => {
    expect(getMinimumOrderCents('fire_works')).toBe(4000)
  })

  it('falls back to global minimum for unknown vertical', () => {
    expect(getMinimumOrderCents('unknown_vertical')).toBe(FEES.minimumOrderCents)
  })

  it('falls back to global minimum when no vertical provided', () => {
    expect(getMinimumOrderCents()).toBe(FEES.minimumOrderCents)
    expect(getMinimumOrderCents(undefined)).toBe(FEES.minimumOrderCents)
  })

  it('matches VERTICAL_MINIMUM_DEFAULTS for all known verticals', () => {
    for (const [vertical, expected] of Object.entries(VERTICAL_MINIMUM_DEFAULTS)) {
      expect(getMinimumOrderCents(vertical)).toBe(expected)
    }
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
