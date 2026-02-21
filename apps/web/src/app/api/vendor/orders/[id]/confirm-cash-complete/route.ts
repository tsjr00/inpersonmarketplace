import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { recordExternalPaymentFee } from '@/lib/payments/vendor-fees'
import { sendNotification } from '@/lib/notifications'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/vendor/orders/[id]/confirm-cash-complete
 *
 * Single-step cash order completion: confirm cash received + fulfill all items.
 * Combines confirm-external-payment + fulfill in one action for cash orders.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/orders/[id]/confirm-cash-complete', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-cash-complete:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: orderId } = await params
    const supabase = await createClient()

    // Auth
    crumb.auth('Checking user authentication')
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get order with items
    crumb.supabase('select', 'orders')
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        payment_method,
        subtotal_cents,
        total_cents,
        external_payment_confirmed_at,
        order_number,
        buyer_user_id,
        vertical_id,
        order_items (
          id,
          vendor_profile_id,
          subtotal_cents,
          listing_id,
          quantity,
          vendor_profiles (
            id,
            user_id,
            profile_data
          )
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      throw traced.notFound('ERR_ORDER_001', 'Order not found')
    }

    // Must be a cash order
    if (order.payment_method !== 'cash') {
      throw traced.validation('ERR_ORDER_003', 'This endpoint is only for cash orders')
    }

    // Must be pending (not already confirmed)
    if (order.status !== 'pending') {
      throw traced.validation('ERR_ORDER_003', `Order is already ${order.status}`)
    }

    // Already confirmed?
    if (order.external_payment_confirmed_at) {
      throw traced.validation('ERR_ORDER_003', 'Payment already confirmed for this order')
    }

    // Verify caller is vendor for this order
    crumb.logic('Verifying vendor ownership')
    const orderItems = order.order_items as unknown as Array<{
      id: string
      vendor_profile_id: string
      subtotal_cents: number
      listing_id: string
      quantity: number
      vendor_profiles: { id: string; user_id: string; profile_data?: any }
    }>

    const isVendor = orderItems.some(item => item.vendor_profiles.user_id === user.id)

    if (!isVendor) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized to confirm payment for this order')
    }

    const serviceClient = createServiceClient()
    const now = new Date().toISOString()

    // Record platform fees owed
    crumb.logic('Recording platform fees')
    for (const item of orderItems) {
      const result = await recordExternalPaymentFee(
        serviceClient,
        item.vendor_profile_id,
        orderId,
        item.subtotal_cents
      )

      if (!result.success) {
        console.error('Failed to record fee:', result.error)
      }
    }

    // Update order status to paid + confirmed
    crumb.supabase('update', 'orders')
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        external_payment_confirmed_at: now,
        external_payment_confirmed_by: user.id,
        updated_at: now
      })
      .eq('id', orderId)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'orders', operation: 'update' })
    }

    // Fulfill all order items in one shot
    crumb.supabase('update', 'order_items')
    await serviceClient
      .from('order_items')
      .update({
        status: 'fulfilled',
        vendor_confirmed_at: now,
        pickup_confirmed_at: now,
        updated_at: now
      })
      .eq('order_id', orderId)
      .is('cancelled_at', null)

    // Mark order as completed
    crumb.logic('Completing order')
    await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: orderId })

    // Notify buyer
    const vendorName = (orderItems[0]?.vendor_profiles as any)?.profile_data?.business_name || 'Vendor'
    await sendNotification(order.buyer_user_id, 'order_fulfilled', {
      orderNumber: order.order_number,
      vendorName,
    }, { vertical: (order as any).vertical_id })

    return NextResponse.json({
      success: true,
      order_id: orderId,
      status: 'fulfilled',
      message: 'Cash payment confirmed and order completed.'
    })
  })
}
