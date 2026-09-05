import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { sendNotification } from '@/lib/notifications/service'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/market-manager/[marketId]/bundles/orders/[orderId]/notify-ready
 *
 * The manager assembled the bundle and taps "Ready — notify the buyer" on
 * the run sheet → ONE bundle_ready push/in-app to the buyer (per-order
 * dedup via the notifications table; a second tap is a no-op). Informational
 * only — no state changes, no money. Handoff (and the margin) remain the
 * separate explicit step when the buyer actually collects.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; orderId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/bundles/orders/[orderId]/notify-ready', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`bundle-ready:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId, orderId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'orders (bundle ready)')
    const { data: order } = await observed(serviceClient
      .from('orders')
      .select('id, buyer_user_id, vertical_id, status, bundle_id')
      .eq('id', orderId)
      .maybeSingle(), { table: 'orders' })
    if (!order?.bundle_id) return NextResponse.json({ error: 'Not a bundle order' }, { status: 404 })
    if (!['paid', 'completed'].includes(order.status as string)) {
      return NextResponse.json({ error: 'This order has no confirmed payment yet.' }, { status: 409 })
    }

    const { data: bundle } = await observed(serviceClient
      .from('market_bundles')
      .select('id, market_id, name, pickup_notes')
      .eq('id', order.bundle_id)
      .maybeSingle(), { table: 'market_bundles' })
    if (!bundle || bundle.market_id !== marketId) {
      return NextResponse.json({ error: 'Bundle does not belong to this market' }, { status: 403 })
    }

    // Per-order dedup — one ready ping per order, ever.
    const { data: prior } = await observed(serviceClient
      .from('notifications')
      .select('id, data')
      .eq('type', 'bundle_ready')
      .eq('user_id', order.buyer_user_id as string), { table: 'notifications' })
    const alreadySent = (prior ?? []).some(n => (n.data as { orderId?: string } | null)?.orderId === orderId)
    if (alreadySent) return NextResponse.json({ sent: false, reason: 'already_notified' })

    const { data: market } = await observed(serviceClient
      .from('markets')
      .select('id, name')
      .eq('id', marketId)
      .maybeSingle(), { table: 'markets' })

    await sendNotification(
      order.buyer_user_id as string,
      'bundle_ready',
      {
        orderId,
        bundleName: bundle.name as string,
        marketName: (market?.name as string) || '',
        bundlePickupNotes: (bundle.pickup_notes as string) || '',
      },
      (order.vertical_id ? { vertical: order.vertical_id as string } : {})
    )

    return NextResponse.json({ sent: true })
  })
}
