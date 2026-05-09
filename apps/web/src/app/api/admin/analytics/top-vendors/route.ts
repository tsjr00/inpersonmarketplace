import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdminForApi } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

/**
 * GET /api/admin/analytics/top-vendors
 *
 * Returns the top vendors by gross product sales over a date window,
 * optionally scoped to a vertical.
 *
 * Data model: queries `order_items` + `market_box_subscriptions`. The legacy
 * `get_top_vendors` SQL function (migration 016) queried the empty
 * `transactions` table — dropped in migration 132.
 *
 * Sales semantic: gross product subtotal per vendor (order_items.subtotal_cents
 * for fulfilled/completed items + market_box_subscriptions.total_paid_cents
 * for active/completed subs). Excludes platform fees.
 *
 * Sort: descending by revenue.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/analytics/top-vendors', 'GET', async () => {
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
    const limit = parseInt(searchParams.get('limit') || '10')

    const serviceClient = createServiceClient()

    // ── Order items: revenue per vendor for fulfilled/completed items ──
    const { data: orderItems, error: itemsError } = await serviceClient
      .from('order_items')
      .select('vendor_profile_id, status, subtotal_cents, created_at')
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    // ── Market box subscriptions: revenue per vendor (via offering → vendor) ──
    const { data: subscriptions } = await serviceClient
      .from('market_box_subscriptions')
      .select('id, status, total_paid_cents, offering_id, created_at')
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    // Look up offering → vendor_profile_id for any subscriptions present
    const subOfferingIds = Array.from(new Set((subscriptions || []).map((s) => s.offering_id as string)))
    const offeringToVendor = new Map<string, string>()
    if (subOfferingIds.length > 0) {
      const { data: offerings } = await serviceClient
        .from('market_box_offerings')
        .select('id, vendor_profile_id')
        .in('id', subOfferingIds)
      for (const o of offerings || []) {
        offeringToVendor.set(o.id as string, o.vendor_profile_id as string)
      }
    }

    // ── Aggregate by vendor_profile_id ──
    const byVendor = new Map<string, { total_sales: number; revenue: number }>()
    const bump = (vendorId: string, revenue: number) => {
      const cur = byVendor.get(vendorId) || { total_sales: 0, revenue: 0 }
      cur.total_sales += 1
      cur.revenue += revenue
      byVendor.set(vendorId, cur)
    }

    for (const item of orderItems || []) {
      const status = item.status as string
      if (status === 'fulfilled' || status === 'completed') {
        bump(item.vendor_profile_id as string, item.subtotal_cents || 0)
      }
    }

    for (const sub of subscriptions || []) {
      const status = sub.status as string
      if (status !== 'active' && status !== 'completed') continue
      const vendorId = offeringToVendor.get(sub.offering_id as string)
      if (!vendorId) continue
      bump(vendorId, sub.total_paid_cents || 0)
    }

    if (byVendor.size === 0) {
      return NextResponse.json([])
    }

    // Fetch vendor profile details for vertical filter + display
    const vendorIds = Array.from(byVendor.keys())
    let vendorQuery = serviceClient
      .from('vendor_profiles')
      .select('id, vertical_id, tier, profile_data')
      .in('id', vendorIds)

    if (verticalId) {
      vendorQuery = vendorQuery.eq('vertical_id', verticalId)
    }

    const { data: vendorProfiles } = await vendorQuery

    // Build sorted result, dropping vendors that don't match the vertical filter
    const result = (vendorProfiles || [])
      .map((p) => {
        const stats = byVendor.get(p.id as string)
        if (!stats) return null
        const profileData = p.profile_data as { business_name?: string; farm_name?: string } | null
        return {
          vendor_id: p.id as string,
          name: profileData?.business_name || profileData?.farm_name || 'Unknown Vendor',
          vertical_id: (p.vertical_id as string) || null,
          tier: (p.tier as string) || 'free',
          total_sales: stats.total_sales,
          revenue: stats.revenue,
        }
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit)

    return NextResponse.json(result)
  })
}
