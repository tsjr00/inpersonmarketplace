import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, crumb, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * B3 — one-click order re-confirmation (owner spec 2026-08-08; mig 230).
 *
 * GET  → the order's re-confirmation state + the event's CURRENT facts, so the
 *        page can show what the buyer is confirming.
 * POST → "Yes, I'm still coming" — sets reconfirmed_at.
 *
 * Token-based, NO auth (owner: "every lost yes is a refund we eat plus a
 * vendor who already cooked" — login-gating loses yeses). The token is a
 * bearer credential granting exactly one action on exactly one order.
 *
 * ⚠ SCANNER SAFETY: GET must NEVER write reconfirmed_at. Mail scanners and
 * link-preview bots follow emailed links (the mig-218 lesson) — a GET-confirm
 * would let a bot silently "confirm" a buyer who never saw the email. Only the
 * page's button POSTs. Do not "simplify" this into confirm-on-arrival.
 *
 * A bad/unknown token returns an indistinguishable 404.
 */

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface RouteContext {
  params: Promise<{ token: string }>
}

async function loadOrderByToken(token: string) {
  const serviceClient = createServiceClient()
  crumb.supabase('select', 'orders')
  const { data: order } = await observed(serviceClient
    .from('orders')
    .select('id, order_number, vertical_id, status, reconfirm_required_at, reconfirmed_at, reconfirm_refunded_at')
    .eq('reconfirm_token', token)
    .maybeSingle(), { table: 'orders' })
  return { serviceClient, order }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/orders/reconfirm/[token]', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`order-reconfirm:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { token } = await context.params
    if (!TOKEN_RE.test(token)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { serviceClient, order } = await loadOrderByToken(token)
    if (!order) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // ST-20 (owner testing 2026-08-25, built 2026-08-29): the page used to say
    // "your pre-order still stands" from orders.status alone, AFTER a vendor
    // had withdrawn and cancelled the items. Derive the state from the live
    // items too: none left → cancelled (refunded by the withdrawal); some
    // left → still awaiting, but say part of it was cancelled.
    crumb.supabase('select', 'order_items')
    const { data: items } = await observed(serviceClient
      .from('order_items')
      .select('market_id, status, cancelled_by')
      .eq('order_id', order.id), { table: 'order_items' })
    const allItems = items ?? []
    const liveItems = allItems.filter(i => i.status !== 'cancelled' && i.status !== 'refunded')
    const cancelledItems = allItems.filter(i => i.status === 'cancelled' || i.status === 'refunded')
    const cancelledByVendor = cancelledItems.some(i => i.cancelled_by === 'vendor')

    const state =
      order.reconfirm_refunded_at
        ? 'refunded'
        : order.status === 'cancelled' || (allItems.length > 0 && liveItems.length === 0)
          ? 'cancelled'
          : !order.reconfirm_required_at
            ? 'not_required'
            : order.reconfirmed_at
              ? 'confirmed'
              : 'awaiting'

    // The event's CURRENT facts — what the buyer is being asked to confirm.
    let event: Record<string, unknown> | null = null
    const marketId = (liveItems[0] ?? allItems[0])?.market_id as string | undefined
    if (marketId) {
      crumb.supabase('select', 'markets')
      const { data: market } = await observed(serviceClient
        .from('markets')
        .select('name, address, city, state, catering_request_id')
        .eq('id', marketId)
        .maybeSingle(), { table: 'markets' })

      let times: { event_date?: string; event_start_time?: string; event_end_time?: string; event_token?: string | null } = {}
      if (market?.catering_request_id) {
        crumb.supabase('select', 'catering_requests')
        const { data: cr } = await observed(serviceClient
          .from('catering_requests')
          .select('event_date, event_start_time, event_end_time, event_token')
          .eq('id', market.catering_request_id)
          .maybeSingle(), { table: 'catering_requests' })
        times = (cr as typeof times) || {}
      }
      event = {
        name: market?.name || 'Your event',
        address: market?.address || null,
        city: market?.city || null,
        state: market?.state || null,
        ...times,
      }
    }

    return NextResponse.json({
      state,
      order_number: order.order_number,
      vertical: order.vertical_id,
      event,
      items: {
        total: allItems.length,
        live: liveItems.length,
        cancelled: cancelledItems.length,
        cancelled_by_vendor: cancelledByVendor,
      },
    })
  })
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/orders/reconfirm/[token]', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`order-reconfirm-submit:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { token } = await context.params
    if (!TOKEN_RE.test(token)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { serviceClient, order } = await loadOrderByToken(token)
    if (!order) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (order.reconfirm_refunded_at || order.status === 'cancelled') {
      return NextResponse.json(
        { error: 'This order was already refunded — too much time passed without a confirmation. We\'re sorry; the refund is on its way back to your card.' },
        { status: 410 }
      )
    }
    if (!order.reconfirm_required_at) {
      return NextResponse.json({ ok: true, state: 'not_required' })
    }
    if (order.reconfirmed_at) {
      return NextResponse.json({ ok: true, state: 'confirmed' })
    }

    crumb.supabase('update', 'orders')
    const { error } = await serviceClient
      .from('orders')
      .update({ reconfirmed_at: new Date().toISOString() })
      .eq('id', order.id)
      .is('reconfirm_refunded_at', null)

    if (error) {
      return NextResponse.json({ error: 'Could not save your confirmation — please try again.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, state: 'confirmed' })
  })
}
