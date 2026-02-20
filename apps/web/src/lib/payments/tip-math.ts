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
