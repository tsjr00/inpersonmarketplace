import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Restore inventory for cancelled/expired order items.
 * Reads current quantity and adds back the restored amount.
 *
 * Uses service client to bypass RLS since this runs in system contexts
 * (cron jobs, cancellation handlers).
 *
 * Note: This has a small race window between read and update.
 * For the restore path (less contention than decrement), this is acceptable.
 * A proper atomic_restore_inventory RPC should be created in a future migration.
 */
export async function restoreInventory(
  serviceClient: SupabaseClient,
  listingId: string,
  quantity: number
): Promise<{ success: boolean; newQuantity?: number }> {
  // Only restore if listing has managed inventory (quantity is not null)
  const { data: listing, error: fetchError } = await serviceClient
    .from('listings')
    .select('quantity')
    .eq('id', listingId)
    .single()

  if (fetchError || !listing || listing.quantity === null) {
    // Listing not found or has unlimited inventory — nothing to restore
    return { success: true }
  }

  const newQuantity = listing.quantity + quantity

  const { error: updateError } = await serviceClient
    .from('listings')
    .update({ quantity: newQuantity })
    .eq('id', listingId)

  if (updateError) {
    return { success: false }
  }

  return { success: true, newQuantity }
}

/**
 * Restore inventory for all items in an order.
 * Used when an entire order is cancelled or expires.
 */
export async function restoreOrderInventory(
  serviceClient: SupabaseClient,
  orderId: string
): Promise<{ restored: number; failed: number }> {
  const { data: orderItems, error } = await serviceClient
    .from('order_items')
    .select('listing_id, quantity')
    .eq('order_id', orderId)
    .is('cancelled_at', null) // Only restore non-cancelled items

  if (error || !orderItems) {
    return { restored: 0, failed: 0 }
  }

  // Group quantities by listing_id (same listing could appear in multiple items)
  const quantityByListing = new Map<string, number>()
  for (const item of orderItems) {
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

  return { restored, failed }
}
