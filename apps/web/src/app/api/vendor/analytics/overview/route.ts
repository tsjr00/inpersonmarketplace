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
      const extras = getFtTierExtras(vendorProfile.tier || 'basic')
      maxDays = extras.analyticsDays
      const earliest = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      if (startDate < earliest) startDate = earliest
    }

    // Get transactions with listing data for this vendor in date range
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        id,
        status,
        created_at,
        listing:listings(price_cents)
      `)
      .eq('vendor_profile_id', vendorId)
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate metrics
    const allTransactions = transactions || []

    let totalRevenue = 0
    let completedOrders = 0
    let pendingOrders = 0
    let cancelledOrders = 0

    for (const tx of allTransactions) {
      // Supabase returns relations as arrays, get first element
      const listingData = tx.listing as unknown
      const listing = Array.isArray(listingData) ? listingData[0] : listingData
      const priceCents = (listing as { price_cents?: number })?.price_cents || 0

      // Count by status
      if (tx.status === 'fulfilled') {
        completedOrders++
        totalRevenue += priceCents
      } else if (tx.status === 'accepted' || tx.status === 'initiated') {
        pendingOrders++
      } else if (tx.status === 'canceled' || tx.status === 'declined') {
        cancelledOrders++
      }
    }

    const totalOrders = allTransactions.length
    const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0

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
