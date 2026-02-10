import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit order confirmation requests
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`vendor-confirm:${clientIp}`, { limit: 30, windowSeconds: 60 })

  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult)
  }

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

  // Require Stripe setup before vendors can confirm orders
  // This prevents creating buyer expectations when payment processing isn't ready
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd && !vendorProfile.stripe_account_id) {
    return NextResponse.json({
      error: 'Please complete your Stripe setup before confirming orders. Go to Dashboard > Payment Methods to connect your account.',
      code: 'STRIPE_NOT_CONNECTED'
    }, { status: 400 })
  }

  // Verify vendor owns this order item and get buyer/order info for notification
  const { data: orderItem } = await supabase
    .from('order_items')
    .select(`
      id,
      order:orders!inner(id, order_number, buyer_user_id),
      listing:listings(title, vendor_profiles(profile_data))
    `)
    .eq('id', orderItemId)
    .eq('vendor_profile_id', vendorProfile.id)
    .single()

  if (!orderItem) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
  }

  // Update status
  const { error } = await supabase
    .from('order_items')
    .update({ status: 'confirmed' })
    .eq('id', orderItemId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Increment vendor's confirmed order count (atomic, non-blocking)
  await supabase.rpc('increment_vendor_confirmed' as any, {
    p_vendor_id: vendorProfile.id,
  })

  // Notify buyer that vendor confirmed their order
  const orderData = (orderItem as any).order as any
  const listing = (orderItem as any).listing as any
  const vendorName = listing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
  await sendNotification(orderData.buyer_user_id, 'order_confirmed', {
    orderNumber: orderData.order_number,
    vendorName,
    itemTitle: listing?.title,
  })

  return NextResponse.json({ success: true })
}
