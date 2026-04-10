import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderItemId } = await params
  return withErrorTracing(`/api/vendor/orders/${orderItemId}/confirm`, 'POST', async () => {
  // Rate limit order confirmation requests
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`vendor-confirm:${clientIp}`, { limit: 30, windowSeconds: 60 })

  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult)
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Require Stripe setup before vendors can confirm orders (skip for external payment orders)
  const isProd = process.env.NODE_ENV === 'production'

  // Fetch order item first — the joined order row provides vertical_id for multi-vertical vendor lookup
  const { data: orderItem } = await supabase
    .from('order_items')
    .select(`
      id,
      status,
      vendor_profile_id,
      order:orders!inner(id, order_number, buyer_user_id, vertical_id, payment_method),
      listing:listings(title, vendor_profiles(profile_data))
    `)
    .eq('id', orderItemId)
    .single()

  if (!orderItem) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
  }

  const orderData = (orderItem as any).order as any

  // Get vendor profile scoped to this order's vertical
  const { profile: vendorProfile } = await getVendorProfileForVertical<{
    id: string
    stripe_account_id: string | null
  }>(supabase, user.id, orderData.vertical_id, 'id, stripe_account_id')

  if (!vendorProfile) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  // Verify order item belongs to this vendor
  if (orderItem.vendor_profile_id !== vendorProfile.id) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
  }

  // Skip Stripe requirement for external payment orders
  const isExternalPayment = orderData?.payment_method && orderData.payment_method !== 'stripe'
  if (isProd && !isExternalPayment && !vendorProfile.stripe_account_id) {
    return NextResponse.json({
      error: 'Please complete your Stripe setup before confirming orders. Go to Dashboard > Payment Methods to connect your account.',
      code: 'STRIPE_NOT_CONNECTED'
    }, { status: 400 })
  }

  // Validate current status — only pending items can be confirmed
  if (orderItem.status !== 'pending') {
    return NextResponse.json({
      error: `Cannot confirm item with status "${orderItem.status}". Only pending items can be confirmed.`
    }, { status: 409 })
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
  const listing = (orderItem as any).listing as any
  const vendorName = listing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
  await sendNotification(orderData.buyer_user_id, 'order_confirmed', {
    orderNumber: orderData.order_number,
    orderId: orderData.id,
    vendorName,
    itemTitle: listing?.title,
  }, { vertical: orderData.vertical_id })

  return NextResponse.json({ success: true })
  })
}
