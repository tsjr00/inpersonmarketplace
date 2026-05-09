import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdminForApi } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

/**
 * GET /api/admin/analytics/overview
 *
 * Returns platform-wide analytics for the admin dashboard, scoped optionally
 * to a single vertical and a date range.
 *
 * Data model: queries the live `orders` + `market_box_subscriptions` tables.
 * The legacy `get_analytics_overview` SQL function (migration 016) queried
 * the legacy `transactions` table which has been empty since the orders/
 * order_items migration (migration 046, Feb 2026). Function dropped in
 * migration 132 (Session 80, May 2026).
 *
 * Revenue semantic: gross product subtotal (excludes platform fees). This
 * is what buyers paid for products — the metric label on the page reads
 * "Gross Sales (excl. fees)" to make this explicit.
 *
 * Order count semantic: order-level (one per checkout), NOT item-level.
 * Market box subscriptions count as one "order" each since each subscription
 * is one buyer commitment.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/analytics/overview', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { isAdmin } = await verifyAdminForApi()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const verticalId = searchParams.get('vertical_id')
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

    const serviceClient = createServiceClient()

    // ── Orders (filter by vertical_id directly; date range on created_at) ──
    let ordersQuery = serviceClient
      .from('orders')
      .select('id, status, subtotal_cents, created_at')
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    if (verticalId) {
      ordersQuery = ordersQuery.eq('vertical_id', verticalId)
    }

    // ── Market box subscriptions (filter by vertical via offerings → vendor_profiles) ──
    // Subscriptions don't have vertical_id directly. When a vertical filter is
    // active we look up the vendor profiles in that vertical, find their
    // offerings, then filter subs by those offering ids.
    let offeringIds: string[] | null = null
    if (verticalId) {
      const { data: vendorRows } = await serviceClient
        .from('vendor_profiles')
        .select('id')
        .eq('vertical_id', verticalId)
      const vendorIds = (vendorRows || []).map((v) => v.id as string)

      if (vendorIds.length === 0) {
        offeringIds = []
      } else {
        const { data: offeringRows } = await serviceClient
          .from('market_box_offerings')
          .select('id')
          .in('vendor_profile_id', vendorIds)
        offeringIds = (offeringRows || []).map((o) => o.id as string)
      }
    }

    let subsQuery = serviceClient
      .from('market_box_subscriptions')
      .select('id, status, total_paid_cents, created_at')
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    if (offeringIds !== null) {
      if (offeringIds.length === 0) {
        // Vertical filter active but no offerings exist for that vertical.
        // Skip the query — it would return all subs without the .in() filter.
        subsQuery = subsQuery.in('offering_id', ['00000000-0000-0000-0000-000000000000']) // empty match
      } else {
        subsQuery = subsQuery.in('offering_id', offeringIds)
      }
    }

    // Run remaining count queries in parallel with orders + subs
    const [
      ordersResult,
      subsResult,
      usersResult,
      vendorsResult,
      listingsResult,
      newUsersResult,
    ] = await Promise.all([
      ordersQuery,
      subsQuery,
      serviceClient
        .from('user_profiles')
        .select('id', { count: 'exact', head: true }),
      verticalId
        ? serviceClient
            .from('vendor_profiles')
            .select('id', { count: 'exact', head: true })
            .eq('vertical_id', verticalId)
        : serviceClient
            .from('vendor_profiles')
            .select('id', { count: 'exact', head: true }),
      verticalId
        ? serviceClient
            .from('listings')
            .select('id, status', { count: 'exact' })
            .is('deleted_at', null)
            .eq('vertical_id', verticalId)
        : serviceClient
            .from('listings')
            .select('id, status', { count: 'exact' })
            .is('deleted_at', null),
      serviceClient
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`),
    ])

    const { data: orders, error: ordersError } = ordersResult
    const { data: subscriptions } = subsResult
    const { count: totalUsers } = usersResult
    const { count: totalVendors } = vendorsResult
    const { data: listingsData, count: totalListings } = listingsResult
    const { count: newUsers } = newUsersResult

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 })
    }

    // Aggregate orders by status bucket (order-level, not item-level)
    let totalRevenue = 0
    let completedOrders = 0
    let pendingOrders = 0
    let cancelledOrders = 0

    for (const order of orders || []) {
      const status = order.status as string
      if (status === 'completed') {
        completedOrders++
        totalRevenue += order.subtotal_cents || 0
      } else if (['pending', 'paid', 'confirmed', 'ready'].includes(status)) {
        pendingOrders++
      } else if (['cancelled', 'refunded'].includes(status)) {
        cancelledOrders++
      }
    }

    // Add market box subscriptions: 'active' + 'completed' count as revenue
    // (vendor was paid upfront at checkout). 'cancelled' goes to cancelled.
    for (const sub of subscriptions || []) {
      const status = sub.status as string
      if (status === 'active' || status === 'completed') {
        completedOrders++
        totalRevenue += sub.total_paid_cents || 0
      } else if (status === 'cancelled') {
        cancelledOrders++
      } else {
        pendingOrders++
      }
    }

    const totalOrders = (orders || []).length + (subscriptions || []).length
    const averageOrderValue = completedOrders > 0
      ? Math.round(totalRevenue / completedOrders)
      : 0

    const publishedListings = listingsData?.filter((l) => l.status === 'published').length || 0

    return NextResponse.json({
      // Transaction metrics — gross product subtotals, excluding platform fees
      totalRevenue,
      totalOrders,
      averageOrderValue,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      // Platform metrics
      totalUsers: totalUsers || 0,
      totalVendors: totalVendors || 0,
      totalListings: totalListings || 0,
      publishedListings,
      newUsers: newUsers || 0,
    })
  })
}
