import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { recordExternalPaymentFee } from '@/lib/payments/vendor-fees'
import { sendNotification } from '@/lib/notifications'
import { LOW_STOCK_THRESHOLD } from '@/lib/constants'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/vendor/orders/[id]/confirm-external-payment
 *
 * Vendor confirms they received external payment (Venmo, Cash App, PayPal, Cash).
 * This marks the order as paid and records platform fees owed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/orders/[id]/confirm-external-payment', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-confirm-external-payment:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: orderId } = await params
    const supabase = await createClient()

    // Auth
    crumb.auth('Checking user authentication')
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get order with items and buyer info for notification
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
          ),
          listings (
            id,
            title,
            quantity
          )
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      throw traced.notFound('ERR_ORDER_001', 'Order not found')
    }

    // Verify this is an external payment order
    if (order.payment_method === 'stripe') {
      throw traced.validation('ERR_ORDER_003', 'This order was paid via Stripe, not external payment')
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
      listings: { id: string; title: string; quantity: number | null } | null
    }>

    const isVendor = orderItems.some(item => item.vendor_profiles.user_id === user.id)

    if (!isVendor) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized to confirm payment for this order')
    }

    // Get service client for fee recording
    const serviceClient = createServiceClient()

    // Record platform fees owed for each vendor's portion
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
        // Continue anyway - don't block order confirmation
      }
    }

    // Update order status
    crumb.supabase('update', 'orders')
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        external_payment_confirmed_at: new Date().toISOString(),
        external_payment_confirmed_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'orders', operation: 'update' })
    }

    // Decrement inventory for each order item
    crumb.logic('Decrementing inventory for external payment order')
    for (const item of orderItems) {
      if (!item.listings || item.listings.quantity === null) continue
      const previousQuantity = item.listings.quantity
      const { data: updated } = await serviceClient
        .rpc('atomic_decrement_inventory' as string, {
          p_listing_id: item.listing_id,
          p_quantity: item.quantity
        })
        .single()

      const newQuantity = (updated as any)?.new_quantity ?? Math.max(0, previousQuantity - item.quantity)
      const vendorUserId = item.vendor_profiles?.user_id
      if (vendorUserId) {
        if (newQuantity === 0) {
          await sendNotification(vendorUserId, 'inventory_out_of_stock', {
            itemTitle: item.listings.title,
          }, { vertical: (order as any).vertical_id })
        } else if (newQuantity <= LOW_STOCK_THRESHOLD && previousQuantity > LOW_STOCK_THRESHOLD) {
          await sendNotification(vendorUserId, 'inventory_low_stock', {
            itemTitle: item.listings.title,
          }, { vertical: (order as any).vertical_id })
        }
      }
    }

    // Notify buyer that external payment was confirmed
    const extVendorName = (orderItems[0]?.vendor_profiles as any)?.profile_data?.business_name || 'Vendor'
    await sendNotification(order.buyer_user_id, 'order_confirmed', {
      orderNumber: order.order_number,
      vendorName: extVendorName,
    }, { vertical: (order as any).vertical_id })

    // Clear buyer's cart (they've completed checkout)
    crumb.logic('Clearing buyer cart')
    const { data: orderData } = await supabase
      .from('orders')
      .select('buyer_user_id, vertical_id')
      .eq('id', orderId)
      .single()

    if (orderData) {
      // M10 FIX: Pass TEXT slug directly to get_or_create_cart (no UUID lookup needed)
      const { data: cartId } = await serviceClient.rpc('get_or_create_cart', {
        p_user_id: orderData.buyer_user_id,
        p_vertical_id: orderData.vertical_id
      })

      if (cartId) {
        await serviceClient
          .from('cart_items')
          .delete()
          .eq('cart_id', cartId)
      }
    }

    return NextResponse.json({
      success: true,
      order_id: orderId,
      status: 'paid',
      message: 'Payment confirmed. Order is now active.'
    })
  })
}
