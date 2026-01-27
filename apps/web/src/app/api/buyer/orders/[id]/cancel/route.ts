import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRefund } from '@/lib/stripe/payments'
import { STRIPE_CONFIG } from '@/lib/stripe/config'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Cancellation fee: 25% of what the buyer paid, retained and split between platform + vendor
const CANCELLATION_FEE_PERCENT = 25

// POST /api/buyer/orders/[id]/cancel - Buyer cancels an order item
// Within grace period (1 hour): Full refund
// After grace period: 25% cancellation fee, buyer gets 75% back
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

  // Get the order item with order info including grace period
  const { data: orderItem, error: fetchError } = await supabase
    .from('order_items')
    .select(`
      id,
      status,
      subtotal_cents,
      platform_fee_cents,
      vendor_payout_cents,
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
        status,
        total_cents,
        grace_period_ends_at
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

  // Cannot cancel fulfilled/completed orders
  const nonCancellableStatuses = ['fulfilled', 'completed']
  if (nonCancellableStatuses.includes(orderItem.status)) {
    return NextResponse.json(
      {
        error: 'Cannot cancel - this order has already been picked up.',
        current_status: orderItem.status
      },
      { status: 400 }
    )
  }

  // Determine if within grace period
  const typedOrder = order as { id: string; grace_period_ends_at: string | null }
  const gracePeriodEndsAt = typedOrder.grace_period_ends_at
    ? new Date(typedOrder.grace_period_ends_at)
    : null
  const withinGracePeriod = gracePeriodEndsAt ? new Date() < gracePeriodEndsAt : true

  // Calculate what buyer originally paid for this item
  // subtotal_cents is the base price, buyer paid base + buyer fee portion
  const buyerFeeOnItem = Math.round(orderItem.subtotal_cents * (STRIPE_CONFIG.buyerFeePercent / 100)) + STRIPE_CONFIG.buyerFlatFeeCents
  const buyerPaidForItem = orderItem.subtotal_cents + buyerFeeOnItem

  let refundAmountCents: number
  let cancellationFeeCents: number
  let vendorShareCents: number
  let platformShareCents: number
  let cancellationFeeApplied = false

  if (withinGracePeriod) {
    // Full refund - buyer gets everything back
    refundAmountCents = buyerPaidForItem
    cancellationFeeCents = 0
    vendorShareCents = 0
    platformShareCents = 0
  } else {
    // After grace period: buyer gets 75% of what they paid
    cancellationFeeApplied = true
    refundAmountCents = Math.round(buyerPaidForItem * (1 - CANCELLATION_FEE_PERCENT / 100))
    cancellationFeeCents = buyerPaidForItem - refundAmountCents

    // Split the retained 25% between platform and vendor using normal fee percentages
    // Platform takes its normal percentage from the retained amount
    const platformPercentShare = Math.round(cancellationFeeCents * (STRIPE_CONFIG.applicationFeePercent / 100))
    platformShareCents = platformPercentShare
    vendorShareCents = cancellationFeeCents - platformShareCents
  }

  // Update the order item as cancelled
  const { error: updateError } = await supabase
    .from('order_items')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'buyer',
      cancellation_reason: reason || 'Cancelled by buyer',
      refund_amount_cents: refundAmountCents,
      cancellation_fee_cents: cancellationFeeCents
    })
    .eq('id', orderItemId)

  if (updateError) {
    console.error('Error cancelling order item:', updateError)
    return NextResponse.json({ error: 'Failed to cancel item' }, { status: 500 })
  }

  // Check if all items in the order are now cancelled - if so, update order status
  const orderId = typedOrder.id
  const { data: remainingItems } = await supabase
    .from('order_items')
    .select('id, status')
    .eq('order_id', orderId)
    .is('cancelled_at', null)

  if (!remainingItems || remainingItems.length === 0) {
    await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
  }

  // Get vendor info for notification
  const listing = orderItem.listing as any
  const vendorProfile = listing?.vendor_profiles
  const vendorUserId = vendorProfile?.user_id

  // Create notification for vendor about cancellation
  if (vendorUserId) {
    const feeMessage = cancellationFeeApplied
      ? ` A 25% cancellation fee applies — you will receive $${(vendorShareCents / 100).toFixed(2)}.`
      : ''
    await supabase
      .from('notifications')
      .insert({
        user_id: vendorUserId,
        type: 'order_cancelled',
        title: 'Order Item Cancelled',
        message: (reason
          ? `A buyer cancelled an item. Reason: ${reason}.`
          : 'A buyer cancelled an item from their order.') + feeMessage,
        data: {
          order_item_id: orderItemId,
          cancellation_reason: reason,
          refund_amount_cents: refundAmountCents,
          cancellation_fee_cents: cancellationFeeCents,
          vendor_share_cents: vendorShareCents,
          platform_share_cents: platformShareCents
        }
      })
      .select()
      .single()
  }

  // Execute Stripe refund if payment exists
  let stripeRefundId: string | null = null

  const { data: payment } = await supabase
    .from('payments')
    .select('stripe_payment_intent_id, status')
    .eq('order_id', orderId)
    .eq('status', 'succeeded')
    .single()

  if (payment?.stripe_payment_intent_id) {
    try {
      const refund = await createRefund(payment.stripe_payment_intent_id, refundAmountCents)
      stripeRefundId = refund.id
    } catch (refundError) {
      console.error('Stripe refund failed:', refundError)
      // DB is already updated as cancelled. Log the failure but don't block the response.
      // Admin will need to manually process this refund.
    }
  }

  return NextResponse.json({
    success: true,
    message: cancellationFeeApplied
      ? `Item cancelled. A ${CANCELLATION_FEE_PERCENT}% cancellation fee was applied. You will be refunded $${(refundAmountCents / 100).toFixed(2)}.`
      : 'Item cancelled successfully. Full refund will be processed.',
    cancelled_at: new Date().toISOString(),
    refund_amount_cents: refundAmountCents,
    cancellation_fee_cents: cancellationFeeCents,
    vendor_share_cents: vendorShareCents,
    platform_share_cents: platformShareCents,
    cancellation_fee_applied: cancellationFeeApplied,
    within_grace_period: withinGracePeriod,
    stripe_refund_id: stripeRefundId
  })
}
