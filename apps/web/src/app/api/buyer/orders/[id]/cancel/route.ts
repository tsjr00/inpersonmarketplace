import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/buyer/orders/[id]/cancel - Buyer cancels an order item
// Only allowed before vendor confirms (status = 'pending' or 'paid')
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

  // Get the order item and verify it belongs to this buyer's order
  const { data: orderItem, error: fetchError } = await supabase
    .from('order_items')
    .select(`
      id,
      status,
      subtotal_cents,
      cancelled_at,
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

  // Check if item is in a cancellable state (only before vendor confirms)
  // Allowed states: pending, paid
  // Not allowed: confirmed, ready, fulfilled (vendor has already started processing)
  const cancellableStatuses = ['pending', 'paid']
  if (!cancellableStatuses.includes(orderItem.status)) {
    return NextResponse.json(
      {
        error: 'Cannot cancel - vendor has already confirmed this item. Please contact the vendor directly.',
        current_status: orderItem.status
      },
      { status: 400 }
    )
  }

  // Update the order item as cancelled
  const { error: updateError } = await supabase
    .from('order_items')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'buyer',
      cancellation_reason: reason || 'Cancelled by buyer',
      refund_amount_cents: orderItem.subtotal_cents // Full refund for buyer-initiated cancellation
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

  // TODO: In production, trigger Stripe refund here
  // For now, we just track the refund amount

  return NextResponse.json({
    success: true,
    message: 'Item cancelled successfully',
    cancelled_at: new Date().toISOString(),
    refund_amount_cents: orderItem.subtotal_cents
  })
}
