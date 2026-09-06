import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications'
import { calculateWindowExpiry } from '@/lib/cron/order-timing'

/**
 * POST /api/market-manager/[marketId]/bundles/orders/[orderId]/collect-ack
 * Body: { orderItemId }
 *
 * Handoff 1 of the bundle two-part confirmation (owner decision 2026-09-06):
 * at collection the MANAGER plays the buyer's role in the standard per-item
 * 30-second ritual. This route is the stand-in for the buyer's acknowledge
 * tap — it sets the SAME fields the buyer confirm route sets in its normal
 * flow (buyer_confirmed_at + confirmation_window_expires_at, see
 * buyer/orders/[id]/confirm normal-flow branch) and sends the vendor the
 * same pickup_confirmation_needed nudge. The vendor then taps Fulfill inside
 * the window exactly as on any order — and THAT is what pays the vendor
 * (fulfill's normal-flow branch). Nothing changes on the vendor's side.
 *
 * NO MONEY MOVES IN THIS ROUTE — it only accepts items in status 'ready'
 * (the normal-flow precondition). A vendor who already tapped Fulfill early
 * (edge branch, unpaid) is completed by the buyer's per-item sweep at final
 * handoff instead.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; orderId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/bundles/orders/[orderId]/collect-ack', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`bundle-collect-ack:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId, orderId } = await params

    crumb.auth('Checking market manager auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const orderItemId = typeof body?.orderItemId === 'string' ? body.orderItemId : ''
    if (!orderItemId) {
      throw traced.validation('ERR_VALIDATION_001', 'orderItemId is required')
    }

    const serviceClient = createServiceClient()

    // The order must be a bundle order of THIS market.
    crumb.supabase('select', 'orders (collect-ack ownership)')
    const { data: order } = await observed(serviceClient
      .from('orders')
      .select('id, bundle_id, order_number, vertical_id')
      .eq('id', orderId)
      .maybeSingle(), { table: 'orders' })
    if (!order || !order.bundle_id) {
      return NextResponse.json({ error: 'Not a bundle order' }, { status: 404 })
    }
    crumb.supabase('select', 'market_bundles (collect-ack ownership)')
    const { data: bundle } = await observed(serviceClient
      .from('market_bundles')
      .select('id, market_id')
      .eq('id', order.bundle_id)
      .maybeSingle(), { table: 'market_bundles' })
    if (!bundle || bundle.market_id !== marketId) {
      return NextResponse.json({ error: 'Bundle does not belong to this market' }, { status: 403 })
    }

    crumb.supabase('select', 'order_items (collect-ack)')
    const { data: item } = await observed(serviceClient
      .from('order_items')
      .select('id, order_id, status, buyer_confirmed_at, vendor_profile_id')
      .eq('id', orderItemId)
      .maybeSingle(), { table: 'order_items' })
    if (!item || item.order_id !== orderId) {
      return NextResponse.json({ error: 'Item does not belong to this order' }, { status: 404 })
    }
    if (item.status !== 'ready') {
      // Mirrors the buyer route's eligibility, minus 'fulfilled' — the edge
      // branch there moves money, which this stand-in must never do.
      throw traced.validation('ERR_ORDER_003',
        item.status === 'fulfilled'
          ? 'Already collected — the vendor marked this item fulfilled.'
          : 'The vendor has not marked this item ready yet.',
        { status: item.status })
    }
    if (item.buyer_confirmed_at) {
      throw traced.validation('ERR_ORDER_003', 'Already acknowledged — the vendor has the 30-second window now.', {
        buyer_confirmed_at: item.buyer_confirmed_at,
      })
    }

    const now = new Date()
    const windowExpires = calculateWindowExpiry(now)

    // Same fields the buyer's normal-flow acknowledge sets. Guarded on status
    // so a cancel/refund landing since the fetch can't be acked over.
    crumb.supabase('update', 'order_items (collect-ack)')
    const { data: ackedRows, error: ackErr } = await serviceClient
      .from('order_items')
      .update({
        buyer_confirmed_at: now.toISOString(),
        confirmation_window_expires_at: windowExpires,
      })
      .eq('id', orderItemId)
      .eq('status', 'ready')
      .is('cancelled_at', null)
      .select('id')
    if (ackErr) throw traced.fromSupabase(ackErr, { table: 'order_items', operation: 'update' })
    if (!ackedRows || ackedRows.length === 0) {
      throw traced.validation('ERR_ORDER_003', 'This item can no longer be acknowledged — it may have been cancelled or refunded.')
    }

    // Same vendor nudge the buyer's tap sends — from their side this pickup
    // is indistinguishable from any other.
    crumb.supabase('select', 'vendor_profiles (collect-ack notify)')
    const { data: vendorProfile } = await observed(serviceClient
      .from('vendor_profiles')
      .select('user_id')
      .eq('id', item.vendor_profile_id)
      .maybeSingle(), { table: 'vendor_profiles' })
    if (vendorProfile?.user_id) {
      const { data: market } = await observed(serviceClient
        .from('markets')
        .select('name')
        .eq('id', marketId)
        .maybeSingle(), { table: 'markets' })
      await sendNotification(vendorProfile.user_id, 'pickup_confirmation_needed', {
        orderItemId,
        orderNumber: order.order_number as string,
        buyerName: market?.name ? `${market.name} (market manager)` : 'Market manager',
      }, order.vertical_id ? { vertical: order.vertical_id as string } : {})
    }

    return NextResponse.json({
      success: true,
      message: 'Acknowledged — the vendor has 30 seconds to fulfill.',
      confirmation_window_expires_at: windowExpires,
    })
  })
}
