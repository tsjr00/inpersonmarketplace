import { SupabaseClient } from '@supabase/supabase-js'
import { shouldRestoreInventory } from '@/lib/inventory-rules'

/**
 * Restore inventory for cancelled/expired order items.
 * Uses atomic_restore_inventory RPC for race-safe restoration.
 *
 * Uses service client to bypass RLS since this runs in system contexts
 * (cron jobs, cancellation handlers).
 */
export async function restoreInventory(
  serviceClient: SupabaseClient,
  listingId: string,
  quantity: number
): Promise<{ success: boolean; newQuantity?: number }> {
  const { data, error } = await serviceClient
    .rpc('atomic_restore_inventory', {
      p_listing_id: listingId,
      p_quantity: quantity,
    })

  if (error) {
    // RPC returns no rows if listing not found or has unlimited inventory
    // That's not a failure — nothing to restore
    if (error.code === 'PGRST116') {
      return { success: true }
    }
    console.error('Failed to restore inventory:', error.message)
    return { success: false }
  }

  // RPC returns array of {new_quantity}
  const newQuantity = Array.isArray(data) && data.length > 0
    ? data[0].new_quantity
    : undefined

  return { success: true, newQuantity }
}

/**
 * Cancel an order's active items with a guarded claim, then restore inventory
 * for ONLY the rows the claim actually flipped (CHK-7/CRN-5, 2026-07-18).
 *
 * Replaces the restore-before-cancel pattern in checkout cleanup and the
 * expire-orders cron: restoring first meant a concurrent sweep (second
 * checkout, overlapping cron run) could restore the same items twice, and a
 * failure mid-flow could restore items that were never decremented. Here the
 * guarded UPDATE (`cancelled_at IS NULL`) is the claim — a concurrent caller
 * matches zero rows and restores nothing.
 *
 * Failure direction: a crash between the claim and the restore leaves items
 * cancelled with inventory NOT restored (understock, vendor-favoring) instead
 * of phantom stock (oversell) — the deliberate trade.
 *
 * Pre-cancel statuses are read just before the claim to drive the FT
 * fulfilled-item restore rule (cooked food is never restored); the read→claim
 * window is milliseconds and only affects that filter, never the double-
 * restore guarantee.
 *
 * The ORDER row flip stays with the caller (guards differ per site).
 */
export async function cancelOrderItemsAndRestoreGuarded(
  serviceClient: SupabaseClient,
  orderId: string,
  verticalId: string | undefined,
  cancelledBy: string,
  cancellationReason: string
): Promise<{ claimed: number; restored: number; failed: number; skipped: number }> {
  const { data: activeItems } = await serviceClient
    .from('order_items')
    .select('id, listing_id, quantity, status')
    .eq('order_id', orderId)
    .is('cancelled_at', null)

  if (!activeItems || activeItems.length === 0) {
    return { claimed: 0, restored: 0, failed: 0, skipped: 0 }
  }

  const { data: claimedRows, error: claimError } = await serviceClient
    .from('order_items')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: cancelledBy,
      cancellation_reason: cancellationReason,
    })
    .eq('order_id', orderId)
    .is('cancelled_at', null)
    .select('id')

  if (claimError || !claimedRows || claimedRows.length === 0) {
    return { claimed: 0, restored: 0, failed: 0, skipped: 0 }
  }

  const claimedIds = new Set(claimedRows.map(r => r.id))
  const restorableItems = activeItems.filter(item =>
    claimedIds.has(item.id) &&
    (verticalId ? shouldRestoreInventory(item.status, verticalId) : true)
  )

  const quantityByListing = new Map<string, number>()
  for (const item of restorableItems) {
    const current = quantityByListing.get(item.listing_id) || 0
    quantityByListing.set(item.listing_id, current + item.quantity)
  }

  let restored = 0
  let failed = 0
  for (const [listingId, qty] of quantityByListing) {
    const result = await restoreInventory(serviceClient, listingId, qty)
    if (result.success) {
      restored++
    } else {
      failed++
    }
  }

  return {
    claimed: claimedRows.length,
    restored,
    failed,
    skipped: claimedRows.length - restorableItems.length,
  }
}

/**
 * Restore inventory for all items in an order.
 * Used when an entire order is cancelled or expires.
 *
 * Respects vertical-aware restore rules:
 * - FT fulfilled items are NOT restored (cooked food can't be resold)
 * - All other items are restored
 *
 * @param verticalId - The order's vertical (e.g., 'food_trucks', 'farmers_market').
 *   When provided, each item's status is checked against restore rules.
 *   When omitted, all items are restored unconditionally (legacy behavior).
 */
export async function restoreOrderInventory(
  serviceClient: SupabaseClient,
  orderId: string,
  verticalId?: string
): Promise<{ restored: number; failed: number; skipped: number }> {
  const { data: orderItems, error } = await serviceClient
    .from('order_items')
    .select('listing_id, quantity, status')
    .eq('order_id', orderId)
    .is('cancelled_at', null) // Only restore non-cancelled items

  if (error || !orderItems) {
    return { restored: 0, failed: 0, skipped: 0 }
  }

  // Filter items using restore rules when vertical is known
  const restorableItems = verticalId
    ? orderItems.filter(item => shouldRestoreInventory(item.status, verticalId))
    : orderItems

  // Group quantities by listing_id (same listing could appear in multiple items)
  const quantityByListing = new Map<string, number>()
  for (const item of restorableItems) {
    const current = quantityByListing.get(item.listing_id) || 0
    quantityByListing.set(item.listing_id, current + item.quantity)
  }

  let restored = 0
  let failed = 0
  const skipped = orderItems.length - restorableItems.length

  for (const [listingId, qty] of quantityByListing) {
    const result = await restoreInventory(serviceClient, listingId, qty)
    if (result.success) {
      restored++
    } else {
      failed++
    }
  }

  return { restored, failed, skipped }
}
