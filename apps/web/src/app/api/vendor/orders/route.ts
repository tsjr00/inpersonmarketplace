import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const supabaseService = createServiceClient() // Bypass RLS for order data

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
  const dateRange = searchParams.get('date_range') // 'today', 'week', 'month', '30days', 'all'

  // Calculate date filter based on range
  let dateFilter: Date | null = null
  const now = new Date()
  switch (dateRange) {
    case 'today':
      dateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      break
    case 'week':
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      dateFilter = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case '30days':
    case null:
    case '':
      // Default to last 30 days for performance
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    case 'all':
      dateFilter = null // No date filter
      break
  }

  // Get order items for this vendor with related data
  // Note: Orders are fetched separately using service client to bypass RLS
  // (vendors don't have direct RLS access to orders table)
  let query = supabase
    .from('order_items')
    .select(`
      id,
      order_id,
      quantity,
      unit_price_cents,
      subtotal_cents,
      platform_fee_cents,
      vendor_payout_cents,
      status,
      market_id,
      schedule_id,
      pickup_date,
      pickup_snapshot,
      pickup_start_time,
      pickup_end_time,
      pickup_confirmed_at,
      buyer_confirmed_at,
      vendor_confirmed_at,
      issue_reported_at,
      issue_reported_by,
      issue_description,
      cancelled_at,
      cancelled_by,
      cancellation_reason,
      expires_at,
      created_at,
      listing:listings(
        id,
        title,
        image_urls
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
  if (dateFilter) {
    query = query.gte('created_at', dateFilter.toISOString())
  }

  const { data: orderItems, error } = await query

  if (error) {
    console.error('[/api/vendor/orders] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get unique order IDs to fetch order data separately (bypasses RLS)
  const orderIds = [...new Set(orderItems?.map((item: any) => item.order_id).filter(Boolean) || [])]

  // Fetch order data using service client (vendors can't access orders table via RLS)
  const ordersData: Record<string, any> = {}
  if (orderIds.length > 0) {
    const { data: orders } = await supabaseService
      .from('orders')
      .select('id, order_number, status, total_cents, created_at, buyer_user_id')
      .in('id', orderIds)

    orders?.forEach((o: any) => {
      ordersData[o.id] = o
    })
  }

  // Get unique buyer IDs to fetch display names
  const buyerIds = [...new Set(
    Object.values(ordersData).map((o: any) => o.buyer_user_id).filter(Boolean)
  )]

  // Fetch buyer display names from user_profiles (use service client to bypass RLS)
  const buyerNames: Record<string, string> = {}
  if (buyerIds.length > 0) {
    const { data: profiles } = await supabaseService
      .from('user_profiles')
      .select('user_id, display_name')
      .in('user_id', buyerIds)

    profiles?.forEach((p: any) => {
      buyerNames[p.user_id] = p.display_name || 'Customer'
    })
  }

  // Transform to a more usable format - group by order
  const ordersMap = new Map()

  orderItems?.forEach((item: any) => {
    const orderId = item.order_id
    const order = ordersData[orderId] // Use separately fetched order data
    const buyerId = order?.buyer_user_id

    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, {
        id: orderId,
        order_number: order?.order_number || orderId.slice(0, 8),
        order_status: order?.status || 'pending',
        customer_name: buyerNames[buyerId] || 'Customer',
        total_cents: order?.total_cents || 0,
        created_at: order?.created_at || item.created_at,
        items: []
      })
    }

    const pickupSnapshot = item.pickup_snapshot as Record<string, unknown> | null

    // Use pickup_snapshot for display when available (immutable order details)
    const displayMarket = pickupSnapshot || {
      market_name: item.market?.name || 'Pickup Location',
      market_type: item.market?.market_type || 'traditional',
      address: item.market?.address,
      city: item.market?.city,
      state: item.market?.state
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
      pickup_date: item.pickup_date,
      pickup_start_time: item.pickup_start_time,
      pickup_end_time: item.pickup_end_time,
      pickup_snapshot: pickupSnapshot,
      // Unified display data (prefers pickup_snapshot when available)
      display: {
        market_name: (displayMarket.market_name as string) || 'Pickup Location',
        pickup_date: item.pickup_date,
        start_time: (pickupSnapshot?.start_time as string) || item.pickup_start_time,
        end_time: (pickupSnapshot?.end_time as string) || item.pickup_end_time,
        address: displayMarket.address as string | null,
        city: displayMarket.city as string | null,
        state: displayMarket.state as string | null
      },
      pickup_confirmed_at: item.pickup_confirmed_at,
      buyer_confirmed_at: item.buyer_confirmed_at,
      vendor_confirmed_at: item.vendor_confirmed_at,
      issue_reported_at: item.issue_reported_at,
      issue_reported_by: item.issue_reported_by,
      issue_description: item.issue_description,
      cancelled_at: item.cancelled_at,
      cancelled_by: item.cancelled_by,
      cancellation_reason: item.cancellation_reason,
      expires_at: item.expires_at,
      is_expired: item.expires_at && new Date(item.expires_at) < new Date() && item.status === 'pending' && !item.cancelled_at
    })
  })

  const orders = Array.from(ordersMap.values())

  // Add order data and customer name to raw items for per-item management views
  const enrichedItems = (orderItems || []).map((item: any) => {
    const order = ordersData[item.order_id]
    const buyerId = order?.buyer_user_id
    return {
      ...item,
      order: order || null,
      customer_name: buyerNames[buyerId] || 'Customer'
    }
  })

  return NextResponse.json({
    orders,
    orderItems: enrichedItems
  })
}
