import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: orderId } = await context.params
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch order
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount_cents,
      created_at,
      updated_at,
      order_items (
        id,
        quantity,
        unit_price_cents,
        subtotal_cents,
        status,
        market_id,
        pickup_date,
        buyer_confirmed_at,
        pickup_confirmed_at,
        cancelled_at,
        cancelled_by,
        cancellation_reason,
        refund_amount_cents,
        expires_at,
        listing:listings (
          id,
          title,
          description,
          image_urls,
          vendor_profiles (
            id,
            profile_data
          )
        ),
        market:markets (
          id,
          name,
          market_type,
          address,
          city,
          state,
          zip,
          contact_email,
          contact_phone,
          market_schedules (
            day_of_week,
            start_time,
            end_time
          )
        )
      )
    `)
    .eq('id', orderId)
    .eq('buyer_user_id', user.id) // Only buyer's orders
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Transform order
  const transformedOrder = {
    id: order.id,
    order_number: order.order_number,
    status: order.status,
    total_cents: order.total_amount_cents,
    created_at: order.created_at,
    updated_at: order.updated_at,
    items: (order.order_items || []).map((item: any) => {
      const listing = item.listing
      const vendorProfile = listing?.vendor_profiles
      const profileData = vendorProfile?.profile_data as Record<string, unknown> | null
      const market = item.market

      return {
        id: item.id,
        listing_id: listing?.id,
        listing_title: listing?.title || 'Unknown',
        listing_description: listing?.description || '',
        listing_image: listing?.image_urls?.[0] || null,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
        subtotal_cents: item.subtotal_cents,
        status: item.status,
        vendor_name:
          (profileData?.business_name as string) ||
          (profileData?.farm_name as string) ||
          'Vendor',
        vendor_email: (profileData?.email as string) || null,
        vendor_phone: (profileData?.phone as string) || null,
        market: {
          id: market?.id,
          name: market?.name || 'Unknown',
          type: market?.market_type || 'traditional',
          address: market?.address,
          city: market?.city,
          state: market?.state,
          zip: market?.zip,
          contact_email: market?.contact_email,
          contact_phone: market?.contact_phone,
          schedules: market?.market_schedules || []
        },
        pickup_date: item.pickup_date,
        buyer_confirmed_at: item.buyer_confirmed_at,
        vendor_confirmed_at: item.pickup_confirmed_at,
        cancelled_at: item.cancelled_at,
        cancelled_by: item.cancelled_by,
        cancellation_reason: item.cancellation_reason,
        refund_amount_cents: item.refund_amount_cents,
        expires_at: item.expires_at,
        is_expired: item.expires_at && new Date(item.expires_at) < new Date() && item.status === 'pending' && !item.cancelled_at
      }
    })
  }

  return NextResponse.json({ order: transformedOrder })
}
