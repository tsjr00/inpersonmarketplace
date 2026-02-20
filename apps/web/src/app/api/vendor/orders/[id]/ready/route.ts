import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/orders/[id]/ready', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-order-ready:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: orderItemId } = await params

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile with Stripe account status
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, stripe_account_id')
      .eq('user_id', user.id)
      .single()

    if (!vendorProfile) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Require Stripe setup before vendors can mark orders as ready
    const isProd = process.env.NODE_ENV === 'production'
    if (isProd && !vendorProfile.stripe_account_id) {
      return NextResponse.json({
        error: 'Please complete your Stripe setup before processing orders. Go to Dashboard > Payment Methods to connect your account.',
        code: 'STRIPE_NOT_CONNECTED'
      }, { status: 400 })
    }

    // Verify vendor owns this order item and get buyer/order info for notification
    const { data: orderItem } = await supabase
      .from('order_items')
      .select(`
        id,
        status,
        order:orders!inner(id, order_number, buyer_user_id, vertical_id),
        listing:listings(title, vendor_profiles(profile_data)),
        market:markets!market_id(name)
      `)
      .eq('id', orderItemId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (!orderItem) {
      return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
    }

    // F4 FIX: Validate current status — only pending/confirmed items can be marked ready
    const currentStatus = (orderItem as any).status
    if (currentStatus && !['pending', 'confirmed'].includes(currentStatus)) {
      return NextResponse.json({
        error: `Cannot mark as ready — item is currently "${currentStatus}".`,
        code: 'INVALID_STATUS_TRANSITION'
      }, { status: 400 })
    }

    // Update status
    const { error } = await supabase
      .from('order_items')
      .update({ status: 'ready' })
      .eq('id', orderItemId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Notify buyer that their order is ready for pickup (IMMEDIATE urgency)
    const orderData = (orderItem as any).order as any
    const listing = (orderItem as any).listing as any
    const vendorName = listing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
    await sendNotification(orderData.buyer_user_id, 'order_ready', {
      orderNumber: orderData.order_number,
      vendorName,
      itemTitle: listing?.title,
      marketName: ((orderItem as any).market as any)?.name,
    }, { vertical: orderData.vertical_id })

    return NextResponse.json({ success: true })
  })
}
