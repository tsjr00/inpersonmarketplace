/**
 * Vendor Fees — Functional Tests
 *
 * Tests external payment fee calculations, auto-deduction logic,
 * and invoice thresholds. All pure functions — no DB needed.
 *
 * Covers gaps: VF-001 through VF-010
 *
 * IMPORTANT: Expected values come from BUSINESS RULES, not from reading code.
 * If a test fails, investigate the code — do NOT change the test.
 * See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/__tests__/vendor-fees-functional.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  SELLER_FEE_PERCENT,
  BUYER_FEE_PERCENT,
  STRIPE_BUYER_FEE_FIXED_CENTS,
  EXTERNAL_BUYER_FEE_FIXED_CENTS,
  AUTO_DEDUCT_MAX_PERCENT,
  BALANCE_INVOICE_THRESHOLD_CENTS,
  AGE_INVOICE_THRESHOLD_DAYS,
  calculateBuyerFee,
  calculateExternalBuyerFee,
  calculateSellerFee,
  calculateTotalExternalFee,
  calculateExternalPaymentTotal,
  calculateAutoDeductAmount,
} from '@/lib/payments/vendor-fees'

// =============================================================================
// VF-001: External payment seller fee = 3.5%
// =============================================================================

describe('VF-001: External payment seller fee is 3.5%', () => {
  it('SELLER_FEE_PERCENT equals 3.5', () => {
    expect(SELLER_FEE_PERCENT).toBe(3.5)
  })

  it('calculateSellerFee on $10.00 subtotal = 35 cents', () => {
    expect(calculateSellerFee(1000)).toBe(35)
  })

  it('calculateSellerFee on $100.00 subtotal = 350 cents', () => {
    expect(calculateSellerFee(10000)).toBe(350)
  })

  it('calculateSellerFee rounds to nearest cent', () => {
    // $7.77 (777 cents) × 3.5% = 27.195 → round(27.195) = 27
    expect(calculateSellerFee(777)).toBe(27)
  })

  it('calculateSellerFee on $0 subtotal = 0', () => {
    expect(calculateSellerFee(0)).toBe(0)
  })
})

// =============================================================================
// VF-002: External payment buyer fee = 6.5% only (NO flat fee)
// =============================================================================

describe('VF-002: External payment buyer fee is 6.5% with NO flat fee', () => {
  it('EXTERNAL_BUYER_FEE_FIXED_CENTS equals 0', () => {
    expect(EXTERNAL_BUYER_FEE_FIXED_CENTS).toBe(0)
  })

  it('calculateExternalBuyerFee on $10.00 = 65 cents (no +15)', () => {
    expect(calculateExternalBuyerFee(1000)).toBe(65)
  })

  it('calculateExternalBuyerFee on $100.00 = 650 cents', () => {
    expect(calculateExternalBuyerFee(10000)).toBe(650)
  })

  it('calculateExternalBuyerFee rounds to nearest cent', () => {
    // $7.77 × 6.5% = 50.505 → round = 51
    expect(calculateExternalBuyerFee(777)).toBe(51)
  })

  it('calculateExternalBuyerFee on $0 = 0', () => {
    expect(calculateExternalBuyerFee(0)).toBe(0)
  })
})

// =============================================================================
// VF-003: Stripe buyer fee = 6.5% + $0.15
// =============================================================================

describe('VF-003: Stripe buyer fee is 6.5% + $0.15 flat', () => {
  it('BUYER_FEE_PERCENT equals 6.5', () => {
    expect(BUYER_FEE_PERCENT).toBe(6.5)
  })

  it('STRIPE_BUYER_FEE_FIXED_CENTS equals 15', () => {
    expect(STRIPE_BUYER_FEE_FIXED_CENTS).toBe(15)
  })

  it('calculateBuyerFee on $10.00 = 65 + 15 = 80 cents', () => {
    expect(calculateBuyerFee(1000)).toBe(80)
  })

  it('calculateBuyerFee on $100.00 = 650 + 15 = 665 cents', () => {
    expect(calculateBuyerFee(10000)).toBe(665)
  })

  it('Stripe fee is always $0.15 more than external fee for same subtotal', () => {
    const subtotals = [500, 1000, 2500, 7777, 10000]
    for (const sub of subtotals) {
      expect(calculateBuyerFee(sub) - calculateExternalBuyerFee(sub)).toBe(15)
    }
  })
})

// =============================================================================
// VF-004: Total external fee = buyer 6.5% + seller 3.5% = 10%
// =============================================================================

describe('VF-004: Total external platform fee is 10% of subtotal', () => {
  it('$10.00 subtotal → total fee = 65 + 35 = 100 cents', () => {
    expect(calculateTotalExternalFee(1000)).toBe(100)
  })

  it('$50.00 subtotal → total fee = 325 + 175 = 500 cents', () => {
    expect(calculateTotalExternalFee(5000)).toBe(500)
  })

  it('total equals sum of buyer + seller fees', () => {
    const subtotals = [500, 1234, 5000, 9999]
    for (const sub of subtotals) {
      expect(calculateTotalExternalFee(sub)).toBe(
        calculateExternalBuyerFee(sub) + calculateSellerFee(sub)
      )
    }
  })
})

// =============================================================================
// VF-005: External payment total (buyer pays) = subtotal + 6.5%
// =============================================================================

describe('VF-005: External payment total = subtotal + buyer fee', () => {
  it('$10.00 subtotal → buyer pays $10.65 (1065 cents)', () => {
    expect(calculateExternalPaymentTotal(1000)).toBe(1065)
  })

  it('$25.00 subtotal → buyer pays $26.63 (2663 cents)', () => {
    // 2500 + round(2500 × 0.065) = 2500 + round(162.5) = 2500 + 163 = 2663
    expect(calculateExternalPaymentTotal(2500)).toBe(2663)
  })

  it('equals subtotal + calculateExternalBuyerFee', () => {
    const subtotals = [500, 1000, 2500, 7777]
    for (const sub of subtotals) {
      expect(calculateExternalPaymentTotal(sub)).toBe(sub + calculateExternalBuyerFee(sub))
    }
  })
})

// =============================================================================
// VF-006 & VF-007: Auto-deduction capped at 50% of vendor payout
// =============================================================================

describe('VF-006/VF-007: Auto-deduction is min(owed, floor(payout × 50%))', () => {
  it('AUTO_DEDUCT_MAX_PERCENT equals 50', () => {
    expect(AUTO_DEDUCT_MAX_PERCENT).toBe(50)
  })

  it('owed < 50% of payout → deducts full owed amount', () => {
    // payout=1000, owed=200 → floor(1000×0.50)=500, min(200, 500)=200
    expect(calculateAutoDeductAmount(1000, 200)).toBe(200)
  })

  it('owed > 50% of payout → caps at 50% of payout', () => {
    // payout=1000, owed=600 → floor(1000×0.50)=500, min(600, 500)=500
    expect(calculateAutoDeductAmount(1000, 600)).toBe(500)
  })

  it('owed exactly equals 50% → deducts full owed', () => {
    // payout=1000, owed=500 → floor(1000×0.50)=500, min(500, 500)=500
    expect(calculateAutoDeductAmount(1000, 500)).toBe(500)
  })

  it('uses floor for 50% calculation (odd payout)', () => {
    // payout=999, owed=600 → floor(999×0.50)=floor(499.5)=499, min(600, 499)=499
    expect(calculateAutoDeductAmount(999, 600)).toBe(499)
  })

  it('payout=0 → deducts 0', () => {
    expect(calculateAutoDeductAmount(0, 500)).toBe(0)
  })
})

// =============================================================================
// VF-008: Owed ≤ 0 → auto-deduct = 0
// =============================================================================

describe('VF-008: No deduction when nothing owed', () => {
  it('owed = 0 → deduct 0', () => {
    expect(calculateAutoDeductAmount(1000, 0)).toBe(0)
  })

  it('owed = -100 → deduct 0', () => {
    expect(calculateAutoDeductAmount(1000, -100)).toBe(0)
  })
})

// =============================================================================
// VF-009 & VF-010: Invoice thresholds
// =============================================================================

describe('VF-009/VF-010: Invoice thresholds', () => {
  it('balance invoice threshold is $50.00 (5000 cents)', () => {
    expect(BALANCE_INVOICE_THRESHOLD_CENTS).toBe(5000)
  })

  it('age invoice threshold is 40 days', () => {
    expect(AGE_INVOICE_THRESHOLD_DAYS).toBe(40)
  })
})
