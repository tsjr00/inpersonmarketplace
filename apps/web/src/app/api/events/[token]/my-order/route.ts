import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/events/[token]/my-order
 *
 * Returns the authenticated user's order for this event.
 * Used by the my-order page to display pick-ticket + QR code.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/my-order', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-myorder:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    // Auth required
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Sign in to view your order' }, { status: 401 })
    }

    const { token } = await params
    const serviceClient = createServiceClient()

    // Get event by token
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('id, market_id, company_name, event_date, event_start_time, event_end_time, address, city, state, vertical_id, status')
      .eq('event_token', token)
      .single()

    if (!event?.market_id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Get user's order for this event market
    const { data: order } = await serviceClient
      .from('orders')
      .select('id, order_number, status, payment_model, event_wave_reservation_id, created_at')
      .eq('market_id', event.market_id)
      .eq('user_id', user.id)
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!order) {
      return NextResponse.json({ error: 'No order found for this event' }, { status: 404 })
    }

    // Get order item details
    const { data: items } = await serviceClient
      .from('order_items')
      .select('id, listing_id, vendor_profile_id, quantity, unit_price_cents, status, wave_id, preferred_pickup_time')
      .eq('order_id', order.id)

    // Get listing + vendor details for items
    const listingIds = (items || []).map(i => i.listing_id).filter(Boolean)
    const vendorIds = (items || []).map(i => i.vendor_profile_id).filter(Boolean)

    const [{ data: listings }, { data: vendors }] = await Promise.all([
      listingIds.length > 0
        ? serviceClient.from('listings').select('id, title, primary_image_url:image_urls').in('id', listingIds)
        : Promise.resolve({ data: [] }),
      vendorIds.length > 0
        ? serviceClient.from('vendor_profiles').select('id, profile_data').in('id', vendorIds)
        : Promise.resolve({ data: [] }),
    ])

    const listingMap = new Map((listings || []).map(l => [l.id, {
      title: l.title,
      image_url: (l.primary_image_url as string[] | null)?.[0] || null,
    }]))

    const vendorMap = new Map((vendors || []).map(v => [v.id, {
      business_name: ((v.profile_data as Record<string, unknown>)?.business_name as string)
        || ((v.profile_data as Record<string, unknown>)?.farm_name as string)
        || 'Vendor',
    }]))

    // Get wave info if wave reservation exists
    let wave: { wave_number: number; start_time: string; end_time: string } | null = null
    if (order.event_wave_reservation_id) {
      const { data: reservation } = await serviceClient
        .from('event_wave_reservations')
        .select('wave_id')
        .eq('id', order.event_wave_reservation_id)
        .single()

      if (reservation?.wave_id) {
        const { data: waveData } = await serviceClient
          .from('event_waves')
          .select('wave_number, start_time, end_time')
          .eq('id', reservation.wave_id)
          .single()

        if (waveData) wave = waveData
      }
    }

    return NextResponse.json({
      event: {
        company_name: event.company_name,
        event_date: event.event_date,
        event_start_time: event.event_start_time,
        event_end_time: event.event_end_time,
        address: event.address,
        city: event.city,
        state: event.state,
        vertical_id: event.vertical_id,
      },
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        payment_model: order.payment_model,
        created_at: order.created_at,
      },
      wave,
      items: (items || []).map(item => ({
        id: item.id,
        title: listingMap.get(item.listing_id)?.title || 'Item',
        image_url: listingMap.get(item.listing_id)?.image_url || null,
        vendor_name: vendorMap.get(item.vendor_profile_id)?.business_name || 'Vendor',
        quantity: item.quantity,
        status: item.status,
      })),
    })
  })
}
