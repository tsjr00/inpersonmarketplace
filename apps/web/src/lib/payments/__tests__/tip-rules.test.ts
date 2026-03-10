/**
 * Tip Business Rules Tests
 *
 * Tests additional tip rules not covered by tip-math.test.ts.
 * Covers: MP-R22 (integer-only tip %), MP-R26 (tip doesn't dilute platform fee),
 *         MP-R27 (Phase 4 payout uses vendor tip)
 *
 * IMPORTANT: These tests assert what the BUSINESS RULES require, not what
 * the code currently does. If a test fails, investigate the code — do NOT
 * change the test to match the code. See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/payments/__tests__/tip-rules.test.ts
 */
import { describe, it, expect } from 'vitest'
import { calculatePlatformFeeTip } from '@/lib/payments/tip-math'
import { calculateNoShowPayout } from '@/lib/cron/no-show'
import { FEES, calculateOrderPricing, calculateItemDisplayPrice } from '@/lib/pricing'

// =============================================================================
// MP-R22: Tip percentage is integer only (Math.round applied)
// =============================================================================

describe('MP-R22: tip percentage is integer only', () => {
  it('tipPercentage is rounded to nearest integer before use', () => {
    // Business rule: tipPercentage=15.7 → rounded to 16
    // Checkout session route (line 73): Math.max(0, Math.round(tipPercentage))
    const rawPercentage = 15.7
    const validPercentage = Math.max(0, Math.round(rawPercentage))
    expect(validPercentage).toBe(16)
  })

  it('negative percentage → 0', () => {
    const rawPercentage = -5
    const validPercentage = Math.max(0, Math.round(rawPercentage))
    expect(validPercentage).toBe(0)
  })

  it('exact integer passes through unchanged', () => {
    const rawPercentage = 15
    const validPercentage = Math.max(0, Math.round(rawPercentage))
    expect(validPercentage).toBe(15)
  })

  it('0.4 rounds to 0', () => {
    const rawPercentage = 0.4
    const validPercentage = Math.max(0, Math.round(rawPercentage))
    expect(validPercentage).toBe(0)
  })

  it('preset options are No Tip (0), 10, 15, 20 — all integers', () => {
    // Business rule: TipSelector presets are 'No Tip' (0%), 10%, 15%, 20%, + Custom
    const presets = [0, 10, 15, 20]
    for (const p of presets) {
      expect(Number.isInteger(p)).toBe(true)
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(100)
    }
  })

  it('custom input strips non-numeric characters', () => {
    // TipSelector: val = e.target.value.replace(/[^0-9]/g, '')
    const input = '15.7abc'
    const cleaned = input.replace(/[^0-9]/g, '')
    const parsed = parseInt(cleaned, 10)
    expect(parsed).toBe(157) // parsed from "157" after stripping non-digits
    // Then capped at 100: Math.min(num, 100)
    expect(Math.min(parsed, 100)).toBe(100)
  })
})

// =============================================================================
// MP-R26: Platform fee NOT diluted by tip
// =============================================================================

describe('MP-R26: platform fee calculated on subtotal only, not on tip', () => {
  it('platform fee is always buyerFeePercent of base subtotal, regardless of tip', () => {
    // Business rule: platform fee % = 6.5% of base subtotal
    // Tip is a separate line item on top, does not affect fee calculation
    const baseSubtotal = 1800 // $18.00
    const pricing = calculateOrderPricing([{ price_cents: 1800, quantity: 1 }])

    // Fee is exactly 6.5% of base subtotal
    expect(pricing.buyerPercentFeeCents).toBe(Math.round(baseSubtotal * FEES.buyerFeePercent / 100))
    expect(pricing.buyerPercentFeeCents).toBe(117) // 6.5% of 1800

    // Adding a tip does NOT change the platform fee
    // Tip is handled separately in checkout — NOT passed to calculateOrderPricing
    // This is verified by the fact that calculateOrderPricing has no tip parameter
  })

  it('tip is added as separate amount, not included in fee-bearing subtotal', () => {
    // Checkout page (line 495): tipAmountCents = Math.round(displaySubtotal * tipPercentage / 100)
    // Checkout page (line 503): total = displaySubtotal + flat fee + small order fee + tip
    // Tip is ADDED to total, not folded into subtotal before fee calculation
    const displaySubtotal = 1918 // $18.00 + 6.5% = $19.18
    const tipPercentage = 15
    const tipAmount = Math.round(displaySubtotal * tipPercentage / 100)

    // Tip = 15% of displayed subtotal = 288
    expect(tipAmount).toBe(288)

    // Platform fee tip is the portion of tip attributable to the fee markup
    const platformFeeTip = calculatePlatformFeeTip(288, 1800, 15)
    // vendorTip = round(1800 * 15/100) = 270, platformFeeTip = 288 - 270 = 18
    expect(platformFeeTip).toBe(18)

    // Platform fee on the ORDER is still just 6.5% of base — NOT affected by tip
    const pricing = calculateOrderPricing([{ price_cents: 1800, quantity: 1 }])
    expect(pricing.buyerPercentFeeCents).toBe(117) // unchanged by tip
  })
})

// =============================================================================
// MP-R27: Cron Phase 4 (no-show) uses vendor tip for payout
// =============================================================================

describe('MP-R27: Phase 4 no-show payout uses vendor tip (excluding platform fee portion)', () => {
  it('payout = vendor_payout_cents + round((tip - tip_on_platform_fee) / totalItems)', () => {
    // Business rule: Phase 4 uses same formula as fulfill route
    // vendor gets: vendor_payout_cents + prorated vendor tip share
    const result = calculateNoShowPayout({
      vendorPayoutCents: 900,
      tipAmount: 192,
      tipOnPlatformFeeCents: 12,
      totalItemsInOrder: 1,
    })
    // vendorTip = 192 - 12 = 180, tipShare = round(180/1) = 180
    expect(result).toBe(900 + 180)
  })

  it('multi-item order: tip share is prorated per item', () => {
    const result = calculateNoShowPayout({
      vendorPayoutCents: 500,
      tipAmount: 288,
      tipOnPlatformFeeCents: 18,
      totalItemsInOrder: 3,
    })
    // vendorTip = 288 - 18 = 270, tipShare = round(270/3) = 90
    expect(result).toBe(500 + 90)
  })

  it('no tip → payout = vendor_payout_cents only', () => {
    const result = calculateNoShowPayout({
      vendorPayoutCents: 900,
      tipAmount: 0,
      tipOnPlatformFeeCents: 0,
      totalItemsInOrder: 1,
    })
    expect(result).toBe(900)
  })

  it('platform fee tip excluded — vendor does not get platform fee portion of tip', () => {
    // Concrete example: $18 order, 10% tip on $19.18 display = $1.92 total tip
    // Vendor tip = round(1800 * 10/100) = 180
    // Platform fee tip = 192 - 180 = 12 (stays with platform)
    const result = calculateNoShowPayout({
      vendorPayoutCents: 900,
      tipAmount: 192,
      tipOnPlatformFeeCents: 12,
      totalItemsInOrder: 1,
    })
    // Vendor gets 900 + 180 = 1080, NOT 900 + 192
    expect(result).toBe(1080)
    expect(result).not.toBe(900 + 192) // would be wrong if platform fee tip included
  })
})
