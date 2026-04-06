import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/events/[token]/validate-capacity?vendor_profile_id=...
 *
 * Pre-checkout validation: checks whether a vendor at this event still has
 * capacity to accept more orders. Compares event_max_orders_total on
 * market_vendors against the count of non-cancelled order_items for that
 * vendor at this market.
 *
 * Returns: { allowed: boolean, remaining: number | null, cap: number | null }
 * - remaining=null means no cap set (unlimited)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`event-validate:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  const { token } = await params

  return withErrorTracing('/api/events/[token]/validate-capacity', 'GET', async () => {
    const { searchParams } = new URL(request.url)
    const vendorProfileId = searchParams.get('vendor_profile_id')

    if (!vendorProfileId) {
      return NextResponse.json({ error: 'vendor_profile_id is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Look up event by token
    crumb.supabase('select', 'catering_requests')
    const { data: event } = await supabase
      .from('catering_requests')
      .select('id, market_id, status')
      .eq('event_token', token)
      .single()

    if (!event || !event.market_id) {
      throw traced.notFound('ERR_VALIDATE_002', 'Event not found')
    }

    const acceptingStatuses = ['approved', 'ready', 'active']
    if (!acceptingStatuses.includes(event.status)) {
      return NextResponse.json({
        allowed: false,
        remaining: 0,
        cap: null,
        reason: event.status === 'cancelled' ? 'This event has been cancelled'
          : event.status === 'completed' ? 'This event has ended'
          : 'This event is not currently accepting orders',
      })
    }

    // Get vendor's declared capacity for this event
    crumb.supabase('select', 'market_vendors')
    const { data: marketVendor } = await supabase
      .from('market_vendors')
      .select('event_max_orders_total')
      .eq('market_id', event.market_id)
      .eq('vendor_profile_id', vendorProfileId)
      .eq('response_status', 'accepted')
      .single()

    if (!marketVendor) {
      throw traced.notFound('ERR_VALIDATE_003', 'Vendor not participating in this event')
    }

    const cap = marketVendor.event_max_orders_total

    // No cap set — vendor accepts unlimited orders
    if (!cap) {
      return NextResponse.json({ allowed: true, remaining: null, cap: null })
    }

    // Count non-cancelled order items for this vendor at this market
    crumb.supabase('select', 'order_items (count)')
    const { count } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', event.market_id)
      .eq('vendor_profile_id', vendorProfileId)
      .not('status', 'in', '("cancelled","refunded")')

    const currentOrders = count || 0
    const remaining = cap - currentOrders

    return NextResponse.json({
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      cap,
    })
  })
}
