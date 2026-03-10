/**
 * External Payment Timing Logic — Phases 3.5 + 3.6
 *
 * Extracted from: src/app/api/cron/expire-orders/route.ts (Phases 3.5, 3.6)
 * Purpose: Per-vertical reminder delays, auto-confirm timing for digital
 * external payments (Venmo/CashApp/PayPal), and payment method formatting.
 *
 * Pure functions — no DB, no side effects.
 */

/** Per-vertical delay before sending vendor a reminder for unconfirmed external orders */
export const REMINDER_DELAY_MS: Record<string, number> = {
  food_trucks: 15 * 60 * 1000,         // 15 minutes
  farmers_market: 12 * 60 * 60 * 1000, // 12 hours
  fire_works: 12 * 60 * 60 * 1000,     // 12 hours (same as FM)
}

/** Default delay when vertical is unknown */
export const DEFAULT_REMINDER_DELAY_MS = 12 * 60 * 60 * 1000 // 12 hours

/** Digital payment methods eligible for auto-confirm (cash excluded — no way to verify) */
export const AUTO_CONFIRM_PAYMENT_METHODS = ['venmo', 'cashapp', 'paypal'] as const

/**
 * Check whether an order is old enough for its vertical's reminder delay.
 * Used in Phase 3.5 to filter orders per-vertical timing.
 */
export function isOrderOldEnoughForReminder(
  orderCreatedAt: string,
  verticalId: string,
  nowMs?: number,
): boolean {
  const now = nowMs ?? Date.now()
  const delayMs = REMINDER_DELAY_MS[verticalId] ?? DEFAULT_REMINDER_DELAY_MS
  const orderAge = now - new Date(orderCreatedAt).getTime()
  return orderAge >= delayMs
}

/**
 * Get the YYYY-MM-DD cutoff date for auto-confirming digital orders.
 * Phase 3.6: orders with all items' pickup_date <= this date are eligible.
 */
export function getAutoConfirmCutoffDate(now?: Date): string {
  const ref = now ?? new Date()
  const yesterday = new Date(ref.getTime() - 24 * 60 * 60 * 1000)
  return yesterday.toISOString().split('T')[0]
}

/**
 * Check if all active (non-cancelled) items have pickup_date at or before the cutoff.
 * Returns false if no active items exist.
 */
export function areAllItemsPastPickupWindow(
  items: Array<{ cancelled_at: string | null; pickup_date: string | null }>,
  cutoffDate: string,
): boolean {
  const activeItems = items.filter(i => !i.cancelled_at)
  if (activeItems.length === 0) return false

  return activeItems.every(item => {
    if (!item.pickup_date) return false
    return item.pickup_date <= cutoffDate
  })
}

/**
 * Format a payment method slug into a human-readable label.
 * 'cashapp' → 'Cash App', 'venmo' → 'Venmo', 'paypal' → 'PayPal'
 */
export function formatPaymentMethodLabel(method: string): string {
  switch (method) {
    case 'cashapp': return 'Cash App'
    case 'paypal': return 'PayPal'
    default: return method.charAt(0).toUpperCase() + method.slice(1)
  }
}
