import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/vendor/orders/[id]/reject - Vendor rejects/cancels an order item
// Vendor can reject at any time before fulfillment (pending, paid, confirmed, ready)
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/orders/[id]/reject', 'POST', async () => {
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
        subtotal_cents,
        cancelled_at,
        vendor_profile_id,
        order_id,
        order:orders!inner(id, order_number, buyer_user_id),
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

    // Update the order item as cancelled by vendor
    const { error: updateError } = await supabase
      .from('order_items')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'vendor',
        cancellation_reason: reason,
        refund_amount_cents: orderItem.subtotal_cents // Full refund when vendor cancels
      })
      .eq('id', orderItemId)

    if (updateError) {
      console.error('Error rejecting order item:', updateError)
      return NextResponse.json({ error: 'Failed to reject item' }, { status: 500 })
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

    // Notify buyer that vendor cancelled their order (URGENT — SMS + in-app)
    const rejectOrderData = (orderItem as any).order as any
    const rejectListing = (orderItem as any).listing as any
    const rejectVendorName = rejectListing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
    await sendNotification(rejectOrderData.buyer_user_id, 'order_cancelled_by_vendor', {
      orderNumber: rejectOrderData.order_number,
      vendorName: rejectVendorName,
      itemTitle: rejectListing?.title,
      reason,
    })

    return NextResponse.json({
      success: true,
      message: 'Item rejected successfully',
      cancelled_at: new Date().toISOString(),
      refund_amount_cents: orderItem.subtotal_cents,
      reason: reason
    })
  })
}
