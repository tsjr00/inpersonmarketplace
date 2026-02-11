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
          schedule_id,
          pickup_date,
          pickup_snapshot,
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

    // Market box subscriptions query (runs in parallel with orders)
    const marketBoxQuery = supabase
      .from('market_box_subscriptions')
      .select(`
        id,
        order_id,
        total_paid_cents,
        status,
        weeks_completed,
        term_weeks,
        extended_weeks,
        created_at,
        completed_at,
        cancelled_at,
        offering:market_box_offerings (
          id,
          name,
          image_urls,
          pickup_day_of_week,
          pickup_start_time,
          pickup_end_time,
          vendor:vendor_profiles (
            id,
            profile_data
          ),
          market:markets (
            id,
            name,
            market_type
          )
        ),
        pickups:market_box_pickups (
          id,
          week_number,
          scheduled_date,
          status,
          ready_at
        )
      `)
      .eq('buyer_user_id', user.id)
      .order('created_at', { ascending: false })

    // Run both queries in parallel (no added latency)
    const [ordersResult, marketBoxResult] = await Promise.all([query, marketBoxQuery])

    if (ordersResult.error) {
      throw traced.fromSupabase(ordersResult.error, {
        table: 'orders',
        operation: 'select',
        userId: user.id,
      })
    }
    if (marketBoxResult.error) {
      throw traced.fromSupabase(marketBoxResult.error, {
        table: 'market_box_subscriptions',
        operation: 'select',
        userId: user.id,
      })
    }

    const orders = ordersResult.data
    crumb.logic('Orders fetched', { orderCount: orders?.length || 0, marketBoxCount: marketBoxResult.data?.length || 0 })

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

        // Only consider non-cancelled items for order-level status
        const activeStatuses = effectiveStatuses.filter(s => s !== 'cancelled')

        if (activeStatuses.length === 0) {
          // All items cancelled
          effectiveStatus = 'cancelled'
        }
        // If ALL active items are fulfilled (buyer confirmed), order is fulfilled
        else if (activeStatuses.every(s => s === 'fulfilled')) {
          effectiveStatus = 'fulfilled'
        }
        // If ANY item is handed_off (vendor fulfilled, awaiting buyer), show handed_off
        else if (activeStatuses.some(s => s === 'handed_off')) {
          effectiveStatus = 'handed_off'
        }
        // If ANY item is ready, show ready (buyer needs to know for pickup)
        else if (activeStatuses.some(s => s === 'ready')) {
          effectiveStatus = 'ready'
        }
        // If ALL active items are confirmed, show confirmed
        // (must be every() — one vendor confirming shouldn't mark the whole order confirmed)
        else if (activeStatuses.every(s => s === 'confirmed')) {
          effectiveStatus = 'confirmed'
        }
        // Some items fulfilled (picked up), rest still in progress — use highest remaining status
        else if (activeStatuses.some(s => s === 'fulfilled')) {
          const remaining = activeStatuses.filter(s => s !== 'fulfilled')
          if (remaining.some(s => s === 'ready')) effectiveStatus = 'ready'
          else if (remaining.some(s => s === 'confirmed')) effectiveStatus = 'confirmed'
          else effectiveStatus = 'pending'
        }
        // Default: pending (some items still awaiting vendor action)
        else if (order.status === 'paid') {
          effectiveStatus = 'pending' // Will show "Order Placed"
        }
      }

      // Count metadata for partial readiness display
      const activeStatuses2 = items.length > 0
        ? items.map((i: Record<string, unknown>) => {
            const cancelled = i.cancelled_at as string | null
            if (cancelled) return 'cancelled'
            const buyerConfirmed = i.buyer_confirmed_at as string | null
            if (buyerConfirmed) return 'fulfilled'
            if ((i.status as string) === 'fulfilled') return 'handed_off'
            return i.status as string
          }).filter(s => s !== 'cancelled')
        : []
      const readyCount = activeStatuses2.filter(s => s === 'ready').length
      const fulfilledCount = activeStatuses2.filter(s => s === 'fulfilled').length
      const handedOffCount = activeStatuses2.filter(s => s === 'handed_off').length
      const totalActiveCount = activeStatuses2.length

      return {
        type: 'order' as const,
        id: order.id,
        order_number: order.order_number,
        status: effectiveStatus,
        payment_status: order.status, // Keep original for reference
        total_cents: order.total_cents,
        created_at: order.created_at,
        updated_at: order.updated_at,
        readyCount,
        fulfilledCount,
        handedOffCount,
        totalActiveCount,
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
        const pickupSnapshot = item.pickup_snapshot as Record<string, unknown> | null
        // Get pickup times from snapshot (where they're stored)
        const pickupStartTime = (pickupSnapshot?.start_time as string) || null
        const pickupEndTime = (pickupSnapshot?.end_time as string) || null

        // Use pickup_snapshot for display when available (immutable order details)
        // Fall back to market data for backwards compatibility with older orders
        const displayMarket = pickupSnapshot || (market ? {
          market_name: (market.name as string) || 'Unknown',
          market_type: (market.market_type as string) || 'traditional',
          address: market.address,
          city: market.city,
          state: market.state,
          zip: market.zip
        } : null)

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
          cancelled_at: cancelledAt,
          expires_at: expiresAt,
          is_expired: expiresAt && new Date(expiresAt) < new Date() && itemStatus === 'pending' && !cancelledAt,
          pickup_date: pickupDate,
          pickup_start_time: pickupStartTime,
          pickup_end_time: pickupEndTime,
          pickup_snapshot: pickupSnapshot,
          market: market ? {
            id: market.id,
            name: (market.name as string) || 'Unknown',
            type: (market.market_type as string) || 'traditional',
            address: market.address,
            city: market.city,
            state: market.state,
            zip: market.zip
          } : null,
          // Unified display data (prefers pickup_snapshot when available)
          display: displayMarket ? {
            market_name: (displayMarket.market_name as string) || 'Unknown',
            pickup_date: pickupDate,
            start_time: (pickupSnapshot?.start_time as string) || pickupStartTime,
            end_time: (pickupSnapshot?.end_time as string) || pickupEndTime,
            address: displayMarket.address as string | null,
            city: displayMarket.city as string | null,
            state: displayMarket.state as string | null
          } : null
        }
      })
    }
  })

    // Collect order IDs linked to market box subscriptions — used to avoid duplicate entries
    const marketBoxOrderIds = new Set(
      (marketBoxResult.data || [])
        .map(sub => sub.order_id as string | null)
        .filter(Boolean)
    )

    // Transform market box subscriptions into unified order shape
    const marketBoxOrders = (marketBoxResult.data || []).map(sub => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offering = sub.offering as any
      const vendor = offering?.vendor
      const profileData = vendor?.profile_data as Record<string, unknown> | null
      const vendorName =
        (profileData?.business_name as string) ||
        (profileData?.farm_name as string) ||
        'Vendor'
      const market = offering?.market

      // Sort pickups by week number
      const pickups = ((sub.pickups as Array<Record<string, unknown>>) || [])
        .sort((a, b) => (a.week_number as number) - (b.week_number as number))

      // Determine pickup-based status
      const hasReadyPickup = pickups.some(p => p.status === 'ready')
      const today = new Date().toISOString().split('T')[0]
      const nextPickup = pickups.find(p =>
        (p.scheduled_date as string) >= today &&
        ['scheduled', 'ready'].includes(p.status as string)
      )

      let mbEffectiveStatus: string
      if (sub.status === 'cancelled') {
        mbEffectiveStatus = 'cancelled'
      } else if (sub.status === 'completed') {
        mbEffectiveStatus = 'fulfilled'
      } else if (hasReadyPickup) {
        mbEffectiveStatus = 'ready'
      } else {
        // Active subscription with no ready pickups — show as "Order Placed"
        // Transitions to 'ready' when vendor marks a pickup as ready
        mbEffectiveStatus = 'pending'
      }

      const termWeeks = (sub.term_weeks as number) || 4
      const extendedWeeks = (sub.extended_weeks as number) || 0
      const totalWeeks = termWeeks + extendedWeeks

      // Use linked order's total_cents (includes platform fees) if available
      const linkedOrder = sub.order_id
        ? (orders || []).find(o => o.id === sub.order_id)
        : null
      const orderNumber = linkedOrder
        ? linkedOrder.order_number
        : 'MB-' + sub.id.slice(0, 6).toUpperCase()
      const displayTotal = linkedOrder
        ? linkedOrder.total_cents
        : sub.total_paid_cents

      // Add market to filter dropdown map
      if (market?.id) {
        marketsMap.set(market.id as string, {
          id: market.id as string,
          name: (market.name as string) || 'Unknown',
          type: (market.market_type as string) || 'traditional',
        })
      }

      return {
        type: 'market_box' as const,
        id: sub.id,
        order_number: orderNumber,
        status: mbEffectiveStatus,
        payment_status: sub.status,
        total_cents: displayTotal,
        created_at: sub.created_at,
        updated_at: sub.created_at,
        market_box: {
          offering_name: (offering?.name as string) || 'Market Box',
          offering_image: ((offering?.image_urls as string[]) || [])[0] || null,
          vendor_name: vendorName,
          vendor_id: (vendor?.id as string) || null,
          market: market ? {
            id: market.id as string,
            name: (market.name as string) || 'Unknown',
            type: (market.market_type as string) || 'traditional',
          } : null,
          weeks_completed: (sub.weeks_completed as number) || 0,
          total_weeks: totalWeeks,
          term_weeks: termWeeks,
          extended_weeks: extendedWeeks,
          next_pickup: nextPickup ? {
            date: nextPickup.scheduled_date as string,
            status: nextPickup.status as string,
            week_number: nextPickup.week_number as number,
          } : null,
          has_ready_pickup: hasReadyPickup,
          pickup_day_of_week: (offering?.pickup_day_of_week as number) ?? null,
          pickup_start_time: (offering?.pickup_start_time as string) || null,
          pickup_end_time: (offering?.pickup_end_time as string) || null,
        },
        items: [] as typeof transformedOrders[number]['items'],
      }
    })

    // Apply status filter to market box orders (regular orders already filtered at DB level)
    const filteredMarketBoxOrders = status
      ? marketBoxOrders.filter(o => o.status === status)
      : marketBoxOrders

    // Exclude orders that are purely market-box orders (no listing items, linked to a subscription)
    // These show up as market_box entries instead — avoids duplicate display
    const regularOrders = transformedOrders.filter(o =>
      o.items.length > 0 || !marketBoxOrderIds.has(o.id)
    )

    // Merge both order types into unified list, sorted by date descending
    const allOrders = [...regularOrders, ...filteredMarketBoxOrders]
    allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Filter by market if specified
    const filteredOrders = marketId
      ? allOrders.filter(order =>
          order.type === 'market_box'
            ? order.market_box?.market?.id === marketId
            : order.items.some(item => item.market?.id === marketId)
        )
      : allOrders

    // Get unique markets for the filter dropdown
    const markets = Array.from(marketsMap.values()).sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ orders: filteredOrders, markets })
  })
}
