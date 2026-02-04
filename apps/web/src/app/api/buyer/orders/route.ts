import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/buyer/orders', 'GET', async () => {
    const supabase = await createClient()

    // Check auth
    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      throw traced.auth('ERR_AUTH_001', 'Authentication failed', {
        originalError: authError,
      })
    }

    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    crumb.auth('User authenticated', user.id)

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const marketId = searchParams.get('market')

    crumb.logic('Fetching orders', { userId: user.id, status, marketId })

    // Get buyer's orders with items
    // Use explicit relationship hint for market_id FK on order_items
    crumb.supabase('select', 'orders', { userId: user.id })
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
          expires_at,
          cancelled_at,
          buyer_confirmed_at,
          pickup_date,
          pickup_start_time,
          pickup_end_time,
          market_id,
          markets!market_id(
            id,
            name,
            market_type,
            address,
            city,
            state,
            zip
          ),
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
      throw traced.fromSupabase(error, {
        table: 'orders',
        operation: 'select',
        userId: user.id,
      })
    }

    crumb.logic('Orders fetched', { count: orders?.length || 0 })

    // Collect unique markets from all orders for the filter dropdown
    const marketsMap = new Map<string, { id: string; name: string; type: string }>()

    // Transform data to match frontend expected format
    const transformedOrders = (orders || []).map(order => {
      // Compute effective order status from item statuses
      // Handles three fulfillment scenarios:
      // 1. Buyer confirmed receipt → 'fulfilled'
      // 2. Vendor fulfilled but buyer hasn't confirmed → 'handed_off'
      // 3. Neither → use item.status as-is
      const items = order.order_items || []
      let effectiveStatus = order.status // Default to payment status

      if (order.status === 'cancelled') {
        effectiveStatus = 'cancelled'
      } else if (items.length > 0) {
        // Compute effective status per item
        const effectiveStatuses = items.map((i: Record<string, unknown>) => {
          const buyerConfirmed = i.buyer_confirmed_at as string | null
          const cancelled = i.cancelled_at as string | null
          const itemStatus = i.status as string
          if (cancelled) return 'cancelled'
          // Buyer confirmed = fully fulfilled
          if (buyerConfirmed) return 'fulfilled'
          // Vendor fulfilled but buyer hasn't confirmed = handed_off
          if (itemStatus === 'fulfilled') return 'handed_off'
          return itemStatus
        })

        // If ALL items are fulfilled (buyer confirmed), order is fulfilled
        if (effectiveStatuses.every(s => s === 'fulfilled')) {
          effectiveStatus = 'fulfilled'
        }
        // If ANY item is handed_off (vendor fulfilled, awaiting buyer), show handed_off
        else if (effectiveStatuses.some(s => s === 'handed_off')) {
          effectiveStatus = 'handed_off'
        }
        // If ANY item is ready (and none cancelled), show ready
        else if (effectiveStatuses.some(s => s === 'ready') && !effectiveStatuses.some(s => s === 'cancelled')) {
          effectiveStatus = 'ready'
        }
        // If ANY item is confirmed (and none cancelled/ready), show confirmed
        else if (effectiveStatuses.some(s => s === 'confirmed') && !effectiveStatuses.some(s => ['cancelled', 'ready'].includes(s))) {
          effectiveStatus = 'confirmed'
        }
        // If all items pending and order is paid, show pending (awaiting vendor confirmation)
        else if (effectiveStatuses.every(s => s === 'pending') && order.status === 'paid') {
          effectiveStatus = 'pending' // Will show "Order Placed"
        }
      }

      return {
        id: order.id,
        order_number: order.order_number,
        status: effectiveStatus,
        payment_status: order.status, // Keep original for reference
        total_cents: order.total_cents,
        created_at: order.created_at,
        updated_at: order.updated_at,
        items: items.map((item: Record<string, unknown>) => {
        const listing = item.listing as Record<string, unknown> | null
        const vendorProfiles = listing?.vendor_profiles as Record<string, unknown> | null
        const profileData = vendorProfiles?.profile_data as Record<string, unknown> | null
        const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'

        // Get market from order_item.market_id (preferred) or fall back to listing_markets (first one)
        const orderItemMarket = item.markets as Record<string, unknown> | null
        const listingMarkets = listing?.listing_markets as Array<{ markets: Record<string, unknown> }> | null
        const market = orderItemMarket || listingMarkets?.[0]?.markets || null

        // Add market to map for filter dropdown
        if (market && market.id) {
          marketsMap.set(market.id as string, {
            id: market.id as string,
            name: (market.name as string) || 'Unknown',
            type: (market.market_type as string) || 'traditional'
          })
        }

        const itemStatus = (item.status as string) || (order.status as string)
        const expiresAt = item.expires_at as string | null
        const cancelledAt = item.cancelled_at as string | null
        const pickupDate = item.pickup_date as string | null
        const pickupStartTime = item.pickup_start_time as string | null
        const pickupEndTime = item.pickup_end_time as string | null

        return {
          id: item.id,
          listing_id: listing?.id,
          listing_title: (listing?.title as string) || 'Unknown Item',
          listing_image: (listing?.image_urls as string[])?.[0] || null,
          vendor_name: vendorName,
          quantity: item.quantity,
          unit_price_cents: item.unit_price_cents,
          subtotal_cents: item.subtotal_cents,
          status: itemStatus,
          expires_at: expiresAt,
          is_expired: expiresAt && new Date(expiresAt) < new Date() && itemStatus === 'pending' && !cancelledAt,
          pickup_date: pickupDate,
          pickup_start_time: pickupStartTime,
          pickup_end_time: pickupEndTime,
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
    }
  })

    // Filter by market if specified
    const filteredOrders = marketId
      ? transformedOrders.filter(order =>
          order.items.some(item => item.market?.id === marketId)
        )
      : transformedOrders

    // Get unique markets for the filter dropdown
    const markets = Array.from(marketsMap.values()).sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ orders: filteredOrders, markets })
  })
}
