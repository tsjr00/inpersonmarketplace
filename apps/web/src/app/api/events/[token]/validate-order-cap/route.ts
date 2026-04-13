import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/events/[token]/validate-order-cap?vendor_profile_id=...
 *
 * Pre-checkout validation: checks if a vendor has reached their
 * event_max_orders_total cap for this event. Called by ShopClient
 * before proceeding to checkout or company-paid order placement.
 *
 * Returns { allowed: true } or { allowed: false, reason, current, max }.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params
  return withErrorTracing(`/api/events/${token}/validate-order-cap`, 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-validate-cap:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { searchParams } = new URL(request.url)
    const vendorProfileId = searchParams.get('vendor_profile_id')

    if (!vendorProfileId) {
      return NextResponse.json({ error: 'vendor_profile_id required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('market_id, status')
      .eq('event_token', token)
      .in('status', ['approved', 'ready', 'active'])
      .single()

    if (!event?.market_id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { data: marketVendor } = await serviceClient
      .from('market_vendors')
      .select('event_max_orders_total')
      .eq('market_id', event.market_id)
      .eq('vendor_profile_id', vendorProfileId)
      .eq('response_status', 'accepted')
      .single()

    if (!marketVendor) {
      return NextResponse.json({ error: 'Vendor not found at this event' }, { status: 404 })
    }

    const maxOrders = marketVendor.event_max_orders_total as number | null
    if (!maxOrders) {
      return NextResponse.json({ allowed: true, current: 0, max: null })
    }

    const { count: currentOrders } = await serviceClient
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', event.market_id)
      .eq('vendor_profile_id', vendorProfileId)
      .not('status', 'in', '("cancelled","refunded")')

    const current = currentOrders || 0
    const allowed = current < maxOrders

    return NextResponse.json({
      allowed,
      current,
      max: maxOrders,
      ...(!allowed ? { reason: `This vendor has reached their order capacity for this event (${maxOrders} orders).` } : {}),
    })
  })
}
