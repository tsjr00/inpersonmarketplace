import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/analytics/trends', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-analytics-trends:${clientIp}`, rateLimits.api)
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
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

    if (!vendorId) {
      return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
    }

    // Verify the user owns this vendor profile
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, user_id')
      .eq('id', vendorId)
      .single()

    if (!vendorProfile || vendorProfile.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to view this vendor analytics' }, { status: 403 })
    }

    // Get aggregated trends from SQL function (GROUP BY instead of fetch-all)
    const { data: rpcData, error } = await supabase.rpc('get_vendor_revenue_trends', {
      p_vendor_id: vendorId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_period: period,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Build lookup map from SQL results
    const dateStats: Record<string, { date: string; revenue: number; orders: number }> = {}
    for (const row of rpcData || []) {
      const dateKey = row.period_date
      dateStats[dateKey] = { date: dateKey, revenue: Number(row.revenue), orders: Number(row.orders) }
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
