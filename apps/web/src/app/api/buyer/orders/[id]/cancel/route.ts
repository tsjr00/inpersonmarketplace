import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRefund } from '@/lib/stripe/payments'
import { STRIPE_CONFIG } from '@/lib/stripe/config'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Cancellation fee: 25% of what the buyer paid, retained and split between platform + vendor
const CANCELLATION_FEE_PERCENT = 25

// POST /api/buyer/orders/[id]/cancel - Buyer cancels an order item
// Layer 1: Within 1-hour grace period → full refund (always wins)
// Layer 2: After grace period AND vendor has confirmed/prepared → 25% cancellation fee
// If within grace period, no penalty regardless of vendor confirmation status
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params

  return withErrorTracing('/api/buyer/orders/[id]/cancel', 'POST', async () => {
    const supabase = await createClient()

    // Verify authentication
    crumb.auth('Checking user authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Parse request body for optional reason
    let reason = ''
    try {
      const body = await request.json()
      reason = body.reason || ''
    } catch {
      // No body provided, that's fine
    }

    // FIX: Query orders first to bypass RLS issue on order_items table
    // The order_items_select RLS policy uses user_buyer_order_ids() which should work,
    // but querying order_items directly fails. Querying orders first (with nested items) works.
    crumb.supabase('select', 'orders')
    const { data: userOrders, error: fetchError } = await supabase
      .from('orders')
      .select(`
        id,
        buyer_user_id,
        status,
        total_cents,
        grace_period_ends_at,
        order_items (
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
          )
        )
      `)
      .eq('buyer_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50) // Reasonable limit for recent orders

    if (fetchError) {
      throw traced.fromSupabase(fetchError, { table: 'orders', operation: 'select' })
    }

    // Find the order containing the target order_item
    let order: typeof userOrders[0] | null = null
    let orderItem: typeof userOrders[0]['order_items'][0] | null = null

    for (const o of userOrders || []) {
      const item = o.order_items?.find((i: { id: string }) => i.id === orderItemId)
      if (item) {
        order = o
        orderItem = item
        break
      }
    }

    if (!order || !orderItem) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    // Ownership already verified via buyer_user_id filter in query
    crumb.auth('Order ownership verified via query filter')

    // Check if already cancelled
    if (orderItem.cancelled_at) {
      throw traced.validation('ERR_ORDER_002', 'Item already cancelled')
    }

    // Cannot cancel fulfilled/completed orders
    crumb.logic('Checking cancellability')
    const nonCancellableStatuses = ['fulfilled', 'completed']
    if (nonCancellableStatuses.includes(orderItem.status)) {
      throw traced.validation('ERR_ORDER_002', 'Cannot cancel - this order has already been picked up.', { current_status: orderItem.status })
    }

    // Determine cancellation penalty eligibility
    // Layer 1: 1-hour grace period — always wins, no penalty
    // Layer 2: After grace period, penalty only applies if vendor has confirmed the order
    const gracePeriodEndsAt = order.grace_period_ends_at
      ? new Date(order.grace_period_ends_at)
      : null
    const withinGracePeriod = gracePeriodEndsAt ? new Date() < gracePeriodEndsAt : true
    const vendorHasConfirmed = ['confirmed', 'ready', 'fulfilled'].includes(orderItem.status)

    // Calculate what buyer originally paid for this item
    // subtotal_cents is the base price, buyer paid base + buyer fee portion
    const buyerFeeOnItem = Math.round(orderItem.subtotal_cents * (STRIPE_CONFIG.buyerFeePercent / 100)) + STRIPE_CONFIG.buyerFlatFeeCents
    const buyerPaidForItem = orderItem.subtotal_cents + buyerFeeOnItem

    let refundAmountCents: number
    let cancellationFeeCents: number
    let vendorShareCents: number
    let platformShareCents: number
    let cancellationFeeApplied = false

    crumb.logic('Calculating refund amounts')
    if (withinGracePeriod) {
      // Layer 1: Within 1-hour grace — full refund, no questions asked
      refundAmountCents = buyerPaidForItem
      cancellationFeeCents = 0
      vendorShareCents = 0
      platformShareCents = 0
    } else if (!vendorHasConfirmed) {
      // After grace but vendor hasn't confirmed yet — still full refund
      refundAmountCents = buyerPaidForItem
      cancellationFeeCents = 0
      vendorShareCents = 0
      platformShareCents = 0
    } else {
      // After grace period AND vendor has confirmed: buyer gets 75% of what they paid
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
    // Note: cancellation_fee_cents column doesn't exist - we only store refund_amount_cents
    crumb.supabase('update', 'order_items')
    const { error: updateError } = await supabase
      .from('order_items')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'buyer',
        cancellation_reason: reason || 'Cancelled by buyer',
        refund_amount_cents: refundAmountCents
      })
      .eq('id', orderItemId)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'order_items', operation: 'update' })
    }

    // Check if all items in the order are now cancelled - if so, update order status
    const orderId = order.id
    crumb.supabase('select', 'order_items')
    const { data: remainingItems } = await supabase
      .from('order_items')
      .select('id, status')
      .eq('order_id', orderId)
      .is('cancelled_at', null)

    if (!remainingItems || remainingItems.length === 0) {
      crumb.supabase('update', 'orders')
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
      crumb.supabase('insert', 'notifications')
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

    crumb.supabase('select', 'payments')
    const { data: payment } = await supabase
      .from('payments')
      .select('stripe_payment_intent_id, status')
      .eq('order_id', orderId)
      .eq('status', 'succeeded')
      .single()

    if (payment?.stripe_payment_intent_id) {
      try {
        crumb.logic('Processing Stripe refund')
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
      vendor_had_confirmed: vendorHasConfirmed,
      stripe_refund_id: stripeRefundId
    })
  })
}
