/**
 * Inventory restore business rules.
 *
 * Extracted for testability — these rules determine whether inventory
 * should be restored when an order item is cancelled or refunded.
 *
 * Business Rule (Session 62, decisions.md):
 * - FT fulfilled items do NOT restore inventory (cooked food can't be resold)
 * - FM fulfilled items DO restore inventory (produce/goods can potentially be resold)
 * - Non-fulfilled items ALWAYS restore regardless of vertical
 */

/**
 * Determine whether inventory should be restored for a cancelled/refunded item.
 *
 * @param itemStatus - The order item's status at time of cancellation/refund
 * @param verticalId - The vertical the order belongs to
 * @returns true if inventory should be restored
 */
export function shouldRestoreInventory(itemStatus: string, verticalId: string): boolean {
  // FT fulfilled items: cooked food can't be resold
  if (itemStatus === 'fulfilled' && verticalId === 'food_trucks') {
    return false
  }
  // All other cases: restore
  return true
}
