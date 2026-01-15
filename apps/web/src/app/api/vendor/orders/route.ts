import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

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
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  // Get query parameters
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const marketId = searchParams.get('market_id')

  // Get order items for this vendor with related data
  let query = supabase
    .from('order_items')
    .select(`
      id,
      order_id,
      quantity,
      unit_price_cents,
      subtotal_cents,
      status,
      market_id,
      pickup_date,
      created_at,
      listing:listings(
        id,
        title,
        image_urls
      ),
      order:orders(
        id,
        order_number,
        status,
        total_amount_cents,
        created_at,
        buyer_user_id,
        buyer:user_profiles!orders_buyer_user_id_fkey(
          display_name
        )
      ),
      market:markets(
        id,
        name,
        market_type,
        address,
        city,
        state
      )
    `)
    .eq('vendor_profile_id', vendorProfile.id)
    .order('created_at', { ascending: false })

  // Apply filters
  if (status) {
    query = query.eq('status', status)
  }
  if (marketId) {
    query = query.eq('market_id', marketId)
  }

  const { data: orderItems, error } = await query

  if (error) {
    console.error('[/api/vendor/orders] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Transform to a more usable format - group by order
  const ordersMap = new Map()

  orderItems?.forEach((item: any) => {
    const orderId = item.order_id
    const order = item.order

    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, {
        id: orderId,
        order_number: order?.order_number || orderId.slice(0, 8),
        order_status: order?.status || 'pending',
        customer_name: order?.buyer?.display_name || 'Customer',
        total_cents: order?.total_amount_cents || 0,
        created_at: order?.created_at || item.created_at,
        items: []
      })
    }

    ordersMap.get(orderId).items.push({
      id: item.id,
      listing_id: item.listing?.id,
      listing_title: item.listing?.title || 'Unknown',
      listing_image: item.listing?.image_urls?.[0] || null,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      subtotal_cents: item.subtotal_cents,
      status: item.status || 'pending',
      market_id: item.market_id,
      market_name: item.market?.name || 'Pickup Location',
      market_type: item.market?.market_type || 'traditional',
      market_address: item.market?.address,
      market_city: item.market?.city,
      pickup_date: item.pickup_date
    })
  })

  const orders = Array.from(ordersMap.values())

  // Also return raw items for per-item management
  return NextResponse.json({
    orders,
    orderItems: orderItems || []
  })
}
