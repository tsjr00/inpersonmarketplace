import { SupabaseClient } from '@supabase/supabase-js'

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
