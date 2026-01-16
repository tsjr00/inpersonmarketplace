import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('[/api/buyer/orders] Auth error:', authError)
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }

    if (!user) {
      console.error('[/api/buyer/orders] No user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const marketId = searchParams.get('market')

    console.log('[/api/buyer/orders] Fetching orders for user:', user.id, 'status:', status, 'market:', marketId)

    // Get buyer's orders with items
    let query = supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        total_cents,
        created_at,
        updated_at,
        order_items(
          id,
          quantity,
          unit_price_cents,
          subtotal_cents,
          status,
          listing:listings(
            id,
            title,
            image_urls,
            vendor_profile_id,
            vendor_profiles(
              id,
              profile_data
            ),
            listing_markets(
              markets(
                id,
                name,
                market_type,
                address,
                city,
                state,
                zip
              )
            )
          )
        )
      `)
      .eq('buyer_user_id', user.id)
      .order('created_at', { ascending: false })

    // Apply status filter
    if (status) {
      query = query.eq('status', status)
    }

    const { data: orders, error } = await query

    if (error) {
      console.error('[/api/buyer/orders] Database error:', JSON.stringify(error, null, 2))
      return NextResponse.json(
        { error: 'Failed to fetch orders', details: error.message },
        { status: 500 }
      )
    }

    console.log('[/api/buyer/orders] Found orders:', orders?.length || 0)

    // Collect unique markets from all orders for the filter dropdown
    const marketsMap = new Map<string, { id: string; name: string; type: string }>()

    // Transform data to match frontend expected format
    const transformedOrders = (orders || []).map(order => ({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      total_cents: order.total_cents,
      created_at: order.created_at,
      updated_at: order.updated_at,
      items: (order.order_items || []).map((item: Record<string, unknown>) => {
        const listing = item.listing as Record<string, unknown> | null
        const vendorProfiles = listing?.vendor_profiles as Record<string, unknown> | null
        const profileData = vendorProfiles?.profile_data as Record<string, unknown> | null
        const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'

        // Get market from listing_markets (first one)
        const listingMarkets = listing?.listing_markets as Array<{ markets: Record<string, unknown> }> | null
        const market = listingMarkets?.[0]?.markets || null

        // Add market to map for filter dropdown
        if (market && market.id) {
          marketsMap.set(market.id as string, {
            id: market.id as string,
            name: (market.name as string) || 'Unknown',
            type: (market.market_type as string) || 'traditional'
          })
        }

        return {
          id: item.id,
          listing_id: listing?.id,
          listing_title: (listing?.title as string) || 'Unknown Item',
          listing_image: (listing?.image_urls as string[])?.[0] || null,
          vendor_name: vendorName,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
          subtotal_cents: item.subtotal_cents,
          status: item.status || order.status,
          market: market ? {
            id: market.id,
            name: (market.name as string) || 'Unknown',
            type: (market.market_type as string) || 'traditional',
            address: market.address,
            city: market.city,
            state: market.state,
            zip: market.zip
          } : null
        }
      })
    }))

    // Filter by market if specified
    const filteredOrders = marketId
      ? transformedOrders.filter(order =>
          order.items.some(item => item.market?.id === marketId)
        )
      : transformedOrders

    // Get unique markets for the filter dropdown
    const markets = Array.from(marketsMap.values()).sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ orders: filteredOrders, markets })

  } catch (error) {
    console.error('[/api/buyer/orders] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
