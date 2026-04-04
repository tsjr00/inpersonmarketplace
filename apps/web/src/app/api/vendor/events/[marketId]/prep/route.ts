import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ marketId: string }>
}

/**
 * GET /api/vendor/events/[marketId]/prep
 *
 * Returns the vendor's event prep sheet — orders grouped by wave,
 * item counts, and individual order details for event day operations.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/events/[marketId]/prep', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-prep:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    // Auth required — must be the vendor
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { marketId } = await context.params
    const serviceClient = createServiceClient()

    // Verify vendor is accepted at this event
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 403 })
    }

    const { data: marketVendor } = await serviceClient
      .from('market_vendors')
      .select('response_status, event_max_orders_per_wave, event_max_orders_total')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (!marketVendor || marketVendor.response_status !== 'accepted') {
      return NextResponse.json({ error: 'You are not confirmed for this event' }, { status: 403 })
    }

    // Get event details
    const { data: market } = await serviceClient
      .from('markets')
      .select('id, name, event_start_date, event_end_date, wave_ordering_enabled, catering_request_id')
      .eq('id', marketId)
      .single()

    if (!market) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { data: cateringReq } = await serviceClient
      .from('catering_requests')
      .select('company_name, event_date, event_start_time, event_end_time, headcount, address, city, state')
      .eq('id', market.catering_request_id)
      .single()

    // Get waves if wave ordering is enabled
    let waves: Array<{
      id: string; wave_number: number; start_time: string; end_time: string
      capacity: number; reserved_count: number
    }> = []

    if (market.wave_ordering_enabled) {
      const { data: waveRows } = await serviceClient
        .from('event_waves')
        .select('id, wave_number, start_time, end_time, capacity, reserved_count')
        .eq('market_id', marketId)
        .order('wave_number')

      waves = waveRows || []
    }

    // Get all order items for this vendor at this event
    const { data: orderItems } = await serviceClient
      .from('order_items')
      .select(`
        id, order_id, listing_id, quantity, unit_price_cents, subtotal_cents,
        status, wave_id, preferred_pickup_time, pickup_confirmed_at,
        orders!inner (
          id, order_number, status, payment_model, user_id,
          event_wave_reservation_id, created_at
        ),
        listings!inner (
          title
        )
      `)
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .not('status', 'eq', 'cancelled')

    // Build prep summary: items grouped by wave, with counts
    const itemCounts: Record<string, { title: string; total: number; byWave: Record<string, number> }> = {}
    const ordersByWave: Record<string, Array<{
      order_number: string
      item_title: string
      quantity: number
      status: string
      fulfilled: boolean
      pickup_time: string | null
      order_id: string
    }>> = {}

    // "no_wave" key for orders without wave assignment
    const NO_WAVE = 'no_wave'

    for (const item of orderItems || []) {
      const order = item.orders as unknown as { order_number: string; status: string }
      const listing = item.listings as unknown as { title: string }
      const waveKey = item.wave_id || NO_WAVE

      // Item counts
      if (!itemCounts[listing.title]) {
        itemCounts[listing.title] = { title: listing.title, total: 0, byWave: {} }
      }
      itemCounts[listing.title].total += item.quantity
      itemCounts[listing.title].byWave[waveKey] = (itemCounts[listing.title].byWave[waveKey] || 0) + item.quantity

      // Orders by wave
      if (!ordersByWave[waveKey]) ordersByWave[waveKey] = []
      ordersByWave[waveKey].push({
        order_number: order.order_number,
        item_title: listing.title,
        quantity: item.quantity,
        status: item.status,
        fulfilled: !!item.pickup_confirmed_at,
        pickup_time: item.preferred_pickup_time,
        order_id: item.order_id,
      })
    }

    // Total stats
    const totalOrders = new Set((orderItems || []).map(i => i.order_id)).size
    const totalItems = (orderItems || []).reduce((s, i) => s + i.quantity, 0)
    const fulfilledCount = (orderItems || []).filter(i => !!i.pickup_confirmed_at).length
    const totalRevenueCents = (orderItems || []).reduce((s, i) => s + i.subtotal_cents, 0)

    return NextResponse.json({
      event: cateringReq ? {
        company_name: cateringReq.company_name,
        event_date: cateringReq.event_date,
        event_start_time: cateringReq.event_start_time,
        event_end_time: cateringReq.event_end_time,
        headcount: cateringReq.headcount,
        address: cateringReq.address,
        city: cateringReq.city,
        state: cateringReq.state,
      } : null,
      waves,
      waveOrderingEnabled: market.wave_ordering_enabled,
      itemCounts: Object.values(itemCounts),
      ordersByWave,
      summary: {
        totalOrders,
        totalItems,
        fulfilledCount,
        remainingCount: totalItems - fulfilledCount,
        totalRevenueCents,
        maxOrdersPerWave: marketVendor.event_max_orders_per_wave,
        maxOrdersTotal: marketVendor.event_max_orders_total,
      },
    })
  })
}
