import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getAnalyticsLimits } from '@/lib/vendor-limits'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/analytics/customers', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-analytics-customers:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Check auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const vendorId = searchParams.get('vendor_id')
    let startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

    if (!vendorId) {
      return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
    }

    // Verify the user owns this vendor profile
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, tier, vertical_id')
      .eq('id', vendorId)
      .single()

    if (!vendorProfile || vendorProfile.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to view this vendor analytics' }, { status: 403 })
    }

    // Tier-based analytics day clamping (both verticals)
    const analyticsLimits = getAnalyticsLimits(vendorProfile.tier || 'free', vendorProfile.vertical_id)
    if (analyticsLimits.analyticsDays === 0) {
      return NextResponse.json({ totalCustomers: 0, returningCustomers: 0, newCustomers: 0, averageOrdersPerCustomer: 0 })
    }
    const earliest = new Date(Date.now() - analyticsLimits.analyticsDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    if (startDate < earliest) startDate = earliest

    // C7 FIX: Query order_items joined with orders for buyer_user_id
    // Both queries are independent — run in parallel
    const [currentResult, previousResult] = await Promise.all([
      supabase
        .from('order_items')
        .select('id, order:orders!inner(buyer_user_id)')
        .eq('vendor_profile_id', vendorId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`),
      supabase
        .from('order_items')
        .select('order:orders!inner(buyer_user_id)')
        .eq('vendor_profile_id', vendorId)
        .lt('created_at', `${startDate}T00:00:00`),
    ])

    const { data: currentItems, error } = currentResult
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const { data: previousItems } = previousResult

    // Also include market box subscriptions (separate table; buyer_user_id
    // is on the subscription row directly — no orders join needed). See
    // overview route for the full reasoning on why subscriptions count here.
    const { data: vendorOfferings } = await supabase
      .from('market_box_offerings')
      .select('id')
      .eq('vendor_profile_id', vendorId)

    const offeringIds = (vendorOfferings || []).map(o => o.id as string)

    const [currentSubsResult, previousSubsResult]: [
      { data: { buyer_user_id: string }[] | null },
      { data: { buyer_user_id: string }[] | null },
    ] = offeringIds.length > 0
      ? await Promise.all([
          supabase
            .from('market_box_subscriptions')
            .select('buyer_user_id')
            .in('offering_id', offeringIds)
            .gte('created_at', `${startDate}T00:00:00`)
            .lte('created_at', `${endDate}T23:59:59`),
          supabase
            .from('market_box_subscriptions')
            .select('buyer_user_id')
            .in('offering_id', offeringIds)
            .lt('created_at', `${startDate}T00:00:00`),
        ])
      : [{ data: [] }, { data: [] }]

    const currentSubs = currentSubsResult.data || []
    const previousSubs = previousSubsResult.data || []

    const previousCustomers = new Set(
      (previousItems || []).map((item: any) => {
        const order = Array.isArray(item.order) ? item.order[0] : item.order
        return order?.buyer_user_id
      })
        .concat(previousSubs.map(s => s.buyer_user_id))
        .filter(Boolean)
    )

    // Calculate customer metrics
    const customerOrders: Record<string, number> = {}
    const newCustomerIds = new Set<string>()
    const returningCustomerIds = new Set<string>()

    const recordEncounter = (buyerId: string | undefined | null) => {
      if (!buyerId) return
      customerOrders[buyerId] = (customerOrders[buyerId] || 0) + 1
      if (previousCustomers.has(buyerId)) {
        returningCustomerIds.add(buyerId)
      } else {
        if (!newCustomerIds.has(buyerId) && !returningCustomerIds.has(buyerId)) {
          newCustomerIds.add(buyerId)
        }
      }
    }

    for (const item of currentItems || []) {
      const orderData = (item as any).order
      const order = Array.isArray(orderData) ? orderData[0] : orderData
      recordEncounter(order?.buyer_user_id)
    }

    // Each market box subscription = 1 customer encounter (matches the
    // "subscription = 1 order" decision from the overview route).
    for (const sub of currentSubs) {
      recordEncounter(sub.buyer_user_id)
    }

    const totalCustomers = Object.keys(customerOrders).length
    const returningCustomers = returningCustomerIds.size
    const newCustomers = newCustomerIds.size
    const totalOrders = (currentItems?.length || 0) + currentSubs.length
    const averageOrdersPerCustomer = totalCustomers > 0
      ? Math.round((totalOrders / totalCustomers) * 100) / 100
      : 0

    return NextResponse.json({
      totalCustomers,
      returningCustomers,
      newCustomers,
      averageOrdersPerCustomer
    })
  })
}
