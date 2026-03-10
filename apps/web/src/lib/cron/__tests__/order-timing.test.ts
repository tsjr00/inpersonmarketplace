/**
 * Order Timing Tests
 *
 * Tests pure timing functions extracted from expire-orders cron route.
 * Covers: MP-R15 (Stripe checkout 10min), MP-R17 (payout retry 7-day),
 *         OL-R15 (same as MP-R15), OL-R21 (confirmation window),
 *         OL-R22 (stale window auto-fulfill)
 *
 * Run: npx vitest run src/lib/cron/__tests__/order-timing.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  STRIPE_CHECKOUT_EXPIRY_MS,
  PAYOUT_RETRY_MAX_DAYS,
  STALE_CONFIRMATION_WINDOW_MS,
  CONFIRMATION_WINDOW_SECONDS,
  isStripeCheckoutExpired,
  isPayoutRetryable,
  isConfirmationWindowStale,
  calculateWindowExpiry,
} from '../order-timing'

const NOW = new Date('2026-03-09T12:00:00Z')

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString()
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

// -- Constants --

describe('timing constants', () => {
  it('Stripe checkout expiry is 10 minutes', () => {
    expect(STRIPE_CHECKOUT_EXPIRY_MS).toBe(10 * 60 * 1000)
  })

  it('payout retry window is 7 days', () => {
    expect(PAYOUT_RETRY_MAX_DAYS).toBe(7)
  })

  it('stale confirmation window threshold is 5 minutes', () => {
    expect(STALE_CONFIRMATION_WINDOW_MS).toBe(5 * 60 * 1000)
  })

  it('confirmation window is 30 seconds', () => {
    expect(CONFIRMATION_WINDOW_SECONDS).toBe(30)
  })
})

// -- MP-R15 / OL-R15: Stripe Checkout Expiry --

describe('isStripeCheckoutExpired', () => {
  it('checkout 11 minutes old → expired', () => {
    expect(isStripeCheckoutExpired(minutesAgo(11), NOW)).toBe(true)
  })

  it('checkout 9 minutes old → not expired', () => {
    expect(isStripeCheckoutExpired(minutesAgo(9), NOW)).toBe(false)
  })

  it('checkout exactly 10 minutes old → expired (boundary)', () => {
    expect(isStripeCheckoutExpired(minutesAgo(10), NOW)).toBe(true)
  })

  it('checkout just created → not expired', () => {
    expect(isStripeCheckoutExpired(NOW.toISOString(), NOW)).toBe(false)
  })
})

// -- MP-R17: Payout Retry Window --

describe('isPayoutRetryable', () => {
  it('payout 6 days old → retryable', () => {
    expect(isPayoutRetryable(daysAgo(6), NOW)).toBe(true)
  })

  it('payout 8 days old → not retryable', () => {
    expect(isPayoutRetryable(daysAgo(8), NOW)).toBe(false)
  })

  it('payout exactly 7 days old → not retryable (boundary)', () => {
    expect(isPayoutRetryable(daysAgo(7), NOW)).toBe(false)
  })

  it('payout created just now → retryable', () => {
    expect(isPayoutRetryable(NOW.toISOString(), NOW)).toBe(true)
  })
})

// -- OL-R22: Stale Confirmation Window --

describe('isConfirmationWindowStale', () => {
  it('window expired 6 minutes ago → stale', () => {
    expect(isConfirmationWindowStale(minutesAgo(6), NOW)).toBe(true)
  })

  it('window expired 4 minutes ago → not stale', () => {
    expect(isConfirmationWindowStale(minutesAgo(4), NOW)).toBe(false)
  })

  it('window expired exactly 5 minutes ago → stale (boundary)', () => {
    expect(isConfirmationWindowStale(minutesAgo(5), NOW)).toBe(true)
  })

  it('window expires in the future → not stale', () => {
    const futureExpiry = new Date(NOW.getTime() + 60 * 1000).toISOString()
    expect(isConfirmationWindowStale(futureExpiry, NOW)).toBe(false)
  })
})

// -- OL-R21: Confirmation Window Expiry Calculation --

describe('calculateWindowExpiry', () => {
  it('returns ISO string 30 seconds after now', () => {
    const expiry = calculateWindowExpiry(NOW)
    const expiryDate = new Date(expiry)
    expect(expiryDate.getTime() - NOW.getTime()).toBe(30 * 1000)
  })

  it('returns valid ISO string', () => {
    const expiry = calculateWindowExpiry(NOW)
    expect(new Date(expiry).toISOString()).toBe(expiry)
  })

  it('uses current time when no argument provided', () => {
    const before = Date.now()
    const expiry = calculateWindowExpiry()
    const after = Date.now()
    const expiryMs = new Date(expiry).getTime()
    // Should be ~30 seconds in the future
    expect(expiryMs - before).toBeGreaterThanOrEqual(30 * 1000 - 10)
    expect(expiryMs - after).toBeLessThanOrEqual(30 * 1000 + 10)
  })
})
