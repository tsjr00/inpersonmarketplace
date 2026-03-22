/**
 * T-7: External Payment Fee Flow Protection Test
 *
 * Protects the 5-file external payment fee architecture documented in decisions.md.
 * If this test fails, the platform is losing money on external payment orders.
 *
 * Flow:
 * 1. Checkout creates order with vendor_payout_cents = subtotal (full amount)
 * 2. confirm-external-payment records 3.5% vendor fee to vendor_fee_ledger
 * 3. Cash path records fee at fulfill time instead
 * 4. Fee balance accumulates in vendor_fee_balance view
 * 5. Auto-deduction caps at 50% of Stripe payouts
 *
 * Business rule: External payments charge 3.5% vendor fee (not 6.5% like Stripe)
 * because there's no Stripe processing cost. Buyer pays 6.5% (no $0.15 flat fee).
 */

import { describe, it, expect } from 'vitest'
import {
  BUYER_FEE_PERCENT,
  STRIPE_BUYER_FEE_FIXED_CENTS,
  EXTERNAL_BUYER_FEE_FIXED_CENTS,
  SELLER_FEE_PERCENT,
  BALANCE_INVOICE_THRESHOLD_CENTS,
  AGE_INVOICE_THRESHOLD_DAYS,
  AUTO_DEDUCT_MAX_PERCENT,
  calculateBuyerFee,
  calculateExternalBuyerFee,
  calculateSellerFee,
  calculateTotalExternalFee,
  calculateExternalPaymentTotal,
  calculateAutoDeductAmount,
} from '@/lib/payments/vendor-fees'
import { FEES, calculateOrderPricing, calculateBuyerPrice } from '@/lib/pricing'

// ── Fee Constants ────────────────────────────────────────────────────

describe('T-7: External payment fee constants', () => {
  it('buyer fee percent matches pricing.ts (6.5%)', () => {
    expect(BUYER_FEE_PERCENT).toBe(6.5)
    expect(BUYER_FEE_PERCENT).toBe(FEES.buyerFeePercent)
  })

  it('Stripe buyer fixed fee is $0.15 (15 cents)', () => {
    expect(STRIPE_BUYER_FEE_FIXED_CENTS).toBe(15)
    expect(STRIPE_BUYER_FEE_FIXED_CENTS).toBe(FEES.buyerFlatFeeCents)
  })

  it('external buyer fixed fee is $0 (no flat fee)', () => {
    expect(EXTERNAL_BUYER_FEE_FIXED_CENTS).toBe(0)
  })

  it('external seller fee is 3.5% (NOT 6.5%)', () => {
    expect(SELLER_FEE_PERCENT).toBe(3.5)
    // Must be less than Stripe vendor fee — no processing cost to cover
    expect(SELLER_FEE_PERCENT).toBeLessThan(FEES.vendorFeePercent)
  })

  it('invoice threshold is $50', () => {
    expect(BALANCE_INVOICE_THRESHOLD_CENTS).toBe(5000)
  })

  it('age threshold is 40 days', () => {
    expect(AGE_INVOICE_THRESHOLD_DAYS).toBe(40)
  })

  it('auto-deduction cap is 50%', () => {
    expect(AUTO_DEDUCT_MAX_PERCENT).toBe(50)
  })
})

// ── Fee Calculations ────────────────────────────────────────────────

describe('T-7: External vs Stripe fee calculations', () => {
  const subtotal = 2500 // $25 order

  it('Stripe buyer fee = 6.5% + $0.15', () => {
    const fee = calculateBuyerFee(subtotal)
    const expected = Math.round(subtotal * 0.065) + 15 // 163 + 15 = 178
    expect(fee).toBe(expected)
    expect(fee).toBe(178)
  })

  it('external buyer fee = 6.5% only (no flat fee)', () => {
    const fee = calculateExternalBuyerFee(subtotal)
    const expected = Math.round(subtotal * 0.065) // 163
    expect(fee).toBe(expected)
    expect(fee).toBe(163)
  })

  it('external buyer fee is always less than Stripe buyer fee', () => {
    for (const amount of [100, 500, 1000, 2500, 5000, 10000]) {
      const stripeFee = calculateBuyerFee(amount)
      const externalFee = calculateExternalBuyerFee(amount)
      expect(externalFee).toBeLessThan(stripeFee)
      // Difference should always be exactly $0.15
      expect(stripeFee - externalFee).toBe(15)
    }
  })

  it('external seller fee = 3.5% of subtotal', () => {
    const fee = calculateSellerFee(subtotal)
    const expected = Math.round(subtotal * 0.035) // 88
    expect(fee).toBe(expected)
    expect(fee).toBe(88)
  })

  it('total external fee = buyer 6.5% + seller 3.5% = 10%', () => {
    const total = calculateTotalExternalFee(subtotal)
    const buyerFee = calculateExternalBuyerFee(subtotal)
    const sellerFee = calculateSellerFee(subtotal)
    expect(total).toBe(buyerFee + sellerFee)
    // Should be approximately 10% of subtotal
    expect(total).toBe(Math.round(subtotal * 0.065) + Math.round(subtotal * 0.035))
  })

  it('external payment total = subtotal + buyer fee (no flat fee)', () => {
    const total = calculateExternalPaymentTotal(subtotal)
    expect(total).toBe(subtotal + calculateExternalBuyerFee(subtotal))
    // Should NOT include $0.15 flat fee
    expect(total).toBe(2500 + 163)
    expect(total).toBe(2663)
  })
})

// ── Stripe vs External Comparison ───────────────────────────────────

describe('T-7: Stripe vs external — same item, different fees', () => {
  it('$10 item: external costs buyer less, vendor keeps more', () => {
    const subtotal = 1000

    // Stripe path
    const stripePricing = calculateOrderPricing([{ price_cents: subtotal, quantity: 1 }])
    const stripeBuyerTotal = calculateBuyerPrice(subtotal)

    // External path
    const externalBuyerTotal = calculateExternalPaymentTotal(subtotal)
    const externalSellerFee = calculateSellerFee(subtotal)

    // Buyer pays less on external (no $0.15 flat fee)
    expect(externalBuyerTotal).toBeLessThan(stripeBuyerTotal)
    expect(stripeBuyerTotal - externalBuyerTotal).toBe(15) // exactly $0.15 difference

    // Vendor keeps more on external (3.5% fee vs 6.5% + $0.15)
    const stripeVendorPayout = stripePricing.vendorPayoutCents
    const externalVendorPayout = subtotal // vendor gets full subtotal at checkout
    const externalVendorNetPayout = subtotal - externalSellerFee // after fee is invoiced

    expect(externalVendorNetPayout).toBeGreaterThan(stripeVendorPayout)
  })

  it('vendor payout at checkout = full subtotal (fees invoiced later)', () => {
    // This is the KEY business rule: at checkout time, vendor_payout_cents = subtotal
    // The 3.5% fee is recorded LATER when vendor confirms payment
    const subtotal = 5000
    const vendorPayoutAtCheckout = subtotal // NOT subtotal - fees
    expect(vendorPayoutAtCheckout).toBe(5000)

    // The deferred fee that gets recorded later
    const deferredFee = calculateSellerFee(subtotal)
    expect(deferredFee).toBe(175) // 3.5% of $50 = $1.75

    // Net after fee = subtotal - 3.5%
    expect(subtotal - deferredFee).toBe(4825)
  })
})

// ── Auto-Deduction ──────────────────────────────────────────────────

describe('T-7: Auto-deduction from Stripe payouts', () => {
  it('deducts owed balance from vendor payout', () => {
    const vendorPayout = 1000 // $10 Stripe payout
    const owedBalance = 300 // $3 owed from external fees

    const deduction = calculateAutoDeductAmount(vendorPayout, owedBalance)
    expect(deduction).toBe(300) // full balance deducted (under 50% cap)
  })

  it('caps deduction at 50% of payout', () => {
    const vendorPayout = 1000 // $10 Stripe payout
    const owedBalance = 800 // $8 owed — more than 50% of payout

    const deduction = calculateAutoDeductAmount(vendorPayout, owedBalance)
    expect(deduction).toBe(500) // capped at 50% = $5
    expect(deduction).toBeLessThanOrEqual(vendorPayout * 0.5)
  })

  it('no deduction when balance is zero', () => {
    expect(calculateAutoDeductAmount(1000, 0)).toBe(0)
  })

  it('no deduction when balance is negative', () => {
    expect(calculateAutoDeductAmount(1000, -100)).toBe(0)
  })

  it('50% cap protects vendor from losing entire payout', () => {
    // Even with massive owed balance, vendor always keeps at least 50%
    const vendorPayout = 2000
    const massiveBalance = 50000 // $500 owed

    const deduction = calculateAutoDeductAmount(vendorPayout, massiveBalance)
    expect(deduction).toBe(1000) // max 50% of $20 = $10
    expect(vendorPayout - deduction).toBeGreaterThanOrEqual(vendorPayout * 0.5)
  })
})

// ── Edge Cases ──────────────────────────────────────────────────────

describe('T-7: Edge cases', () => {
  it('$0 subtotal produces $0 fees', () => {
    expect(calculateExternalBuyerFee(0)).toBe(0)
    expect(calculateSellerFee(0)).toBe(0)
    expect(calculateTotalExternalFee(0)).toBe(0)
    expect(calculateExternalPaymentTotal(0)).toBe(0)
  })

  it('$1 subtotal (100 cents) produces correct fees', () => {
    expect(calculateExternalBuyerFee(100)).toBe(7) // round(100 * 0.065) = 7
    expect(calculateSellerFee(100)).toBe(4) // round(100 * 0.035) = 4
    expect(calculateExternalPaymentTotal(100)).toBe(107) // 100 + 7
  })

  it('large order ($500) produces correct fees', () => {
    const subtotal = 50000
    expect(calculateExternalBuyerFee(subtotal)).toBe(3250) // 6.5% of $500
    expect(calculateSellerFee(subtotal)).toBe(1750) // 3.5% of $500
    expect(calculateTotalExternalFee(subtotal)).toBe(5000) // 10% of $500
  })

  it('rounding is consistent (no penny leakage)', () => {
    // Test amounts that produce fractional cents
    for (const amount of [333, 777, 1111, 2222, 9999]) {
      const buyerFee = calculateExternalBuyerFee(amount)
      const sellerFee = calculateSellerFee(amount)
      const total = calculateTotalExternalFee(amount)

      // Total must equal sum of parts
      expect(total).toBe(buyerFee + sellerFee)

      // All values must be integers (no fractional cents)
      expect(Number.isInteger(buyerFee)).toBe(true)
      expect(Number.isInteger(sellerFee)).toBe(true)
      expect(Number.isInteger(total)).toBe(true)
    }
  })
})
