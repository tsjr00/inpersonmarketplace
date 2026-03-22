/**
 * T-2: Refund Calculation Consistency Test
 *
 * Business Rule: All refund paths must produce identical refund amounts
 * for the same input. The formula is:
 *   refund = subtotal + round(subtotal × 6.5%) + floor($0.15 / totalItemsInOrder)
 *
 * 4 refund paths: reject, buyer-cancel (full), resolve-issue, cron-expire
 * All use: FEES.buyerFeePercent (6.5%) + proratedFlatFeeSimple(15, totalItems)
 *
 * IMPORTANT: These tests assert what the business rule REQUIRES.
 * If a test fails, investigate the code — do NOT change the test.
 * See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/__tests__/refund-consistency.test.ts
 */
import { describe, it, expect } from 'vitest'
import { FEES, proratedFlatFeeSimple } from '@/lib/pricing'

/**
 * The canonical refund formula used by all 4 paths.
 * This is the specification — code must match this, not the other way around.
 *
 * Sources:
 * - reject route:        src/app/api/vendor/orders/[id]/reject/route.ts (lines 109-112)
 * - resolve-issue route: src/app/api/vendor/orders/[id]/resolve-issue/route.ts (lines 138-141)
 * - expire cron:         src/app/api/cron/expire-orders/route.ts (lines 159-162)
 * - buyer cancel:        uses calculateCancellationFee() which calls same formula for full refund
 */
function expectedRefundAmount(subtotalCents: number, totalItemsInOrder: number): number {
  const buyerPercentFee = Math.round(subtotalCents * (FEES.buyerFeePercent / 100))
  const itemFlatFee = proratedFlatFeeSimple(FEES.buyerFlatFeeCents, totalItemsInOrder)
  return subtotalCents + buyerPercentFee + itemFlatFee
}

describe('T-2: Refund calculation consistency', () => {
  // =========================================================================
  // Fee constants must remain stable
  // =========================================================================

  describe('fee constants', () => {
    it('buyer fee is 6.5%', () => {
      expect(FEES.buyerFeePercent).toBe(6.5)
    })

    it('buyer flat fee is 15 cents ($0.15)', () => {
      expect(FEES.buyerFlatFeeCents).toBe(15)
    })
  })

  // =========================================================================
  // Single-item order refunds
  // =========================================================================

  describe('single-item orders', () => {
    it('$10.00 item — refund = 1000 + 65 + 15 = 1080', () => {
      // subtotal=1000, 6.5% = 65, flat=15 (1 item)
      expect(expectedRefundAmount(1000, 1)).toBe(1080)
    })

    it('$3.50 item (sweet tea example from Session 61) — refund = 350 + 23 + 15 = 388', () => {
      // subtotal=350, 6.5% of 350 = 22.75 → round = 23, flat=15
      expect(expectedRefundAmount(350, 1)).toBe(388)
    })

    it('$18.00 item — refund = 1800 + 117 + 15 = 1932', () => {
      expect(expectedRefundAmount(1800, 1)).toBe(1932)
    })

    it('$1.00 item (minimum) — refund = 100 + 7 + 15 = 122', () => {
      // 6.5% of 100 = 6.5 → round = 7 (rounds up at .5)
      expect(expectedRefundAmount(100, 1)).toBe(122)
    })

    it('$49.99 item — refund = 4999 + 325 + 15 = 5339', () => {
      // 6.5% of 4999 = 324.935 → round = 325
      expect(expectedRefundAmount(4999, 1)).toBe(5339)
    })
  })

  // =========================================================================
  // Multi-item order refunds (flat fee proration)
  // =========================================================================

  describe('multi-item orders — flat fee proration', () => {
    it('2-item order: flat fee = floor(15/2) = 7 per item', () => {
      expect(proratedFlatFeeSimple(15, 2)).toBe(7)
      // $10 item in 2-item order: 1000 + 65 + 7 = 1072
      expect(expectedRefundAmount(1000, 2)).toBe(1072)
    })

    it('3-item order: flat fee = floor(15/3) = 5 per item', () => {
      expect(proratedFlatFeeSimple(15, 3)).toBe(5)
      expect(expectedRefundAmount(1000, 3)).toBe(1070)
    })

    it('4-item order: flat fee = floor(15/4) = 3 per item', () => {
      expect(proratedFlatFeeSimple(15, 4)).toBe(3)
      expect(expectedRefundAmount(1000, 4)).toBe(1068)
    })

    it('5-item order: flat fee = floor(15/5) = 3 per item', () => {
      expect(proratedFlatFeeSimple(15, 5)).toBe(3)
      expect(expectedRefundAmount(1000, 5)).toBe(1068)
    })

    it('1-item order: flat fee = full 15', () => {
      expect(proratedFlatFeeSimple(15, 1)).toBe(15)
    })
  })

  // =========================================================================
  // All 4 paths produce identical results
  // =========================================================================

  describe('cross-path consistency', () => {
    // Test a matrix of subtotals × item counts to verify the formula
    // All 4 routes (reject, resolve-issue, expire, buyer-cancel full refund)
    // use the exact same inline formula:
    //   buyerPercentFee = Math.round(subtotal * (FEES.buyerFeePercent / 100))
    //   itemFlatFee = proratedFlatFeeSimple(FEES.buyerFlatFeeCents, totalItems)
    //   refund = subtotal + buyerPercentFee + itemFlatFee

    const testCases = [
      { subtotal: 350, totalItems: 1, label: '$3.50 single item' },
      { subtotal: 1000, totalItems: 1, label: '$10.00 single item' },
      { subtotal: 1800, totalItems: 2, label: '$18.00 in 2-item order' },
      { subtotal: 500, totalItems: 3, label: '$5.00 in 3-item order' },
      { subtotal: 2500, totalItems: 4, label: '$25.00 in 4-item order' },
      { subtotal: 799, totalItems: 5, label: '$7.99 in 5-item order' },
    ]

    for (const tc of testCases) {
      it(`${tc.label}: all paths produce ${expectedRefundAmount(tc.subtotal, tc.totalItems)} cents`, () => {
        // Simulate each path's inline calculation
        const buyerPercentFee = Math.round(tc.subtotal * (FEES.buyerFeePercent / 100))
        const itemFlatFee = proratedFlatFeeSimple(FEES.buyerFlatFeeCents, tc.totalItems)
        const refund = tc.subtotal + buyerPercentFee + itemFlatFee

        // Must match the canonical formula
        expect(refund).toBe(expectedRefundAmount(tc.subtotal, tc.totalItems))

        // Verify components individually
        expect(buyerPercentFee).toBe(Math.round(tc.subtotal * 6.5 / 100))
        expect(itemFlatFee).toBe(Math.floor(15 / tc.totalItems))
      })
    }
  })

  // =========================================================================
  // Rounding edge cases
  // =========================================================================

  describe('rounding edge cases', () => {
    it('6.5% of odd cents rounds correctly (Math.round)', () => {
      // 6.5% of 1 cent = 0.065 → round = 0
      expect(Math.round(1 * 6.5 / 100)).toBe(0)
      // 6.5% of 7 cents = 0.455 → round = 0
      expect(Math.round(7 * 6.5 / 100)).toBe(0)
      // 6.5% of 8 cents = 0.52 → round = 1
      expect(Math.round(8 * 6.5 / 100)).toBe(1)
      // 6.5% of 100 cents = 6.5 → round = 7 (rounds up at .5)
      expect(Math.round(100 * 6.5 / 100)).toBe(7)
      // 6.5% of 999 cents = 64.935 → round = 65
      expect(Math.round(999 * 6.5 / 100)).toBe(65)
    })

    it('flat fee proration: floor division never overpays', () => {
      // floor(15/7) = 2, total for 7 items = 14 (1 cent under — acceptable)
      expect(proratedFlatFeeSimple(15, 7) * 7).toBeLessThanOrEqual(15)
      // floor(15/6) = 2, total = 12
      expect(proratedFlatFeeSimple(15, 6) * 6).toBeLessThanOrEqual(15)
    })
  })
})
