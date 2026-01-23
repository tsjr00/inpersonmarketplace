import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Cancellation fee constants
const PLATFORM_CANCELLATION_FEE_PERCENT = 5 // Platform always gets 5%
const MAX_VENDOR_CANCELLATION_FEE_PERCENT = 45 // Vendor can charge up to 45% more

// POST /api/buyer/orders/[id]/cancel - Buyer cancels an order item
// Before confirmation: Full refund
// After confirmation: Cancellation fee applies (5% platform minimum)
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse request body for optional reason
  let reason = ''
  try {
    const body = await request.json()
    reason = body.reason || ''
  } catch {
    // No body provided, that's fine
  }

  // Get the order item with vendor info
  const { data: orderItem, error: fetchError } = await supabase
    .from('order_items')
    .select(`
      id,
      status,
      subtotal_cents,
      cancelled_at,
      listing:listings (
        id,
        vendor_profile_id,
        vendor_profiles (
          id,
          user_id,
          profile_data
        )
      ),
      order:orders!inner (
        id,
        buyer_user_id,
        status
      )
    `)
    .eq('id', orderItemId)
    .single()

  if (fetchError || !orderItem) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
  }

  // Verify this order belongs to the current user
  const orderData = orderItem.order as unknown
  const order = Array.isArray(orderData) ? orderData[0] : orderData
  if (!order || (order as { buyer_user_id: string }).buyer_user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Check if already cancelled
  if (orderItem.cancelled_at) {
    return NextResponse.json(
      { error: 'Item already cancelled' },
      { status: 400 }
    )
  }

  // Determine cancellation fees based on status
  const preConfirmationStatuses = ['pending', 'paid']
  const postConfirmationStatuses = ['confirmed', 'ready']
  const nonCancellableStatuses = ['fulfilled', 'completed']

  // Cannot cancel fulfilled/completed orders
  if (nonCancellableStatuses.includes(orderItem.status)) {
    return NextResponse.json(
      {
        error: 'Cannot cancel - this order has already been picked up.',
        current_status: orderItem.status
      },
      { status: 400 }
    )
  }

  let refundAmount = orderItem.subtotal_cents
  let platformFee = 0
  let cancellationFeeApplied = false

  // After vendor confirms, apply cancellation fee
  if (postConfirmationStatuses.includes(orderItem.status)) {
    // Platform takes minimum 5%
    platformFee = Math.round(orderItem.subtotal_cents * (PLATFORM_CANCELLATION_FEE_PERCENT / 100))
    refundAmount = orderItem.subtotal_cents - platformFee
    cancellationFeeApplied = true

    // Note: In a full implementation, vendor would be notified and could add their portion
    // For now, we only apply the platform minimum fee
  }

  // Update the order item as cancelled
  const { error: updateError } = await supabase
    .from('order_items')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'buyer',
      cancellation_reason: reason || 'Cancelled by buyer',
      refund_amount_cents: refundAmount
    })
    .eq('id', orderItemId)

  if (updateError) {
    console.error('Error cancelling order item:', updateError)
    return NextResponse.json({ error: 'Failed to cancel item' }, { status: 500 })
  }

  // Check if all items in the order are now cancelled - if so, update order status
  const { data: remainingItems } = await supabase
    .from('order_items')
    .select('id, status')
    .eq('order_id', (order as { id: string }).id)
    .is('cancelled_at', null)

  if (!remainingItems || remainingItems.length === 0) {
    // All items cancelled, update order status
    await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', (order as { id: string }).id)
  }

  // Get vendor info for notification
  const listing = orderItem.listing as any
  const vendorProfile = listing?.vendor_profiles
  const vendorUserId = vendorProfile?.user_id

  // Create notification for vendor about cancellation
  if (vendorUserId) {
    await supabase
      .from('notifications')
      .insert({
        user_id: vendorUserId,
        type: 'order_cancelled',
        title: 'Order Item Cancelled',
        message: reason
          ? `A buyer cancelled an item. Reason: ${reason}`
          : 'A buyer cancelled an item from their order.',
        data: {
          order_item_id: orderItemId,
          cancellation_reason: reason,
          refund_amount_cents: refundAmount,
          cancellation_fee_cents: platformFee
        }
      })
      .select()
      .single()
  }

  // TODO: In production, trigger Stripe refund here
  // For now, we just track the refund amount

  return NextResponse.json({
    success: true,
    message: cancellationFeeApplied
      ? `Item cancelled. A ${PLATFORM_CANCELLATION_FEE_PERCENT}% cancellation fee was applied.`
      : 'Item cancelled successfully. Full refund will be processed.',
    cancelled_at: new Date().toISOString(),
    refund_amount_cents: refundAmount,
    cancellation_fee_cents: platformFee,
    cancellation_fee_applied: cancellationFeeApplied
  })
}
