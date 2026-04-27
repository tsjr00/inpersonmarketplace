import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getAnalyticsLimits } from '@/lib/vendor-limits'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/analytics/trends', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-analytics-trends:${clientIp}`, rateLimits.api)
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
    const period = searchParams.get('period') || 'day' // day, week, month
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
      return NextResponse.json([])
    }
    const earliest = new Date(Date.now() - analyticsLimits.analyticsDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    if (startDate < earliest) startDate = earliest

    // C7 FIX: Query order_items directly instead of legacy RPC on transactions table
    const { data: orderItems, error } = await supabase
      .from('order_items')
      .select('id, status, subtotal_cents, created_at')
      .eq('vendor_profile_id', vendorId)
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also include market box subscriptions (separate table; revenue recognized
    // at subscription creation since vendor was paid upfront — see overview
    // route for the full reasoning).
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

    // Period bucketing helper — applies to both order_items and subscriptions
    const periodKeyFor = (createdAt: string): string => {
      const date = new Date(createdAt)
      if (period === 'week') {
        const day = date.getUTCDay()
        const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1)
        const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff))
        return weekStart.toISOString().split('T')[0]
      } else if (period === 'month') {
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
      }
      return date.toISOString().split('T')[0]
    }

    // Group by period in JS
    const dateStats: Record<string, { date: string; revenue: number; orders: number }> = {}
    for (const item of orderItems || []) {
      const periodKey = periodKeyFor(item.created_at)

      if (!dateStats[periodKey]) {
        dateStats[periodKey] = { date: periodKey, revenue: 0, orders: 0 }
      }
      dateStats[periodKey].orders++
      if (item.status === 'fulfilled' || item.status === 'completed') {
        dateStats[periodKey].revenue += item.subtotal_cents || 0
      }
    }

    // Bucket market box subscriptions into the same period grouping.
    // Status mapping matches overview route: 'active'/'completed' count as
    // revenue (vendor paid upfront). All subs count toward orders.
    for (const sub of subscriptions || []) {
      const periodKey = periodKeyFor(sub.created_at)

      if (!dateStats[periodKey]) {
        dateStats[periodKey] = { date: periodKey, revenue: 0, orders: 0 }
      }
      dateStats[periodKey].orders++
      if (sub.status === 'active' || sub.status === 'completed') {
        dateStats[periodKey].revenue += sub.total_paid_cents || 0
      }
    }

    // Fill in missing dates
    const trends: Array<{ date: string; revenue: number; orders: number }> = []
    const start = new Date(startDate)
    const end = new Date(endDate)

    if (period === 'day') {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0]
        trends.push(dateStats[dateKey] || { date: dateKey, revenue: 0, orders: 0 })
      }
    } else if (period === 'week') {
      // Start from the Monday of start date
      const day = start.getDay()
      const diff = start.getDate() - day + (day === 0 ? -6 : 1)
      start.setDate(diff)

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
        const dateKey = d.toISOString().split('T')[0]
        trends.push(dateStats[dateKey] || { date: dateKey, revenue: 0, orders: 0 })
      }
    } else if (period === 'month') {
      for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
        trends.push(dateStats[dateKey] || { date: dateKey, revenue: 0, orders: 0 })
      }
    }

    return NextResponse.json(trends)
  })
}
