import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getAnalyticsLimits } from '@/lib/vendor-limits'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/analytics/overview', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-analytics-overview:${clientIp}`, rateLimits.api)
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
    const maxDays = analyticsLimits.analyticsDays
    if (maxDays === 0) {
      return NextResponse.json({ totalRevenue: 0, totalOrders: 0, averageOrderValue: 0, completedOrders: 0, pendingOrders: 0, cancelledOrders: 0, maxDays: 0 })
    }
    const earliest = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    if (startDate < earliest) startDate = earliest

    // C7 FIX: Query order_items instead of legacy transactions table
    const { data: orderItems, error } = await supabase
      .from('order_items')
      .select('id, status, subtotal_cents, created_at')
      .eq('vendor_profile_id', vendorId)
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also include market box subscriptions (separate table — they don't create
    // order_items rows). Vendor revenue is recognized at subscription creation
    // since the buyer prepays the full term and the vendor receives the Stripe
    // transfer at checkout (per processMarketBoxPayout helper).
    const { data: vendorOfferings } = await supabase
      .from('market_box_offerings')
      .select('id')
      .eq('vendor_profile_id', vendorId)

    const offeringIds = (vendorOfferings || []).map(o => o.id as string)

    const { data: subscriptions } = offeringIds.length > 0
      ? await supabase
          .from('market_box_subscriptions')
          .select('id, status, total_paid_cents, created_at')
          .in('offering_id', offeringIds)
          .gte('created_at', `${startDate}T00:00:00`)
          .lte('created_at', `${endDate}T23:59:59`)
      : { data: [] }

    // Calculate metrics from order_items
    let totalRevenue = 0
    let completedOrders = 0
    let pendingOrders = 0
    let cancelledOrders = 0

    for (const item of orderItems || []) {
      if (item.status === 'fulfilled' || item.status === 'completed') {
        completedOrders++
        totalRevenue += item.subtotal_cents || 0
      } else if (['paid', 'confirmed', 'ready'].includes(item.status)) {
        pendingOrders++
      } else if (['cancelled', 'refunded'].includes(item.status)) {
        cancelledOrders++
      }
    }

    // Market box subscriptions: 'active' and 'completed' both count as revenue
    // (paid upfront — vendor already received transfer). 'cancelled' goes to the
    // cancelled bucket. total_paid_cents is the vendor's stated price (gross
    // before vendor fee), matching order_items.subtotal_cents semantic.
    for (const sub of subscriptions || []) {
      if (sub.status === 'active' || sub.status === 'completed') {
        completedOrders++
        totalRevenue += sub.total_paid_cents || 0
      } else if (sub.status === 'cancelled') {
        cancelledOrders++
      }
    }

    const totalOrders = (orderItems || []).length + (subscriptions || []).length
    const averageOrderValue = completedOrders > 0 ? Math.round(totalRevenue / completedOrders) : 0

    return NextResponse.json({
      totalRevenue,
      totalOrders,
      averageOrderValue,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      maxDays,
    })
  })
}
