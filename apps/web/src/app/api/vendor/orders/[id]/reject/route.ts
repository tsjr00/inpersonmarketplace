import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createRefund } from '@/lib/stripe/payments'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { restoreInventory } from '@/lib/inventory'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { FEES } from '@/lib/pricing'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/vendor/orders/[id]/reject - Vendor rejects/cancels an order item
// Vendor can reject at any time before fulfillment (pending, paid, confirmed, ready)
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/orders/[id]/reject', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-order-reject:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: orderItemId } = await context.params
    const supabase = await createClient()

    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Parse request body for reason (required for vendor rejection)
    let reason = ''
    try {
      const body = await request.json()
      reason = body.reason || ''
    } catch {
      // No body provided
    }

    if (!reason) {
      return NextResponse.json(
        { error: 'Reason is required when rejecting an order' },
        { status: 400 }
      )
    }

    // Get the order item with buyer/order info for notification
    const { data: orderItem, error: fetchError } = await supabase
      .from('order_items')
      .select(`
        id,
        status,
        quantity,
        subtotal_cents,
        cancelled_at,
        vendor_profile_id,
        order_id,
        listing_id,
        order:orders!inner(id, order_number, buyer_user_id, vertical_id),
        listing:listings(title, vendor_profiles(profile_data))
      `)
      .eq('id', orderItemId)
      .single()

    if (fetchError || !orderItem) {
      return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
    }

    // Verify this item belongs to the current vendor
    if (orderItem.vendor_profile_id !== vendorProfile.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Check if already cancelled
    if (orderItem.cancelled_at) {
      return NextResponse.json(
        { error: 'Item already cancelled' },
        { status: 400 }
      )
    }

    // Check if item is in a rejectable state (not yet fulfilled)
    // Vendor can reject: pending, paid, confirmed, ready
    // Cannot reject: fulfilled (already handed off to customer)
    if (orderItem.status === 'fulfilled') {
      return NextResponse.json(
        { error: 'Cannot reject - item has already been fulfilled' },
        { status: 400 }
      )
    }

    // H1 FIX: Calculate buyer's actual paid amount for this item (not just subtotal)
    // Buyer paid: subtotal + 6.5% buyer fee + prorated flat fee
    const { count: totalItemsInOrder } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderItem.order_id)

    const buyerPercentFee = Math.round(orderItem.subtotal_cents * (FEES.buyerFeePercent / 100))
    const proratedFlatFee = totalItemsInOrder ? Math.round(FEES.buyerFlatFeeCents / totalItemsInOrder) : 0
    const buyerPaidForItem = orderItem.subtotal_cents + buyerPercentFee + proratedFlatFee

    // Update the order item as cancelled by vendor
    const { error: updateError } = await supabase
      .from('order_items')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'vendor',
        cancellation_reason: reason,
        refund_amount_cents: buyerPaidForItem // Full refund of what buyer actually paid
      })
      .eq('id', orderItemId)

    if (updateError) {
      console.error('Error rejecting order item:', updateError)
      return NextResponse.json({ error: 'Failed to reject item' }, { status: 500 })
    }

    // Restore inventory for rejected item
    const rejectServiceClient = createServiceClient()
    if (orderItem.listing_id) {
      await restoreInventory(rejectServiceClient, orderItem.listing_id, orderItem.quantity || 1)
    }

    // Process Stripe refund for vendor rejection (full refund)
    let stripeRefundId: string | null = null
    const { data: payment } = await supabase
      .from('payments')
      .select('stripe_payment_intent_id, status')
      .eq('order_id', orderItem.order_id)
      .eq('status', 'succeeded')
      .single()

    if (payment?.stripe_payment_intent_id) {
      try {
        const refund = await createRefund(payment.stripe_payment_intent_id, buyerPaidForItem)
        stripeRefundId = refund.id
      } catch (refundError) {
        console.error('Stripe refund failed for vendor rejection:', refundError)
        // DB already updated — admin will need to manually process this refund
      }
    }

    // Check if all items in the order are now cancelled
    const { data: remainingItems } = await supabase
      .from('order_items')
      .select('id, status')
      .eq('order_id', orderItem.order_id)
      .is('cancelled_at', null)

    if (!remainingItems || remainingItems.length === 0) {
      // All items cancelled, update order status
      await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderItem.order_id)
    }

    // Track cancellation metrics — all rejections count toward vendor reliability
    const { data: counts } = await supabase.rpc('increment_vendor_cancelled' as any, {
      p_vendor_id: vendorProfile.id,
    }).single()

    // Check cancellation rate thresholds (only after 10+ confirmed orders)
    if (counts) {
      const { confirmed_count, cancelled_count } = counts as { confirmed_count: number; cancelled_count: number }
      if (confirmed_count >= 10) {
        const rate = Math.round((cancelled_count / confirmed_count) * 100)
        if (rate >= 10) {
          // Send warning notification to vendor (email + in-app)
          const rejectVerticalId = ((orderItem as any).order as any)?.vertical_id
          await sendNotification(user.id, 'vendor_cancellation_warning', {
            cancellationRate: rate,
            cancelledCount: cancelled_count,
            confirmedCount: confirmed_count,
          }, { vertical: rejectVerticalId })
          // Update warning timestamp
          await supabase
            .from('vendor_profiles')
            .update({ cancellation_warning_sent_at: new Date().toISOString() })
            .eq('id', vendorProfile.id)
        }
      }
    }

    // Notify buyer that vendor cancelled their order (URGENT — SMS + in-app)
    const rejectOrderData = (orderItem as any).order as any
    const rejectListing = (orderItem as any).listing as any
    const rejectVendorName = rejectListing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
    await sendNotification(rejectOrderData.buyer_user_id, 'order_cancelled_by_vendor', {
      orderNumber: rejectOrderData.order_number,
      vendorName: rejectVendorName,
      itemTitle: rejectListing?.title,
      reason,
    }, { vertical: rejectOrderData.vertical_id })

    return NextResponse.json({
      success: true,
      message: 'Item rejected successfully',
      cancelled_at: new Date().toISOString(),
      refund_amount_cents: buyerPaidForItem,
      reason: reason
    })
  })
}
