/**
 * Cron Timing & Logic — Functional Tests
 *
 * Tests order timing functions, external payment auto-confirm logic,
 * no-show payout calculations, and misc constants/formatters.
 *
 * Covers gaps: CR-005 through CR-008, CR-014 through CR-020, CR-027, CR-028
 *
 * IMPORTANT: Expected values come from BUSINESS RULES, not from reading code.
 * If a test fails, investigate the code — do NOT change the test.
 * See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/__tests__/cron-timing-functional.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  isStripeCheckoutExpired,
  isPayoutRetryable,
  isConfirmationWindowStale,
  calculateWindowExpiry,
  STRIPE_CHECKOUT_EXPIRY_MS,
  PAYOUT_RETRY_MAX_DAYS,
  STALE_CONFIRMATION_WINDOW_MS,
  CONFIRMATION_WINDOW_SECONDS,
} from '@/lib/cron/order-timing'
import {
  AUTO_CONFIRM_PAYMENT_METHODS,
  getAutoConfirmCutoffDate,
  areAllItemsPastPickupWindow,
  formatPaymentMethodLabel,
} from '@/lib/cron/external-payment'
import {
  calculateNoShowPayout,
  shouldTriggerNoShow,
} from '@/lib/cron/no-show'
import {
  CATEGORIES,
  FOOD_TRUCK_CATEGORIES,
  formatQuantityDisplay,
} from '@/lib/constants'

// =============================================================================
// CR-005: isStripeCheckoutExpired — true if ≥ 10 minutes old
// =============================================================================

describe('CR-005: isStripeCheckoutExpired', () => {
  const TEN_MIN = 10 * 60 * 1000

  it('9 minutes old → NOT expired', () => {
    const now = new Date('2026-03-14T12:10:00Z')
    const created = '2026-03-14T12:01:01Z' // 8m59s ago
    expect(isStripeCheckoutExpired(created, now)).toBe(false)
  })

  it('exactly 10 minutes old → expired', () => {
    const now = new Date('2026-03-14T12:10:00Z')
    const created = '2026-03-14T12:00:00Z' // exactly 10m
    expect(isStripeCheckoutExpired(created, now)).toBe(true)
  })

  it('11 minutes old → expired', () => {
    const now = new Date('2026-03-14T12:11:00Z')
    const created = '2026-03-14T12:00:00Z'
    expect(isStripeCheckoutExpired(created, now)).toBe(true)
  })

  it('just created → NOT expired', () => {
    const now = new Date('2026-03-14T12:00:00Z')
    const created = '2026-03-14T12:00:00Z'
    expect(isStripeCheckoutExpired(created, now)).toBe(false)
  })

  it('uses STRIPE_CHECKOUT_EXPIRY_MS = 600000', () => {
    expect(STRIPE_CHECKOUT_EXPIRY_MS).toBe(TEN_MIN)
  })
})

// =============================================================================
// CR-006: isPayoutRetryable — true if < 7 days old
// =============================================================================

describe('CR-006: isPayoutRetryable', () => {
  it('6 days old → retryable', () => {
    const now = new Date('2026-03-14T12:00:00Z')
    const created = '2026-03-08T12:00:01Z' // 5d 23h 59m 59s
    expect(isPayoutRetryable(created, now)).toBe(true)
  })

  it('exactly 7 days old → NOT retryable', () => {
    const now = new Date('2026-03-14T12:00:00Z')
    const created = '2026-03-07T12:00:00Z' // exactly 7 days
    expect(isPayoutRetryable(created, now)).toBe(false)
  })

  it('8 days old → NOT retryable', () => {
    const now = new Date('2026-03-14T12:00:00Z')
    const created = '2026-03-06T12:00:00Z'
    expect(isPayoutRetryable(created, now)).toBe(false)
  })

  it('just created → retryable', () => {
    const now = new Date('2026-03-14T12:00:00Z')
    const created = '2026-03-14T12:00:00Z'
    expect(isPayoutRetryable(created, now)).toBe(true)
  })

  it('PAYOUT_RETRY_MAX_DAYS = 7', () => {
    expect(PAYOUT_RETRY_MAX_DAYS).toBe(7)
  })
})

// =============================================================================
// CR-007: isConfirmationWindowStale — true if ≥ 5 minutes past expiry
// =============================================================================

describe('CR-007: isConfirmationWindowStale', () => {
  it('4 minutes past expiry → NOT stale', () => {
    const now = new Date('2026-03-14T12:04:59Z')
    const expiresAt = '2026-03-14T12:00:00Z'
    expect(isConfirmationWindowStale(expiresAt, now)).toBe(false)
  })

  it('exactly 5 minutes past expiry → stale', () => {
    const now = new Date('2026-03-14T12:05:00Z')
    const expiresAt = '2026-03-14T12:00:00Z'
    expect(isConfirmationWindowStale(expiresAt, now)).toBe(true)
  })

  it('10 minutes past expiry → stale', () => {
    const now = new Date('2026-03-14T12:10:00Z')
    const expiresAt = '2026-03-14T12:00:00Z'
    expect(isConfirmationWindowStale(expiresAt, now)).toBe(true)
  })

  it('before expiry → NOT stale', () => {
    const now = new Date('2026-03-14T11:59:00Z')
    const expiresAt = '2026-03-14T12:00:00Z'
    expect(isConfirmationWindowStale(expiresAt, now)).toBe(false)
  })

  it('STALE_CONFIRMATION_WINDOW_MS = 300000', () => {
    expect(STALE_CONFIRMATION_WINDOW_MS).toBe(300000)
  })
})

// =============================================================================
// CR-008: calculateWindowExpiry — now + 30 seconds
// =============================================================================

describe('CR-008: calculateWindowExpiry returns now + 30 seconds', () => {
  it('adds 30 seconds to given time', () => {
    const now = new Date('2026-03-14T12:00:00.000Z')
    const expiry = calculateWindowExpiry(now)
    expect(expiry).toBe('2026-03-14T12:00:30.000Z')
  })

  it('CONFIRMATION_WINDOW_SECONDS = 30', () => {
    expect(CONFIRMATION_WINDOW_SECONDS).toBe(30)
  })

  it('returns ISO string', () => {
    const expiry = calculateWindowExpiry(new Date('2026-03-14T15:30:00.000Z'))
    expect(expiry).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})

// =============================================================================
// CR-014: AUTO_CONFIRM_PAYMENT_METHODS excludes cash
// =============================================================================

describe('CR-014: Auto-confirm eligible payment methods', () => {
  it('includes venmo, cashapp, paypal', () => {
    expect(AUTO_CONFIRM_PAYMENT_METHODS).toContain('venmo')
    expect(AUTO_CONFIRM_PAYMENT_METHODS).toContain('cashapp')
    expect(AUTO_CONFIRM_PAYMENT_METHODS).toContain('paypal')
  })

  it('does NOT include cash', () => {
    expect(AUTO_CONFIRM_PAYMENT_METHODS).not.toContain('cash')
  })

  it('has exactly 3 methods', () => {
    expect(AUTO_CONFIRM_PAYMENT_METHODS).toHaveLength(3)
  })
})

// =============================================================================
// CR-015: getAutoConfirmCutoffDate — yesterday's date
// =============================================================================

describe('CR-015: getAutoConfirmCutoffDate returns yesterday YYYY-MM-DD', () => {
  it('March 14 → cutoff = March 13', () => {
    const result = getAutoConfirmCutoffDate(new Date('2026-03-14T12:00:00Z'))
    expect(result).toBe('2026-03-13')
  })

  it('January 1 → cutoff = December 31 previous year', () => {
    const result = getAutoConfirmCutoffDate(new Date('2026-01-01T12:00:00Z'))
    expect(result).toBe('2025-12-31')
  })

  it('returns YYYY-MM-DD format', () => {
    const result = getAutoConfirmCutoffDate(new Date('2026-06-15T00:00:00Z'))
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// =============================================================================
// CR-016: areAllItemsPastPickupWindow
// =============================================================================

describe('CR-016: areAllItemsPastPickupWindow', () => {
  it('all items before cutoff → true', () => {
    const items = [
      { cancelled_at: null, pickup_date: '2026-03-12' },
      { cancelled_at: null, pickup_date: '2026-03-13' },
    ]
    expect(areAllItemsPastPickupWindow(items, '2026-03-13')).toBe(true)
  })

  it('one item after cutoff → false', () => {
    const items = [
      { cancelled_at: null, pickup_date: '2026-03-12' },
      { cancelled_at: null, pickup_date: '2026-03-15' },
    ]
    expect(areAllItemsPastPickupWindow(items, '2026-03-13')).toBe(false)
  })

  it('cancelled items are excluded from check', () => {
    const items = [
      { cancelled_at: '2026-03-10T00:00:00Z', pickup_date: '2026-03-20' }, // cancelled, future date
      { cancelled_at: null, pickup_date: '2026-03-12' }, // active, past cutoff
    ]
    expect(areAllItemsPastPickupWindow(items, '2026-03-13')).toBe(true)
  })

  it('no active items → false', () => {
    const items = [
      { cancelled_at: '2026-03-10T00:00:00Z', pickup_date: '2026-03-12' },
    ]
    expect(areAllItemsPastPickupWindow(items, '2026-03-13')).toBe(false)
  })

  it('empty items array → false', () => {
    expect(areAllItemsPastPickupWindow([], '2026-03-13')).toBe(false)
  })

  it('item with null pickup_date → false', () => {
    const items = [{ cancelled_at: null, pickup_date: null }]
    expect(areAllItemsPastPickupWindow(items, '2026-03-13')).toBe(false)
  })
})

// =============================================================================
// CR-017: formatPaymentMethodLabel
// =============================================================================

describe('CR-017: formatPaymentMethodLabel', () => {
  it('cashapp → Cash App', () => {
    expect(formatPaymentMethodLabel('cashapp')).toBe('Cash App')
  })

  it('paypal → PayPal', () => {
    expect(formatPaymentMethodLabel('paypal')).toBe('PayPal')
  })

  it('venmo → Venmo (capitalized)', () => {
    expect(formatPaymentMethodLabel('venmo')).toBe('Venmo')
  })

  it('cash → Cash (capitalized)', () => {
    expect(formatPaymentMethodLabel('cash')).toBe('Cash')
  })
})

// =============================================================================
// CR-018: calculateNoShowPayout
// =============================================================================

describe('CR-018: calculateNoShowPayout', () => {
  it('vendor payout + prorated tip share', () => {
    // vendorPayout=935, tip=100, platformFeeTip=7, items=1
    // vendorTip = 100 - 7 = 93, tipShare = round(93/1) = 93
    // total = 935 + 93 = 1028
    const result = calculateNoShowPayout({
      vendorPayoutCents: 935,
      tipAmount: 100,
      tipOnPlatformFeeCents: 7,
      totalItemsInOrder: 1,
    })
    expect(result).toBe(1028)
  })

  it('multi-item order prorates tip', () => {
    // vendorPayout=500, tip=200, platformFeeTip=14, items=3
    // vendorTip = 200 - 14 = 186, tipShare = round(186/3) = round(62) = 62
    // total = 500 + 62 = 562
    const result = calculateNoShowPayout({
      vendorPayoutCents: 500,
      tipAmount: 200,
      tipOnPlatformFeeCents: 14,
      totalItemsInOrder: 3,
    })
    expect(result).toBe(562)
  })

  it('no tip → just vendor payout', () => {
    const result = calculateNoShowPayout({
      vendorPayoutCents: 935,
      tipAmount: 0,
      tipOnPlatformFeeCents: 0,
      totalItemsInOrder: 1,
    })
    expect(result).toBe(935)
  })

  it('totalItemsInOrder = 0 treated as 1', () => {
    const result = calculateNoShowPayout({
      vendorPayoutCents: 500,
      tipAmount: 100,
      tipOnPlatformFeeCents: 7,
      totalItemsInOrder: 0,
    })
    // vendorTip = 93, tipShare = round(93/1) = 93
    expect(result).toBe(593)
  })
})

// =============================================================================
// CR-019: shouldTriggerNoShow — FT with preferred pickup time
// =============================================================================

describe('CR-019: shouldTriggerNoShow FT with pickup time', () => {
  it('1 hour after pickup time → triggers', () => {
    // Pickup at 12:00 UTC, now = 13:01 UTC → 1h1m after → true
    const now = new Date('2026-03-14T13:01:00Z')
    expect(shouldTriggerNoShow('2026-03-14', '12:00', 'food_trucks', now)).toBe(true)
  })

  it('exactly 1 hour after → triggers', () => {
    const now = new Date('2026-03-14T13:00:00Z')
    expect(shouldTriggerNoShow('2026-03-14', '12:00', 'food_trucks', now)).toBe(true)
  })

  it('59 minutes after pickup time → does NOT trigger', () => {
    const now = new Date('2026-03-14T12:59:00Z')
    expect(shouldTriggerNoShow('2026-03-14', '12:00', 'food_trucks', now)).toBe(false)
  })

  it('handles HH:MM:SS format', () => {
    const now = new Date('2026-03-14T14:00:00Z')
    expect(shouldTriggerNoShow('2026-03-14', '13:00:00', 'food_trucks', now)).toBe(true)
  })
})

// =============================================================================
// CR-020: shouldTriggerNoShow — FM / date-based
// =============================================================================

describe('CR-020: shouldTriggerNoShow FM date-based', () => {
  it('pickup date before today → triggers', () => {
    const now = new Date('2026-03-14T12:00:00Z')
    expect(shouldTriggerNoShow('2026-03-13', null, 'farmers_market', now)).toBe(true)
  })

  it('pickup date is today → does NOT trigger', () => {
    const now = new Date('2026-03-14T12:00:00Z')
    expect(shouldTriggerNoShow('2026-03-14', null, 'farmers_market', now)).toBe(false)
  })

  it('pickup date in future → does NOT trigger', () => {
    const now = new Date('2026-03-14T12:00:00Z')
    expect(shouldTriggerNoShow('2026-03-15', null, 'farmers_market', now)).toBe(false)
  })

  it('FT without preferred_pickup_time falls back to date-based', () => {
    const now = new Date('2026-03-14T12:00:00Z')
    expect(shouldTriggerNoShow('2026-03-13', null, 'food_trucks', now)).toBe(true)
    expect(shouldTriggerNoShow('2026-03-14', null, 'food_trucks', now)).toBe(false)
  })
})

// =============================================================================
// CR-027: Category counts
// =============================================================================

describe('CR-027: Category counts', () => {
  it('FM has 10 product categories', () => {
    expect(CATEGORIES).toHaveLength(10)
  })

  it('FT has 11 cuisine categories', () => {
    expect(FOOD_TRUCK_CATEGORIES).toHaveLength(11)
  })

  it('FM categories include Produce and Baked Goods', () => {
    expect(CATEGORIES).toContain('Produce')
    expect(CATEGORIES).toContain('Baked Goods')
  })

  it('FT categories include BBQ & Smoked and Desserts & Sweets', () => {
    expect(FOOD_TRUCK_CATEGORIES).toContain('BBQ & Smoked')
    expect(FOOD_TRUCK_CATEGORIES).toContain('Desserts & Sweets')
  })
})

// =============================================================================
// CR-028: formatQuantityDisplay
// =============================================================================

describe('CR-028: formatQuantityDisplay', () => {
  it('"feeds" unit → "feeds N" format', () => {
    expect(formatQuantityDisplay(4, 'feeds')).toBe('feeds 4')
  })

  it('standard unit → "N unit" format', () => {
    expect(formatQuantityDisplay(2, 'lb')).toBe('2 lb')
  })

  it('whole number drops trailing .0', () => {
    expect(formatQuantityDisplay(1, 'dozen')).toBe('1 dozen')
  })

  it('decimal number shows 1 decimal place', () => {
    expect(formatQuantityDisplay(1.5, 'lb')).toBe('1.5 lb')
  })

  it('null amount → null', () => {
    expect(formatQuantityDisplay(null, 'lb')).toBeNull()
  })

  it('null unit → null', () => {
    expect(formatQuantityDisplay(2, null)).toBeNull()
  })
})
