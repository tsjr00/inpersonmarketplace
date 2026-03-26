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
// Layer 1: Within per-vertical early cancel window → full refund (FM=1hr, FT=15min)
// Layer 2: After window AND vendor has confirmed/prepared → 25% cancellation fee
// Layer 3: After window but vendor NOT confirmed → full refund (pre-confirm override)
export const maxDuration = 30

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params

  return withErrorTracing('/api/buyer/orders/[id]/cancel', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`buyer-order-cancel:${clientIp}`, rateLimits.submit)
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

    // Query order_item directly by ID — RLS policy authorizes via user_buyer_order_ids()
    crumb.supabase('select', 'order_items')
    const { data: orderItem, error: itemError } = await supabase
      .from('order_items')
      .select(`
        id,
        order_id,
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
      `)
      .eq('id', orderItemId)
      .single()

    if (itemError || !orderItem) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    // Fetch the parent order
    crumb.supabase('select', 'orders')
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_user_id, status, total_cents, small_order_fee_cents, created_at, order_number, vertical_id, payment_method')
      .eq('id', orderItem.order_id)
      .single()

    if (orderError || !order) {
      throw traced.notFound('ERR_ORDER_001', 'Order not found', { orderId: orderItem.order_id })
    }

    // Verify this buyer owns the order
    if (order.buyer_user_id !== user.id) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized for this order')
    }

    // Ownership already verified via buyer_user_id filter in query
    crumb.auth('Order ownership verified via query filter')

    // Check if already cancelled
    if (orderItem.cancelled_at) {
      throw traced.validation('ERR_ORDER_002', 'Item already cancelled')
    }

    // Only allow cancellation for pre-fulfillment statuses
    crumb.logic('Checking cancellability')
    const cancellableStatuses = ['pending', 'confirmed', 'ready']
    if (!cancellableStatuses.includes(orderItem.status)) {
      throw traced.validation('ERR_ORDER_002', 'Cannot cancel - this order has already been picked up.', { current_status: orderItem.status })
    }

    // Calculate cancellation fee using extracted pure function
    crumb.logic('Calculating refund amounts')
    const orderCreatedAt = order.created_at ? new Date(order.created_at) : new Date()

    // Count total items in this order for fee proration
    const { count: totalItemsInOrder } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order.id)

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
      totalItemsInOrder: totalItemsInOrder || 1,
      orderStatus: orderItem.status,
      orderCreatedAt,
      vertical: order.vertical_id,
      smallOrderFeeCents: (order as Record<string, unknown>).small_order_fee_cents as number || 0,
    })

    // H3 FIX: Conditional UPDATE — only succeeds if cancelled_at IS NULL.
    // Prevents double-cancel race (buyer+vendor, double-click, cron+manual).
    // PostgreSQL's implicit row lock ensures only one concurrent UPDATE matches.
    crumb.supabase('update', 'order_items')
    const { data: updatedRows, error: updateError } = await supabase
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
      .is('cancelled_at', null)
      .select('id')

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'order_items', operation: 'update' })
    }

    // If no rows matched, item was already cancelled by a concurrent request
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        { error: 'This item has already been cancelled' },
        { status: 409 }
      )
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

        // M4 FIX: Update status to 'refunded' after successful Stripe refund
        await supabase
          .from('order_items')
          .update({ status: 'refunded' })
          .eq('id', orderItemId)
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
    // M-11 FIX: Record payout in vendor_payouts so Phase 5 can retry failures
    if (cancellationFeeApplied && vendorShareCents > 0 && stripeRefundId) {
      const cancelVendor = (orderItem.listing as any)?.vendor_profiles
      if (cancelVendor?.stripe_account_id && cancelVendor.stripe_payouts_enabled) {
        // Insert pending payout FIRST (atomic pattern from H-10)
        const serviceClient = createServiceClient()
        const { data: payoutRecord } = await serviceClient.from('vendor_payouts').insert({
          order_item_id: orderItemId,
          vendor_profile_id: (orderItem.listing as any)?.vendor_profile_id || cancelVendor?.id,
          amount_cents: vendorShareCents,
          stripe_transfer_id: null,
          status: 'pending',
        }).select('id').single()

        try {
          crumb.logic('Transferring cancellation fee vendor share', {
            vendorShareCents,
            vendorId: cancelVendor.id,
          })
          const transfer = await transferToVendor({
            amount: vendorShareCents,
            destination: cancelVendor.stripe_account_id,
            orderId: order.id,
            orderItemId: orderItemId,
          })

          if (payoutRecord) {
            await serviceClient.from('vendor_payouts')
              .update({ stripe_transfer_id: transfer.id, status: 'processing', updated_at: new Date().toISOString() })
              .eq('id', payoutRecord.id)
          }
        } catch (transferErr) {
          console.error('[CANCEL_VENDOR_SHARE] Cancellation fee transfer failed:', {
            orderItemId,
            vendorShareCents,
            error: transferErr instanceof Error ? transferErr.message : transferErr,
          })
          // Mark as failed — Phase 5 will retry
          if (payoutRecord) {
            await serviceClient.from('vendor_payouts')
              .update({ status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', payoutRecord.id)
          }
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
