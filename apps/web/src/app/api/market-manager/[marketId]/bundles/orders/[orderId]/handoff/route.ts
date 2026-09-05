import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { payBundleMargin } from '@/lib/bundles/margin-payout'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/market-manager/[marketId]/bundles/orders/[orderId]/handoff
 *
 * The manager marks a sold bundle order HANDED OFF (the buyer collected the
 * assembled bundle) — the ONE gate the margin payout sits behind (mig 244
 * no-clawback invariant: margin moves only after this, so a cancellation
 * before it never needs a margin clawback).
 *
 * Order of checks (money moves LAST):
 *   1. auth → isMarketManager(marketId)
 *   2. the order belongs to a bundle OF THIS MARKET
 *   3. the buyer's payment is real (order paid/completed)
 *   4. every non-cancelled component item is FULFILLED — each vendor's own
 *      handoff (to the manager) is recorded before the manager's handoff
 *      (to the buyer) can release the margin
 *   5. stamp bundle_handed_off_at (idempotent — first write wins)
 *   6. payBundleMargin (atomic claim inside; see lib/bundles/margin-payout.ts)
 *
 * Re-tapping after success returns already_paid; after a failed transfer it
 * returns payout_pending (reconciliation state — no automatic retry, that is
 * what makes double-pay impossible).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; orderId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/bundles/orders/[orderId]/handoff', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`bundle-handoff:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId, orderId } = await params

    crumb.auth('Checking market manager auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) {
      return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })
    }

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'orders (bundle handoff)')
    const { data: order } = await observed(serviceClient
      .from('orders')
      .select('id, status, bundle_id, bundle_handed_off_at, bundle_margin_transfer_id')
      .eq('id', orderId)
      .maybeSingle(), { table: 'orders' })

    if (!order || !order.bundle_id) {
      return NextResponse.json({ error: 'Not a bundle order' }, { status: 404 })
    }

    // The bundle must belong to THIS market — a manager can only hand off
    // their own market's bundles.
    crumb.supabase('select', 'market_bundles (ownership)')
    const { data: bundle } = await observed(serviceClient
      .from('market_bundles')
      .select('id, market_id')
      .eq('id', order.bundle_id)
      .maybeSingle(), { table: 'market_bundles' })
    if (!bundle || bundle.market_id !== marketId) {
      return NextResponse.json({ error: 'Bundle does not belong to this market' }, { status: 403 })
    }

    if (!['paid', 'completed'].includes(order.status as string)) {
      return NextResponse.json(
        { error: 'This order has no confirmed payment yet.' },
        { status: 409 }
      )
    }

    // Every vendor's own handoff first: non-cancelled component items must be
    // fulfilled before the margin can move. (If a vendor forgot to tap
    // fulfill, that existing flow is the fix — the margin always moves last.)
    crumb.supabase('select', 'order_items (fulfillment gate)')
    const { data: openItems } = await observed(serviceClient
      .from('order_items')
      .select('id, status')
      .eq('order_id', orderId)
      .is('cancelled_at', null)
      .neq('status', 'fulfilled'), { table: 'order_items' })
    if (openItems && openItems.length > 0) {
      return NextResponse.json(
        {
          error: `${openItems.length} component item(s) are not fulfilled yet. Each vendor marks their own handoff to you first.`,
          unfulfilled: openItems.length,
        },
        { status: 409 }
      )
    }

    // Stamp the handoff (idempotent — only the first write sets it).
    if (!order.bundle_handed_off_at) {
      crumb.supabase('update', 'orders (bundle_handed_off_at)')
      await serviceClient
        .from('orders')
        .update({ bundle_handed_off_at: new Date().toISOString() })
        .eq('id', orderId)
        .is('bundle_handed_off_at', null)
    }

    crumb.logic('Paying bundle margin (post-handoff)')
    const result = await payBundleMargin(serviceClient, orderId)

    switch (result.status) {
      case 'paid':
        return NextResponse.json({
          handedOff: true,
          margin: { status: 'paid', marketCents: result.marketCents, causeCents: result.causeCents },
        })
      case 'already_paid':
        return NextResponse.json({ handedOff: true, margin: { status: 'already_paid' } })
      case 'payout_pending':
        return NextResponse.json({
          handedOff: true,
          margin: { status: 'pending', note: 'Handoff recorded. The margin payout needs attention — the platform has been notified.' },
        })
      case 'nothing_to_pay':
        return NextResponse.json({ handedOff: true, margin: { status: 'none' } })
      case 'not_paid':
        return NextResponse.json({ error: 'This order has no confirmed payment yet.' }, { status: 409 })
      case 'not_handed_off':
        // Unreachable after the stamp above; report honestly if it ever fires.
        return NextResponse.json({ error: 'Handoff could not be recorded. Please retry.' }, { status: 500 })
      case 'failed':
        return NextResponse.json({
          handedOff: true,
          margin: { status: 'pending', note: 'Handoff recorded. The margin payout hit an error and is queued for reconciliation.' },
        })
    }
  })
}
