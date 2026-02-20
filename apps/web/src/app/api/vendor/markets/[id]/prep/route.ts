import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/markets/[id]/prep', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-market-prep:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const supabaseService = createServiceClient() // Bypass RLS for order data
    const { id: marketId } = await context.params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile (user may have profiles in multiple verticals)
    const { data: vendorProfiles } = await supabase
      .from('vendor_profiles')
      .select('id, vertical_id')
      .eq('user_id', user.id)

    if (!vendorProfiles || vendorProfiles.length === 0) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // We'll use the first vendor profile for now, or match by market's vertical
    const vendorProfileIds = vendorProfiles.map(vp => vp.id)

    // Get market info
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select(`
        id,
        name,
        market_type,
        address,
        city,
        state,
        market_schedules (
          day_of_week,
          start_time,
          end_time,
          active
        )
      `)
      .eq('id', marketId)
      .single()

    if (marketError || !market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    // Calculate next pickup date based on market schedules
    const now = new Date()
    const activeSchedules = (market.market_schedules || []).filter((s: any) => s.active !== false)

    let nextPickupDate: Date | null = null
    let nextSchedule: any = null

    for (const schedule of activeSchedules) {
      const dayOfWeek = schedule.day_of_week
      let daysUntil = dayOfWeek - now.getDay()
      if (daysUntil < 0) daysUntil += 7
      if (daysUntil === 0) {
        // Check if we've passed today's time
        const [hours, minutes] = schedule.start_time.split(':').map(Number)
        const todaySchedule = new Date(now)
        todaySchedule.setHours(hours, minutes, 0, 0)
        if (now >= todaySchedule) {
          daysUntil = 7
        }
      }

      const nextOccurrence = new Date(now)
      nextOccurrence.setDate(now.getDate() + daysUntil)
      const [hours, minutes] = schedule.start_time.split(':').map(Number)
      nextOccurrence.setHours(hours, minutes, 0, 0)

      if (!nextPickupDate || nextOccurrence < nextPickupDate) {
        nextPickupDate = nextOccurrence
        nextSchedule = schedule
      }
    }

    // Get order items for this vendor at this market
    // Filter to items that are pending, confirmed, or ready (not yet fulfilled/cancelled)
    // Also exclude items where buyer has already confirmed pickup
    // Note: Orders fetched separately using service client (vendors don't have RLS access)
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select(`
        id,
        order_id,
        quantity,
        unit_price_cents,
        subtotal_cents,
        status,
        pickup_date,
        preferred_pickup_time,
        buyer_confirmed_at,
        created_at,
        listing:listings(
          id,
          title,
          image_urls
        )
      `)
      .in('vendor_profile_id', vendorProfileIds)
      .eq('market_id', marketId)
      .in('status', ['pending', 'confirmed', 'ready'])
      .is('cancelled_at', null)
      .is('buyer_confirmed_at', null)  // Exclude items buyer already picked up
      .order('created_at', { ascending: true })

    // Fetch order data separately using service client (bypasses RLS)
    const orderIds = [...new Set((orderItems || []).map((item: any) => item.order_id).filter(Boolean))]
    const ordersData: Record<string, any> = {}
    if (orderIds.length > 0) {
      const { data: orders } = await supabaseService
        .from('orders')
        .select('id, order_number, status, created_at, buyer_user_id')
        .in('id', orderIds)

      orders?.forEach((o: any) => {
        ordersData[o.id] = o
      })
    }

    // Fetch buyer info separately
    const buyerUserIds = [...new Set(Object.values(ordersData).map((o: any) => o.buyer_user_id).filter(Boolean))]
    const buyerMap: Record<string, { display_name: string; phone: string | null }> = {}

    if (buyerUserIds.length > 0) {
      const { data: buyers } = await supabaseService
        .from('user_profiles')
        .select('user_id, display_name, phone')
        .in('user_id', buyerUserIds)

      if (buyers) {
        buyers.forEach((b: any) => {
          buyerMap[b.user_id] = { display_name: b.display_name || 'Customer', phone: b.phone }
        })
      }
    }

    if (itemsError) {
      console.error('[/api/vendor/markets/[id]/prep] Error:', itemsError)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    // Group by order for order list view
    const ordersMap = new Map()
    orderItems?.forEach((item: any) => {
      const orderId = item.order_id
      const order = ordersData[orderId] // Use separately fetched order data
      const buyer = order?.buyer_user_id ? buyerMap[order.buyer_user_id] : null

      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          id: orderId,
          order_number: order?.order_number || orderId.slice(0, 8),
          customer_name: buyer?.display_name || 'Customer',
          customer_phone: buyer?.phone || null,
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
        pickup_date: item.pickup_date,
        preferred_pickup_time: item.preferred_pickup_time || null
      })
    })

    const orders = Array.from(ordersMap.values())

    // Aggregate quantities by product for prep sheet
    const productTotals = new Map<string, {
      listing_id: string
      title: string
      image: string | null
      total_quantity: number
      order_count: number
    }>()

    orderItems?.forEach((item: any) => {
      const listingId = item.listing?.id
      if (!listingId) return

      if (!productTotals.has(listingId)) {
        productTotals.set(listingId, {
          listing_id: listingId,
          title: item.listing?.title || 'Unknown',
          image: item.listing?.image_urls?.[0] || null,
          total_quantity: 0,
          order_count: 0
        })
      }

      const product = productTotals.get(listingId)!
      product.total_quantity += item.quantity
      product.order_count += 1
    })

    const prepSheet = Array.from(productTotals.values())
      .sort((a, b) => b.total_quantity - a.total_quantity)

    // Summary stats
    const totalOrders = orders.length
    const totalItems = orderItems?.length || 0
    const totalQuantity = orderItems?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0
    const totalRevenue = orderItems?.reduce((sum: number, item: any) => sum + item.subtotal_cents, 0) || 0

    return NextResponse.json({
      market: {
        id: market.id,
        name: market.name,
        market_type: market.market_type,
        address: market.address,
        city: market.city,
        state: market.state
      },
      nextPickup: nextPickupDate ? {
        date: nextPickupDate.toISOString(),
        day_of_week: nextSchedule?.day_of_week,
        start_time: nextSchedule?.start_time,
        end_time: nextSchedule?.end_time
      } : null,
      summary: {
        total_orders: totalOrders,
        total_items: totalItems,
        total_quantity: totalQuantity,
        total_revenue_cents: totalRevenue
      },
      orders,
      prepSheet
    })
  })
}
