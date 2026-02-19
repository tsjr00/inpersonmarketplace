import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getFtTierExtras } from '@/lib/vendor-limits'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/analytics/overview', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-analytics-overview:${clientIp}`, rateLimits.api)
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

    // FT tier-based analytics day clamping
    let maxDays: number | undefined
    if (vendorProfile.vertical_id === 'food_trucks') {
      const extras = getFtTierExtras(vendorProfile.tier || 'free')
      maxDays = extras.analyticsDays
      if (maxDays === 0) {
        return NextResponse.json({ totalRevenue: 0, totalOrders: 0, averageOrderValue: 0, completedOrders: 0, pendingOrders: 0, cancelledOrders: 0, maxDays: 0 })
      }
      const earliest = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      if (startDate < earliest) startDate = earliest
    }

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

    const totalOrders = (orderItems || []).length
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
