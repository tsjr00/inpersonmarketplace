/**
 * Checkout & Payment Helpers
 *
 * Pure functions for idempotency key construction, tipping eligibility,
 * and payment method classification. Extracted from payments.ts and
 * route handlers for testability.
 *
 * Rules: MP-R7 (idempotency keys), MP-R19 (tipping), OL-R9 (Stripe refund guard)
 */

/**
 * External payment methods that don't go through Stripe.
 * Orders with these methods are paid in-person at pickup.
 */
export const EXTERNAL_PAYMENT_METHODS = ['venmo', 'cashapp', 'paypal', 'cash'] as const

/**
 * Build a deterministic idempotency key for Stripe API calls.
 * Ensures retries hit the same Stripe operation instead of creating duplicates.
 *
 * Key formats:
 *   checkout-{orderId}
 *   transfer-{orderId}-{orderItemId}
 *   market-box-{offeringId}-{userId}-{startDate}
 *   transfer-mb-sub-{subscriptionId}
 *   refund-{paymentIntentId}-{amount|full}
 */
export function buildIdempotencyKey(
  type: 'checkout' | 'transfer' | 'market-box' | 'transfer-mb-sub' | 'refund',
  params: Record<string, string | number>,
): string {
  switch (type) {
    case 'checkout':
      return `checkout-${params.orderId}`
    case 'transfer':
      return `transfer-${params.orderId}-${params.orderItemId}`
    case 'market-box':
      return `market-box-${params.offeringId}-${params.userId}-${params.startDate}`
    case 'transfer-mb-sub':
      return `transfer-mb-sub-${params.subscriptionId}`
    case 'refund':
      return `refund-${params.paymentIntentId}-${params.amount ?? 'full'}`
    default:
      throw new Error(`Unknown idempotency key type: ${type}`)
  }
}

/**
 * Check if tipping is enabled for a vertical.
 * Currently only food trucks support tipping.
 */
export function isTippingEnabled(verticalId: string): boolean {
  return verticalId === 'food_trucks'
}

/**
 * Check if a payment method is an external (non-Stripe) method.
 * External payments are collected in-person at pickup.
 */
export function isExternalPayment(method: string): boolean {
  return (EXTERNAL_PAYMENT_METHODS as readonly string[]).includes(method)
}

/**
 * Check if a Stripe refund should be called for a given payment method.
 * External payments don't go through Stripe, so no refund API call is needed.
 */
export function shouldCallStripeRefund(paymentMethod: string): boolean {
  return !isExternalPayment(paymentMethod)
}
