import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/vendor/orders/[id]/payment-not-received
 *
 * Vendor flags that they have not received external payment for this order.
 * - Does NOT cancel the order (stays pending)
 * - Notifies the buyer to send payment or cancel
 * - Available only for external payment orders in pending status
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderId } = await context.params

  return withErrorTracing('/api/vendor/orders/[id]/payment-not-received', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-payment-flag:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking vendor authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get the order first — need vertical_id for multi-vertical vendor lookup
    crumb.supabase('select', 'orders')
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, buyer_user_id, vertical_id, payment_method, status')
      .eq('id', orderId)
      .single()

    if (!order) {
      throw traced.notFound('ERR_ORDER_001', 'Order not found')
    }

    // Get vendor profile scoped to this order's vertical
    const { profile: vendorProfile } = await getVendorProfileForVertical<{
      id: string
      profile_data: Record<string, unknown> | null
      user_id: string
    }>(supabase, user.id, order.vertical_id, 'id, profile_data, user_id')

    if (!vendorProfile) {
      throw traced.notFound('ERR_AUTH_002', 'Vendor profile not found')
    }

    // Verify this vendor owns items in this order
    const { count: vendorItemCount } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .eq('vendor_profile_id', vendorProfile.id)

    if (!vendorItemCount || vendorItemCount === 0) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized for this order')
    }

    // Must be external payment
    if (!order.payment_method || order.payment_method === 'stripe') {
      throw traced.validation('ERR_ORDER_001', 'This action is only available for external payment orders')
    }

    // Must be pending (not yet confirmed)
    if (order.status !== 'pending') {
      throw traced.validation('ERR_ORDER_001', 'Payment has already been confirmed for this order')
    }

    // Format payment method label
    const methodLabels: Record<string, string> = {
      venmo: 'Venmo', cashapp: 'Cash App', paypal: 'PayPal', cash: 'Cash'
    }
    const methodLabel = methodLabels[order.payment_method] || order.payment_method

    const vendorName = (vendorProfile.profile_data as Record<string, unknown>)?.business_name as string
      || (vendorProfile.profile_data as Record<string, unknown>)?.farm_name as string
      || 'Vendor'

    // Notify buyer that vendor hasn't received payment
    crumb.logic('Sending payment-not-received notification to buyer')
    await sendNotification(order.buyer_user_id, 'external_payment_not_received', {
      orderNumber: order.order_number,
      paymentMethod: methodLabel,
      vendorName,
    }, { vertical: order.vertical_id })

    return NextResponse.json({
      success: true,
      message: `Buyer notified that ${methodLabel} payment has not been received.`,
    })
  })
}
