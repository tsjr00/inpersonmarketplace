import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { restoreInventory } from '@/lib/inventory'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/vendor/orders/[id]/cancel-nonpayment
 *
 * Vendor cancels an external payment order because payment was not received.
 * - No penalty to vendor score (not a rejection — buyer failed to pay)
 * - Restores inventory for all items
 * - Notifies buyer that order was cancelled for non-payment
 * - Only available for external payment orders in pending status
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderId } = await context.params

  return withErrorTracing('/api/vendor/orders/[id]/cancel-nonpayment', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-cancel-nonpay:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking vendor authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get vendor profile
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, profile_data, user_id')
      .eq('user_id', user.id)
      .single()

    if (!vendorProfile) {
      throw traced.notFound('ERR_AUTH_002', 'Vendor profile not found')
    }

    // Get the order
    crumb.supabase('select', 'orders')
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, buyer_user_id, vertical_id, payment_method, status')
      .eq('id', orderId)
      .single()

    if (!order) {
      throw traced.notFound('ERR_ORDER_001', 'Order not found')
    }

    // Must be external payment
    if (!order.payment_method || order.payment_method === 'stripe') {
      throw traced.validation('ERR_ORDER_001', 'This action is only available for external payment orders')
    }

    // Must be pending (not yet confirmed)
    if (order.status !== 'pending') {
      throw traced.validation('ERR_ORDER_001', 'Only pending orders can be cancelled for non-payment')
    }

    // Get vendor's items in this order
    crumb.supabase('select', 'order_items')
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('id, listing_id, quantity, status')
      .eq('order_id', orderId)
      .eq('vendor_profile_id', vendorProfile.id)
      .is('cancelled_at', null)

    if (!orderItems || orderItems.length === 0) {
      throw traced.notFound('ERR_ORDER_001', 'No active items found for this order')
    }

    // Cancel all items — reason clearly indicates non-payment (not vendor fault)
    crumb.supabase('update', 'order_items')
    const now = new Date().toISOString()
    for (const item of orderItems) {
      await supabase
        .from('order_items')
        .update({
          status: 'cancelled',
          cancelled_at: now,
          cancelled_by: 'system', // 'system' not 'vendor' — doesn't affect vendor score
          cancellation_reason: 'Cancelled by vendor — external payment not received',
        })
        .eq('id', item.id)
        .is('cancelled_at', null) // Prevent double-cancel
    }

    // Restore inventory for all items
    crumb.logic('Restoring inventory for cancelled items')
    const serviceClient = createServiceClient()
    for (const item of orderItems) {
      if (item.listing_id) {
        await restoreInventory(serviceClient, item.listing_id, item.quantity || 1)
      }
    }

    // Format payment method label
    const methodLabels: Record<string, string> = {
      venmo: 'Venmo', cashapp: 'Cash App', paypal: 'PayPal', cash: 'Cash'
    }
    const methodLabel = methodLabels[order.payment_method] || order.payment_method

    // Notify buyer
    await sendNotification(order.buyer_user_id, 'order_cancelled_nonpayment', {
      orderNumber: order.order_number,
      paymentMethod: methodLabel,
    }, { vertical: order.vertical_id })

    return NextResponse.json({
      success: true,
      message: 'Order cancelled for non-payment. Buyer has been notified.',
    })
  })
}
