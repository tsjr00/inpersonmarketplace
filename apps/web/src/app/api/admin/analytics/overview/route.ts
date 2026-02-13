import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdminForApi } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/analytics/overview', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    // Verify admin role using centralized utility
    const { isAdmin } = await verifyAdminForApi()

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const verticalId = searchParams.get('vertical_id') // Optional - filter by vertical
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

    // Use service client for full access
    const serviceClient = createServiceClient()

    // Run all queries in parallel — transaction metrics use SQL aggregation
    const [
      txResult,
      usersResult,
      vendorsResult,
      listingsResult,
      newUsersResult
    ] = await Promise.all([
      // Query 1: Transaction metrics via SQL function (GROUP BY instead of fetch-all)
      serviceClient.rpc('get_analytics_overview', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_vertical_id: verticalId || null,
      }),
      // Query 2: Total user count
      serviceClient
        .from('user_profiles')
        .select('id', { count: 'exact', head: true }),
      // Query 3: Vendor count (with optional vertical filter)
      verticalId
        ? serviceClient
            .from('vendor_profiles')
            .select('id', { count: 'exact', head: true })
            .eq('vertical_id', verticalId)
        : serviceClient
            .from('vendor_profiles')
            .select('id', { count: 'exact', head: true }),
      // Query 4: Listings (with optional vertical filter)
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
      // Query 5: New signups in date range
      serviceClient
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
    ])

    const { data: txMetrics, error: txError } = txResult
    const { count: totalUsers } = usersResult
    const { count: totalVendors } = vendorsResult
    const { data: listingsData, count: totalListings } = listingsResult
    const { count: newUsers } = newUsersResult

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 })
    }

    // SQL function returns a single row with aggregated metrics
    const metrics = Array.isArray(txMetrics) ? txMetrics[0] : txMetrics
    const publishedListings = listingsData?.filter(l => l.status === 'published').length || 0

    return NextResponse.json({
      // Transaction metrics (from SQL aggregation)
      totalRevenue: Number(metrics?.total_revenue ?? 0),
      totalOrders: Number(metrics?.total_orders ?? 0),
      averageOrderValue: Number(metrics?.average_order_value ?? 0),
      completedOrders: Number(metrics?.completed_orders ?? 0),
      pendingOrders: Number(metrics?.pending_orders ?? 0),
      cancelledOrders: Number(metrics?.cancelled_orders ?? 0),
      // Platform metrics
      totalUsers: totalUsers || 0,
      totalVendors: totalVendors || 0,
      totalListings: totalListings || 0,
      publishedListings,
      newUsers: newUsers || 0
    })
  })
}
