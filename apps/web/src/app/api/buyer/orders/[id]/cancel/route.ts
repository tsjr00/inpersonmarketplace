import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createRefund, transferToVendor } from '@/lib/stripe/payments'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { restoreInventory } from '@/lib/inventory'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { calculateCancellationFee, CANCELLATION_FEE_PERCENT } from '@/lib/payments/cancellation-fees'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/buyer/orders/[id]/cancel - Buyer cancels an order item
// Layer 1: Within 1-hour grace period → full refund (always wins)
// Layer 2: After grace period AND vendor has confirmed/prepared → 25% cancellation fee
// If within grace period, no penalty regardless of vendor confirmation status
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params

  return withErrorTracing('/api/buyer/orders/[id]/cancel', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`buyer-order-cancel:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

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
    // Note: Only select columns that definitely exist - grace_period_ends_at may not be applied
    crumb.supabase('select', 'orders')
    const { data: userOrders, error: fetchError } = await supabase
      .from('orders')
      .select(`
        id,
        buyer_user_id,
        status,
        total_cents,
        created_at,
        order_number,
        vertical_id,
        order_items (
          id,
          status,
          quantity,
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
              profile_data,
              stripe_account_id,
              stripe_payouts_enabled
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

    // Calculate cancellation fee using extracted pure function
    crumb.logic('Calculating refund amounts')
    const orderCreatedAt = order.created_at ? new Date(order.created_at) : new Date()
    const totalItemsInOrder = order.order_items?.length || 1

    const {
      refundAmountCents,
      cancellationFeeCents,
      vendorShareCents,
      platformShareCents,
      feeApplied: cancellationFeeApplied,
      withinGracePeriod,
      vendorHadConfirmed: vendorHasConfirmed,
    } = calculateCancellationFee({
      subtotalCents: orderItem.subtotal_cents,
      totalItemsInOrder,
      orderStatus: orderItem.status,
      orderCreatedAt,
    })

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

    // Restore inventory for cancelled item
    crumb.logic('Restoring inventory for cancelled item')
    const cancelServiceClient = createServiceClient()
    const cancelListing = orderItem.listing as any
    if (cancelListing?.id) {
      await restoreInventory(cancelServiceClient, cancelListing.id, (orderItem as any).quantity || 1)
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

    // Notify vendor about cancellation (multi-channel via notification service)
    const listing = orderItem.listing as any
    const vendorProfile = listing?.vendor_profiles
    const vendorUserId = vendorProfile?.user_id

    if (vendorUserId) {
      await sendNotification(vendorUserId, 'order_cancelled_by_buyer', {
        orderNumber: order.order_number || undefined,
        reason: reason || undefined,
        itemTitle: listing?.title,
      }, { vertical: order.vertical_id })
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
        console.error('[REFUND_FAILED] Stripe refund failed for buyer cancellation:', {
          orderItemId: orderItem.id,
          orderId: order.id,
          amountCents: refundAmountCents,
          error: refundError instanceof Error ? refundError.message : refundError
        })
        // DB is already updated as cancelled. Refund needs manual processing.
        // TODO: Send admin notification for failed refund
      }
    }

    // F7 FIX: Transfer cancellation fee vendor share to vendor via Stripe
    if (cancellationFeeApplied && vendorShareCents > 0 && stripeRefundId) {
      const cancelVendor = (orderItem.listing as any)?.vendor_profiles
      if (cancelVendor?.stripe_account_id && cancelVendor.stripe_payouts_enabled) {
        try {
          crumb.logic('Transferring cancellation fee vendor share', {
            vendorShareCents,
            vendorId: cancelVendor.id,
          })
          await transferToVendor({
            amount: vendorShareCents,
            destination: cancelVendor.stripe_account_id,
            orderId: order.id,
            orderItemId: orderItemId,
          })
        } catch (transferErr) {
          console.error('[CANCEL_VENDOR_SHARE] Cancellation fee transfer failed:', {
            orderItemId,
            vendorShareCents,
            error: transferErr instanceof Error ? transferErr.message : transferErr,
          })
        }
      }
    }

    const refundFailed = payment?.stripe_payment_intent_id && !stripeRefundId
    return NextResponse.json({
      success: true,
      message: refundFailed
        ? 'Item cancelled. Refund processing encountered an issue and will be handled manually.'
        : cancellationFeeApplied
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
      stripe_refund_id: stripeRefundId,
      refundFailed: !!refundFailed
    })
  })
}
