/**
 * Subscription Amounts & Stripe Config — Functional Tests
 *
 * Tests subscription pricing constants, Stripe config consistency,
 * and cancellation flat fee proration specifics.
 *
 * Covers gaps: PF-023 through PF-025, PP-001, PP-002, CX-014
 *
 * IMPORTANT: Expected values come from BUSINESS RULES, not from reading code.
 * If a test fails, investigate the code — do NOT change the test.
 * See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/__tests__/subscription-amounts-functional.test.ts
 */
import { describe, it, expect } from 'vitest'
import { SUBSCRIPTION_AMOUNTS, FEES, proratedFlatFeeSimple } from '@/lib/pricing'
import { STRIPE_CONFIG } from '@/lib/stripe/config'
import { calculateCancellationFee, CANCELLATION_FEE_PERCENT } from '@/lib/payments/cancellation-fees'

// =============================================================================
// PF-023: FM subscription amounts
// =============================================================================

describe('PF-023: FM subscription pricing (legacy aliases)', () => {
  it('FM Standard monthly = $0 (free tier)', () => {
    expect(SUBSCRIPTION_AMOUNTS.fm_standard_monthly_cents).toBe(0)
  })

  it('FM Standard annual = $0 (free tier)', () => {
    expect(SUBSCRIPTION_AMOUNTS.fm_standard_annual_cents).toBe(0)
  })

  it('FM Premium monthly = $25.00 (2500 cents, alias for pro)', () => {
    expect(SUBSCRIPTION_AMOUNTS.fm_premium_monthly_cents).toBe(2500)
  })

  it('FM Premium annual = $208.15 (20815 cents, alias for pro)', () => {
    expect(SUBSCRIPTION_AMOUNTS.fm_premium_annual_cents).toBe(20815)
  })

  it('FM Featured monthly = $50.00 (5000 cents, alias for boss)', () => {
    expect(SUBSCRIPTION_AMOUNTS.fm_featured_monthly_cents).toBe(5000)
  })

  it('FM Featured annual = $481.50 (48150 cents, alias for boss)', () => {
    expect(SUBSCRIPTION_AMOUNTS.fm_featured_annual_cents).toBe(48150)
  })
})

// =============================================================================
// PF-024: FT subscription amounts
// =============================================================================

describe('PF-024: FT subscription pricing (legacy aliases)', () => {
  it('FT Basic monthly = $0 (free tier)', () => {
    expect(SUBSCRIPTION_AMOUNTS.ft_basic_monthly_cents).toBe(0)
  })

  it('FT Basic annual = $0 (free tier)', () => {
    expect(SUBSCRIPTION_AMOUNTS.ft_basic_annual_cents).toBe(0)
  })

  it('FT Pro monthly = $25.00 (2500 cents)', () => {
    expect(SUBSCRIPTION_AMOUNTS.ft_pro_monthly_cents).toBe(2500)
  })

  it('FT Pro annual = $208.15 (20815 cents)', () => {
    expect(SUBSCRIPTION_AMOUNTS.ft_pro_annual_cents).toBe(20815)
  })

  it('FT Boss monthly = $50.00 (5000 cents)', () => {
    expect(SUBSCRIPTION_AMOUNTS.ft_boss_monthly_cents).toBe(5000)
  })

  it('FT Boss annual = $481.50 (48150 cents)', () => {
    expect(SUBSCRIPTION_AMOUNTS.ft_boss_annual_cents).toBe(48150)
  })
})

// =============================================================================
// PF-025: Buyer Premium subscription amounts
// =============================================================================

describe('PF-025: Buyer Premium subscription pricing', () => {
  it('Buyer Premium monthly = $9.99 (999 cents)', () => {
    expect(SUBSCRIPTION_AMOUNTS.buyer_monthly_cents).toBe(999)
  })

  it('Buyer Premium annual = $81.50 (8150 cents)', () => {
    expect(SUBSCRIPTION_AMOUNTS.buyer_annual_cents).toBe(8150)
  })
})

// =============================================================================
// PP-001: STRIPE_CONFIG.applicationFeePercent = 13%
// =============================================================================

describe('PP-001: Stripe application fee is 13% (buyer + vendor)', () => {
  it('applicationFeePercent equals 13', () => {
    expect(STRIPE_CONFIG.applicationFeePercent).toBe(13)
  })

  it('equals buyerFeePercent + vendorFeePercent', () => {
    expect(STRIPE_CONFIG.applicationFeePercent).toBe(
      STRIPE_CONFIG.buyerFeePercent + STRIPE_CONFIG.vendorFeePercent
    )
  })
})

// =============================================================================
// PP-002: Stripe config mirrors pricing.ts FEES
// =============================================================================

describe('PP-002: Stripe config matches pricing.ts single source of truth', () => {
  it('buyerFeePercent matches FEES', () => {
    expect(STRIPE_CONFIG.buyerFeePercent).toBe(FEES.buyerFeePercent)
  })

  it('vendorFeePercent matches FEES', () => {
    expect(STRIPE_CONFIG.vendorFeePercent).toBe(FEES.vendorFeePercent)
  })

  it('buyerFlatFeeCents matches FEES', () => {
    expect(STRIPE_CONFIG.buyerFlatFeeCents).toBe(FEES.buyerFlatFeeCents)
  })

  it('vendorFlatFeeCents matches FEES', () => {
    expect(STRIPE_CONFIG.vendorFlatFeeCents).toBe(FEES.vendorFlatFeeCents)
  })
})

// =============================================================================
// CX-014: Cancellation uses floor-based proration (proratedFlatFeeSimple)
// =============================================================================

describe('CX-014: Cancellation flat fee uses floor-based proration', () => {
  it('2-item order: flat fee per item = floor(15/2) = 7 (not 8)', () => {
    expect(proratedFlatFeeSimple(15, 2)).toBe(7)
  })

  it('3-item order: flat fee per item = floor(15/3) = 5', () => {
    expect(proratedFlatFeeSimple(15, 3)).toBe(5)
  })

  it('cancellation fee for 2-item order uses floor-prorated flat fee', () => {
    // For a $10 item in a 2-item order, past grace, vendor confirmed:
    // buyerFee = round(1000 × 0.065) + floor(15/2) = 65 + 7 = 72
    // buyerPaid = 1000 + 72 = 1072
    // refund = round(1072 × 0.75) = round(804) = 804
    // fee = 1072 - 804 = 268
    const result = calculateCancellationFee({
      subtotalCents: 1000,
      totalItemsInOrder: 2,
      orderStatus: 'confirmed',
      orderCreatedAt: new Date('2026-03-14T10:00:00Z'),
      vertical: 'farmers_market',
      now: new Date('2026-03-14T12:00:00Z'), // 2 hours later (past 1hr grace)
    })
    expect(result.feeApplied).toBe(true)
    // Verify the flat fee used was 7 (floor), not 8 (ceil)
    // buyerPaid = 1000 + 65 + 7 = 1072
    expect(result.refundAmountCents + result.cancellationFeeCents).toBe(1072)
    expect(result.cancellationFeeCents).toBe(268) // 1072 - round(1072×0.75) = 1072 - 804 = 268
    expect(result.refundAmountCents).toBe(804)
  })
})
