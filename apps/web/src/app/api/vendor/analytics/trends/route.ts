import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getFtTierExtras } from '@/lib/vendor-limits'

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

    // FT tier-based analytics day clamping
    if (vendorProfile.vertical_id === 'food_trucks') {
      const extras = getFtTierExtras(vendorProfile.tier || 'free')
      if (extras.analyticsDays === 0) {
        return NextResponse.json([])
      }
      const earliest = new Date(Date.now() - extras.analyticsDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      if (startDate < earliest) startDate = earliest
    }

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

    // Group by period in JS
    const dateStats: Record<string, { date: string; revenue: number; orders: number }> = {}
    for (const item of orderItems || []) {
      const date = new Date(item.created_at)
      let periodKey: string

      if (period === 'week') {
        const day = date.getUTCDay()
        const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1)
        const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff))
        periodKey = weekStart.toISOString().split('T')[0]
      } else if (period === 'month') {
        periodKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
      } else {
        periodKey = date.toISOString().split('T')[0]
      }

      if (!dateStats[periodKey]) {
        dateStats[periodKey] = { date: periodKey, revenue: 0, orders: 0 }
      }
      dateStats[periodKey].orders++
      if (item.status === 'fulfilled' || item.status === 'completed') {
        dateStats[periodKey].revenue += item.subtotal_cents || 0
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
