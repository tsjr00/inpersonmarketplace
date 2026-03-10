/**
 * Order Timing Constants & Functions
 *
 * Pure timing logic extracted from expire-orders cron route phases
 * and confirmation window routes. Centralizes all time-based business
 * rules for testability.
 *
 * Sources:
 *   - Phase 2 (Stripe checkout expiry): expire-orders/route.ts
 *   - Phase 5 (payout retry window): expire-orders/route.ts
 *   - Phase 7 (stale confirmation windows): expire-orders/route.ts
 *   - Confirmation window: buyer/orders/[id]/confirm, vendor/market-boxes/pickups/[id],
 *     buyer/market-boxes/[id]/confirm-pickup
 *
 * Rules: MP-R15, MP-R17, OL-R15, OL-R21, OL-R22
 */

// Phase 2: Buyer has 10 minutes to complete Stripe checkout
export const STRIPE_CHECKOUT_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes

// Phase 5: Failed payouts are retried for up to 7 days
export const PAYOUT_RETRY_MAX_DAYS = 7

// Phase 7: Confirmation windows older than 5 minutes are considered stale
export const STALE_CONFIRMATION_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

// Shared: Vendor has 30 seconds to click Fulfill after buyer acknowledges
export const CONFIRMATION_WINDOW_SECONDS = 30

/**
 * Check if a Stripe checkout session has expired (>10 minutes old).
 * Used by Phase 2 to cancel stale pending orders.
 */
export function isStripeCheckoutExpired(createdAt: string, now?: Date): boolean {
  const ref = now ?? new Date()
  const created = new Date(createdAt)
  return ref.getTime() - created.getTime() >= STRIPE_CHECKOUT_EXPIRY_MS
}

/**
 * Check if a failed payout is still within the 7-day retry window.
 * Used by Phase 5 to decide whether to retry or permanently cancel.
 */
export function isPayoutRetryable(createdAt: string, now?: Date): boolean {
  const ref = now ?? new Date()
  const created = new Date(createdAt)
  const maxAgeMs = PAYOUT_RETRY_MAX_DAYS * 24 * 60 * 60 * 1000
  return ref.getTime() - created.getTime() < maxAgeMs
}

/**
 * Check if a confirmation window has been stale for >5 minutes.
 * Used by Phase 7 to auto-fulfill items where vendor didn't respond.
 */
export function isConfirmationWindowStale(expiresAt: string, now?: Date): boolean {
  const ref = now ?? new Date()
  const expires = new Date(expiresAt)
  return ref.getTime() - expires.getTime() >= STALE_CONFIRMATION_WINDOW_MS
}

/**
 * Calculate the confirmation window expiry time (now + 30 seconds).
 * Returns ISO string for storage in confirmation_window_expires_at column.
 */
export function calculateWindowExpiry(now?: Date): string {
  const ref = now ?? new Date()
  return new Date(ref.getTime() + CONFIRMATION_WINDOW_SECONDS * 1000).toISOString()
}
