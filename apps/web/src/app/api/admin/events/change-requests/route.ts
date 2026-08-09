import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { verifyAdminScope } from '@/lib/auth/admin'

/**
 * GET /api/admin/events/change-requests?vertical=&status=
 *
 * The admin queue behind the organizer change block. Oldest pending first —
 * every row here is time-critical by definition, because a request only exists
 * when the event was too close for the organizer to change it themselves.
 *
 * Scoped with `verifyAdminScope(vertical)` rather than a hand-rolled role
 * check. Several event routes hand-roll `role === 'admin'`, which is the shape
 * behind backlog item D (a legitimate admin refused). Not repeating it here.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/events/change-requests', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin-change-requests:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')
    const status = searchParams.get('status') || 'pending'

    const scope = await verifyAdminScope(vertical)
    if (!scope?.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'event_change_requests')
    let query = serviceClient
      .from('event_change_requests')
      .select(`
        id, catering_request_id, reason_category, explanation,
        requested_changes, applied_changes,
        preorder_count_at_request, preorder_value_cents_at_request,
        status, review_note, order_action,
        requested_by, reviewed_by, reviewed_at, created_at
      `)
      // Oldest first: a request that has waited longest is the most urgent,
      // which is the opposite of every other list in the admin console.
      .order('created_at', { ascending: true })
      .limit(200)

    if (status !== 'all') query = query.eq('status', status)

    const { data: requests, error } = await query
    if (error) {
      console.error('[admin/change-requests] query failed:', error.message)
      return NextResponse.json({ error: 'Failed to load change requests' }, { status: 500 })
    }

    const rows = requests || []
    if (rows.length === 0) return NextResponse.json({ requests: [] })

    // Fetch the events separately rather than embedding. event_change_requests
    // has exactly one FK to catering_requests so an embed would resolve — but
    // the vertical filter has to happen on the EVENT, and doing it as a
    // separate pass keeps the scoping obvious instead of buried in a hint.
    const eventIds = [...new Set(rows.map(r => r.catering_request_id as string))]
    const { data: events } = await serviceClient
      .from('catering_requests')
      .select('id, company_name, contact_name, contact_email, event_date, event_start_time, event_end_time, address, city, state, status, service_level, vertical_id, market_id')
      .in('id', eventIds)

    const eventById = new Map((events || []).map(e => [e.id as string, e]))

    // Vertical scoping. A platform admin sees everything; a vertical admin sees
    // only their own vertical's events. Doing this in code rather than in the
    // query because the vertical lives on the event, not on the request.
    const scoped = rows.filter(r => {
      const ev = eventById.get(r.catering_request_id as string)
      if (!ev) return false
      if (!vertical) return true
      return ev.vertical_id === vertical
    })

    // ── What is at stake RIGHT NOW ──
    //
    // The stored figures are a snapshot of what the organizer was told when
    // they asked; orders keep arriving, so the admin also needs the current
    // number to decide with. Batched across every market in one query rather
    // than per request — a per-row query would be N round trips on a queue.
    const marketIds = [...new Set(
      scoped
        .map(r => eventById.get(r.catering_request_id as string)?.market_id as string | null)
        .filter((m): m is string => !!m)
    )]

    const liveByMarket = new Map<string, { count: number; valueCents: number }>()
    if (marketIds.length > 0) {
      const { data: liveOrders } = await serviceClient
        .from('order_items')
        .select('market_id, order_id, subtotal_cents')
        .in('market_id', marketIds)
        .not('status', 'in', '("cancelled","refunded")')

      const seenOrders = new Map<string, Set<string>>()
      for (const row of liveOrders || []) {
        const mid = row.market_id as string
        if (!seenOrders.has(mid)) seenOrders.set(mid, new Set())
        seenOrders.get(mid)!.add(row.order_id as string)
        const cur = liveByMarket.get(mid) ?? { count: 0, valueCents: 0 }
        cur.valueCents += (row.subtotal_cents as number) || 0
        liveByMarket.set(mid, cur)
      }
      for (const [mid, orders] of seenOrders) {
        const cur = liveByMarket.get(mid) ?? { count: 0, valueCents: 0 }
        cur.count = orders.size
        liveByMarket.set(mid, cur)
      }
    }

    return NextResponse.json({
      requests: scoped.map(r => {
        const ev = eventById.get(r.catering_request_id as string) ?? null
        const live = ev?.market_id
          ? liveByMarket.get(ev.market_id as string) ?? { count: 0, valueCents: 0 }
          : { count: 0, valueCents: 0 }
        return {
          ...r,
          event: ev,
          live_preorder_count: live.count,
          live_preorder_value_cents: live.valueCents,
        }
      }),
    })
  })
}
