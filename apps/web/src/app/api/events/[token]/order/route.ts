import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ token: string }>
}

/**
 * POST /api/events/[token]/order
 *
 * Company-paid order creation. Bypasses Stripe — the organizer has already paid.
 * Attendee selects a wave + one item. Order is created with status = 'confirmed'.
 *
 * Request body: { reservation_id, listing_id, vendor_profile_id, wave_id }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/order', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-order:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    // Auth required
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Sign in to place your order' }, { status: 401 })
    }

    const { token } = await context.params
    const body = await request.json()
    const { reservation_id, listing_id, vendor_profile_id, wave_id } = body

    if (!reservation_id || !listing_id || !vendor_profile_id || !wave_id) {
      return NextResponse.json(
        { error: 'reservation_id, listing_id, vendor_profile_id, and wave_id are required' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    // Verify event exists, is company_paid, and is accepting orders
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('market_id, payment_model, status, company_name, vertical_id')
      .eq('event_token', token)
      .in('status', ['approved', 'ready', 'active'])
      .single()

    if (!event?.market_id) {
      return NextResponse.json({ error: 'Event not found or not accepting orders' }, { status: 404 })
    }

    if (event.payment_model !== 'company_paid') {
      return NextResponse.json(
        { error: 'This endpoint is for company-paid events only' },
        { status: 400 }
      )
    }

    // Call the atomic order creation RPC
    const { data, error } = await serviceClient
      .rpc('create_company_paid_order', {
        p_user_id: user.id,
        p_market_id: event.market_id,
        p_reservation_id: reservation_id,
        p_listing_id: listing_id,
        p_vendor_profile_id: vendor_profile_id,
        p_wave_id: wave_id,
      })
      .single()

    if (error) {
      console.error('[company-paid-order] RPC error:', error)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    const result = data as { success: boolean; order_id: string | null; order_number: string | null; error: string | null }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Send notifications (non-blocking — sendNotification never throws)
    const { data: listing } = await serviceClient
      .from('listings')
      .select('title, vendor_profiles!inner(user_id, profile_data)')
      .eq('id', listing_id)
      .single()

    const vendorUserId = (listing as any)?.vendor_profiles?.user_id
    const vendorName = (listing as any)?.vendor_profiles?.profile_data?.business_name || 'Vendor'
    const eventName = event.company_name || 'Event'
    const vertical = event.vertical_id || 'farmers_market'

    // Notify vendor of new order
    if (vendorUserId) {
      await sendNotification(vendorUserId, 'new_paid_order', {
        orderNumber: result.order_number || undefined,
        itemTitle: listing?.title || undefined,
        marketName: eventName,
        buyerName: 'Event attendee',
      }, { vertical })
    }

    // Notify buyer of confirmed order
    await sendNotification(user.id, 'order_confirmed', {
      orderNumber: result.order_number || undefined,
      orderId: result.order_id || undefined,
      vendorName,
      itemTitle: listing?.title || undefined,
    }, { vertical })

    return NextResponse.json({
      ok: true,
      order_id: result.order_id,
      order_number: result.order_number,
    })
  })
}
