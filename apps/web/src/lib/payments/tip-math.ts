/**
 * Tip Proration
 *
 * Extracted from fulfill and confirm route handlers for testability.
 * Pure function — no Supabase or Stripe calls.
 */

/**
 * Calculate a single item's share of the order tip.
 * Tips are split evenly across all items in the order, with rounding.
 *
 * @param tipAmountCents - Total tip on the order in cents (may be null/undefined/0)
 * @param totalItemsInOrder - Number of items in the order (may be null/0)
 * @returns Tip share for one item in cents
 */
export function calculateTipShare(
  tipAmountCents: number | null | undefined,
  totalItemsInOrder: number | null | undefined
): number {
  if (!tipAmountCents || tipAmountCents <= 0) return 0
  if (!totalItemsInOrder || totalItemsInOrder <= 0) return 0
  return Math.round(tipAmountCents / totalItemsInOrder)
}

/**
 * Calculate the vendor's portion of the tip (excludes platform fee tip).
 *
 * @param tipAmountCents - Total tip stored on the order
 * @param tipOnPlatformFeeCents - Portion of tip attributable to buyer platform fee
 * @returns Tip amount that should go to the vendor
 */
export function calculateVendorTip(
  tipAmountCents: number | null | undefined,
  tipOnPlatformFeeCents: number | null | undefined
): number {
  if (!tipAmountCents || tipAmountCents <= 0) return 0
  return tipAmountCents - (tipOnPlatformFeeCents || 0)
}

/**
 * Calculate the platform fee tip portion for an order.
 * Tip is calculated on displayed subtotal (food + buyer fee).
 * Vendor tip = percentage of base food price.
 * Platform fee tip = total tip - vendor tip.
 *
 * @param totalTipCents - Total tip amount in cents
 * @param baseSubtotalCents - Base food price in cents (before fees)
 * @param tipPercentage - Tip percentage (integer, e.g. 10 for 10%)
 * @returns Platform fee tip portion in cents
 */
export function calculatePlatformFeeTip(
  totalTipCents: number,
  baseSubtotalCents: number,
  tipPercentage: number
): number {
  if (totalTipCents <= 0 || tipPercentage <= 0) return 0
  const vendorTipCents = Math.min(totalTipCents, Math.round(baseSubtotalCents * tipPercentage / 100))
  return totalTipCents - vendorTipCents
}
