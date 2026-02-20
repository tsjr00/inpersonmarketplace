import { describe, it, expect } from 'vitest'
import {
  calculateAutoDeductAmount,
  calculateTotalExternalFee,
  calculateSellerFee,
  calculateExternalBuyerFee,
  calculateBuyerFee,
  AUTO_DEDUCT_MAX_PERCENT,
} from '@/lib/payments/vendor-fees'

describe('calculateAutoDeductAmount', () => {
  it('deducts full owed amount when under 50% cap', () => {
    // Payout $100 (10000), owed $30 (3000). 50% of 10000 = 5000. 3000 < 5000 → deduct 3000
    expect(calculateAutoDeductAmount(10000, 3000)).toBe(3000)
  })

  it('caps deduction at 50% of payout', () => {
    // Payout $10 (1000), owed $30 (3000). 50% of 1000 = 500. 3000 > 500 → deduct 500
    expect(calculateAutoDeductAmount(1000, 3000)).toBe(500)
  })

  it('returns 0 when nothing is owed', () => {
    expect(calculateAutoDeductAmount(10000, 0)).toBe(0)
  })

  it('returns 0 when owed amount is negative', () => {
    expect(calculateAutoDeductAmount(10000, -100)).toBe(0)
  })
})

describe('calculateTotalExternalFee', () => {
  it('sums buyer 6.5% + seller 3.5% = 10% total', () => {
    // $100 subtotal: buyer 6.5% = 650, seller 3.5% = 350, total = 1000
    expect(calculateTotalExternalFee(10000)).toBe(1000)
  })
})

describe('calculateSellerFee', () => {
  it('calculates 3.5% of subtotal', () => {
    expect(calculateSellerFee(10000)).toBe(350)
  })
})

describe('calculateExternalBuyerFee', () => {
  it('calculates 6.5% without flat fee', () => {
    expect(calculateExternalBuyerFee(10000)).toBe(650)
  })
})

describe('calculateBuyerFee', () => {
  it('calculates 6.5% + $0.15 flat fee', () => {
    // $100 subtotal: round(10000 * 0.065) + 15 = 650 + 15 = 665
    expect(calculateBuyerFee(10000)).toBe(665)
  })
})
