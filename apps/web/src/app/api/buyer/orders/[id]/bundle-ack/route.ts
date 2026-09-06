import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { payBundleMargin } from '@/lib/bundles/margin-payout'
import { CONFIRMATION_WINDOW_SECONDS } from '@/lib/cron/order-timing'

/**
 * POST /api/buyer/orders/[id]/bundle-ack — [id] is the ORDER id (unlike the
 * sibling /confirm route, whose [id] is an order ITEM id).
 *
 * Handoff 2 of the bundle two-part confirmation (mig 246, owner decision
 * 2026-09-06): the buyer acknowledges receiving the assembled bundle from
 * the market manager — the bundle-level mirror of the per-item acknowledge.
 *
 *   Normal flow: buyer taps this → manager taps "Mark handed off" within the
 *     30-second window → margin pays there.
 *   Edge (manager confirmed first): the handoff stamp already exists, so
 *     THIS tap is the second act and releases the margin here — exactly how
 *     the per-item machine pays on buyer-confirm when the vendor fulfilled
 *     first. payBundleMargin's atomic claim makes double-pay impossible
 *     regardless of which route triggers it.
 *
 * Re-tapping refreshes the ack (a fresh window) until the margin is paid.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/buyer/orders/[id]/bundle-ack', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`bundle-buyer-ack:${clientIp}`, { limit: 30, windowSeconds: 60 })
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: orderId } = await params

    crumb.auth('Checking buyer auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'orders (bundle buyer ack)')
    const { data: order } = await observed(serviceClient
      .from('orders')
      .select('id, buyer_user_id, status, bundle_id, bundle_handed_off_at, bundle_buyer_ack_at, bundle_margin_transfer_id')
      .eq('id', orderId)
      .maybeSingle(), { table: 'orders' })

    if (!order || order.buyer_user_id !== user.id) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized to acknowledge this order')
    }
    if (!order.bundle_id) {
      return NextResponse.json({ error: 'Not a bundle order' }, { status: 404 })
    }
    if (!['paid', 'completed'].includes(order.status as string)) {
      return NextResponse.json({ error: 'This order has no confirmed payment yet.' }, { status: 409 })
    }
    if (order.bundle_margin_transfer_id && order.bundle_margin_transfer_id !== 'pending') {
      // Everything already settled — nothing left to acknowledge.
      return NextResponse.json({ acknowledged: true, margin: { status: 'already_paid' } })
    }

    const now = new Date()
    crumb.supabase('update', 'orders (bundle_buyer_ack_at)')
    const { error: ackErr } = await serviceClient
      .from('orders')
      .update({ bundle_buyer_ack_at: now.toISOString() })
      .eq('id', orderId)
    if (ackErr) throw traced.fromSupabase(ackErr, { table: 'orders', operation: 'update' })

    if (order.bundle_handed_off_at) {
      // Manager already confirmed the handoff — this ack is the second act.
      crumb.logic('Buyer ack completes the two-part confirmation — paying margin')
      const result = await payBundleMargin(serviceClient, orderId)
      return NextResponse.json({
        acknowledged: true,
        margin: { status: result.status },
        message: result.status === 'paid' || result.status === 'already_paid'
          ? 'Thanks — enjoy your bundle!'
          : 'Thanks — receipt acknowledged.',
      })
    }

    return NextResponse.json({
      acknowledged: true,
      message: `Receipt acknowledged. The market manager has ${CONFIRMATION_WINDOW_SECONDS} seconds to confirm the handoff.`,
      window_expires_at: new Date(now.getTime() + CONFIRMATION_WINDOW_SECONDS * 1000).toISOString(),
    })
  })
}
