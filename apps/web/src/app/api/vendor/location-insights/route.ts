import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getFtTierExtras } from '@/lib/vendor-limits'

const EARTH_RADIUS_MILES = 3959

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_MILES * c
}

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/location-insights', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-location-insights:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const vendorId = searchParams.get('vendor_id')
    const vertical = searchParams.get('vertical')
    const days = Math.min(parseInt(searchParams.get('days') || '30', 10), 90)

    if (!vendorId || !vertical) {
      return NextResponse.json({ error: 'vendor_id and vertical are required' }, { status: 400 })
    }

    // Verify ownership
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, tier, vertical_id')
      .eq('id', vendorId)
      .single()

    if (!vendorProfile || vendorProfile.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Determine tier access
    const extras = getFtTierExtras(vendorProfile.tier || 'free')
    const insightLevel = extras.locationInsights

    if (insightLevel === 'none') {
      return NextResponse.json({ blocked: true, tier: vendorProfile.tier || 'free' })
    }

    // Clamp days: basic capped at 30, pro/boss up to 90
    const maxDays = insightLevel === 'basic' ? 30 : 90
    const effectiveDays = Math.min(days, maxDays)
    const startDate = new Date(Date.now() - effectiveDays * 24 * 60 * 60 * 1000).toISOString()

    // ═══════════════════════════════════════════════════════════
    // BASIC TIER DATA (4 metrics from existing order data)
    // ═══════════════════════════════════════════════════════════

    // Get order items with market info and buyer info
    const { data: orderItems } = await supabase
      .from('order_items')
      .select(`
        id, subtotal_cents, status, created_at, pickup_date,
        market_id, markets!market_id(id, name, city, latitude, longitude),
        order:orders!inner(buyer_user_id)
      `)
      .eq('vendor_profile_id', vendorId)
      .gte('created_at', startDate)
      .not('status', 'in', '("cancelled","refunded")')

    // Get previous order items (for new vs repeat calculation)
    const { data: previousItems } = await supabase
      .from('order_items')
      .select('order:orders!inner(buyer_user_id), market_id')
      .eq('vendor_profile_id', vendorId)
      .lt('created_at', startDate)
      .not('status', 'in', '("cancelled","refunded")')

    const previousBuyersByMarket = new Map<string, Set<string>>()
    for (const item of previousItems || []) {
      const order = Array.isArray((item as any).order) ? (item as any).order[0] : (item as any).order
      const buyerId = order?.buyer_user_id
      if (buyerId && item.market_id) {
        if (!previousBuyersByMarket.has(item.market_id)) {
          previousBuyersByMarket.set(item.market_id, new Set())
        }
        previousBuyersByMarket.get(item.market_id)!.add(buyerId)
      }
    }

    // Group data by market
    type MarketStats = {
      marketId: string
      marketName: string
      city: string
      revenue: number
      orderCount: number
      dayOfWeekCounts: Record<number, number>
      buyers: Set<string>
      newBuyers: Set<string>
      repeatBuyers: Set<string>
    }

    const marketStatsMap = new Map<string, MarketStats>()

    for (const item of orderItems || []) {
      const market = (item as any).markets as { id: string; name: string; city: string } | null
      if (!market || !item.market_id) continue

      if (!marketStatsMap.has(item.market_id)) {
        marketStatsMap.set(item.market_id, {
          marketId: item.market_id,
          marketName: market.name,
          city: market.city || '',
          revenue: 0,
          orderCount: 0,
          dayOfWeekCounts: {},
          buyers: new Set(),
          newBuyers: new Set(),
          repeatBuyers: new Set(),
        })
      }

      const stats = marketStatsMap.get(item.market_id)!
      stats.revenue += item.subtotal_cents || 0
      stats.orderCount++

      // Day of week from pickup_date or created_at
      const dateStr = item.pickup_date || item.created_at
      if (dateStr) {
        const dow = new Date(dateStr).getDay()
        stats.dayOfWeekCounts[dow] = (stats.dayOfWeekCounts[dow] || 0) + 1
      }

      // Buyer tracking
      const order = Array.isArray((item as any).order) ? (item as any).order[0] : (item as any).order
      const buyerId = order?.buyer_user_id
      if (buyerId) {
        stats.buyers.add(buyerId)
        const prevBuyers = previousBuyersByMarket.get(item.market_id)
        if (prevBuyers?.has(buyerId)) {
          stats.repeatBuyers.add(buyerId)
        } else {
          stats.newBuyers.add(buyerId)
        }
      }
    }

    // 1. Revenue by location
    const revenueByLocation = Array.from(marketStatsMap.values())
      .map(s => ({
        marketId: s.marketId,
        marketName: s.marketName,
        city: s.city,
        revenue: s.revenue,
        orderCount: s.orderCount,
      }))
      .sort((a, b) => b.revenue - a.revenue)

    // 2. Peak days by location
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const peakDaysByLocation = Array.from(marketStatsMap.values()).map(s => {
      const days = Object.entries(s.dayOfWeekCounts)
        .map(([dow, count]) => ({ day: dayNames[parseInt(dow)], dayIndex: parseInt(dow), count }))
        .sort((a, b) => b.count - a.count)
      return {
        marketId: s.marketId,
        marketName: s.marketName,
        days,
        peakDay: days[0]?.day || 'N/A',
      }
    })

    // 3. Avg order size by location
    const avgOrderByLocation = Array.from(marketStatsMap.values())
      .map(s => ({
        marketId: s.marketId,
        marketName: s.marketName,
        avgOrderCents: s.orderCount > 0 ? Math.round(s.revenue / s.orderCount) : 0,
        orderCount: s.orderCount,
      }))
      .sort((a, b) => b.avgOrderCents - a.avgOrderCents)

    // 4. New vs repeat by location
    const customerLoyalty = Array.from(marketStatsMap.values())
      .map(s => {
        const total = s.buyers.size
        const repeatCount = s.repeatBuyers.size
        const newCount = s.newBuyers.size
        return {
          marketId: s.marketId,
          marketName: s.marketName,
          totalCustomers: total,
          newCustomers: newCount,
          repeatCustomers: repeatCount,
          repeatPct: total > 0 ? Math.round((repeatCount / total) * 100) : 0,
        }
      })
      .sort((a, b) => b.repeatPct - a.repeatPct)

    const basicData = {
      revenueByLocation,
      peakDaysByLocation,
      avgOrderByLocation,
      customerLoyalty,
      days: effectiveDays,
      maxDays,
    }

    if (insightLevel === 'basic') {
      return NextResponse.json({
        tier: vendorProfile.tier,
        insightLevel,
        ...basicData,
      })
    }

    // ═══════════════════════════════════════════════════════════
    // PRO TIER DATA (+ location scores, missing markets)
    // ═══════════════════════════════════════════════════════════

    // Get vendor's current market locations for proximity search
    const vendorMarketIds = Array.from(marketStatsMap.keys())

    // Also get markets from vendor_market_schedules (may have scheduled markets with no orders yet)
    const { data: vendorSchedules } = await supabase
      .from('vendor_market_schedules')
      .select('market_id, markets(id, latitude, longitude)')
      .eq('vendor_profile_id', vendorId)
      .eq('is_active', true)

    const vendorMarketCoords: { lat: number; lng: number }[] = []
    const allVendorMarketIds = new Set(vendorMarketIds)

    for (const sched of vendorSchedules || []) {
      if (sched.market_id) allVendorMarketIds.add(sched.market_id)
      const m = (sched as any).markets as { latitude: number; longitude: number } | null
      if (m?.latitude && m?.longitude) {
        vendorMarketCoords.push({ lat: Number(m.latitude), lng: Number(m.longitude) })
      }
    }

    // Also pull coords from order items' markets
    for (const item of orderItems || []) {
      const m = (item as any).markets as { latitude: number; longitude: number } | null
      if (m?.latitude && m?.longitude) {
        vendorMarketCoords.push({ lat: Number(m.latitude), lng: Number(m.longitude) })
      }
    }

    // 5. Markets you're missing — active markets in same vertical within 25mi
    const serviceClient = createServiceClient()
    const { data: allMarkets } = await serviceClient
      .from('markets')
      .select('id, name, city, state, latitude, longitude, market_type')
      .eq('vertical_id', vertical)
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    // Count vendors per market (from vendor_market_schedules)
    const { data: marketVendorCounts } = await serviceClient
      .from('vendor_market_schedules')
      .select('market_id')
      .eq('is_active', true)

    const vendorCountMap = new Map<string, number>()
    for (const row of marketVendorCounts || []) {
      vendorCountMap.set(row.market_id, (vendorCountMap.get(row.market_id) || 0) + 1)
    }

    const missingMarkets: {
      marketId: string
      name: string
      city: string
      state: string
      distanceMiles: number
      vendorCount: number
      marketType: string
    }[] = []

    for (const market of allMarkets || []) {
      if (allVendorMarketIds.has(market.id)) continue // Already attending

      const mLat = Number(market.latitude)
      const mLng = Number(market.longitude)

      // Find minimum distance from any of vendor's current markets
      let minDist = Infinity
      for (const coord of vendorMarketCoords) {
        const dist = haversineDistance(coord.lat, coord.lng, mLat, mLng)
        if (dist < minDist) minDist = dist
      }

      if (minDist <= 25) {
        missingMarkets.push({
          marketId: market.id,
          name: market.name,
          city: market.city || '',
          state: market.state || '',
          distanceMiles: Math.round(minDist * 10) / 10,
          vendorCount: vendorCountMap.get(market.id) || 0,
          marketType: market.market_type || 'traditional',
        })
      }
    }

    missingMarkets.sort((a, b) => a.distanceMiles - b.distanceMiles)

    // 6. Location performance score (1-5 composite)
    const locationScores = Array.from(marketStatsMap.values()).map(s => {
      const totalBuyers = s.buyers.size
      const repeatRate = totalBuyers > 0 ? s.repeatBuyers.size / totalBuyers : 0
      const avgTicket = s.orderCount > 0 ? s.revenue / s.orderCount : 0

      // Normalize each factor to 0-5 scale relative to vendor's own data
      const allRevenues = Array.from(marketStatsMap.values()).map(ms => ms.revenue)
      const maxRevenue = Math.max(...allRevenues, 1)
      const allBuyers = Array.from(marketStatsMap.values()).map(ms => ms.buyers.size)
      const maxBuyers = Math.max(...allBuyers, 1)
      const allTickets = Array.from(marketStatsMap.values()).map(ms => ms.orderCount > 0 ? ms.revenue / ms.orderCount : 0)
      const maxTicket = Math.max(...allTickets, 1)

      const volumeScore = (s.revenue / maxRevenue) * 5
      const buyerScore = (totalBuyers / maxBuyers) * 5
      const ticketScore = (avgTicket / maxTicket) * 5
      const repeatScore = repeatRate * 5

      // Weighted average: 30% volume, 25% buyers, 25% ticket, 20% repeat
      const composite = volumeScore * 0.3 + buyerScore * 0.25 + ticketScore * 0.25 + repeatScore * 0.2

      return {
        marketId: s.marketId,
        marketName: s.marketName,
        score: Math.max(1, Math.min(5, Math.round(composite * 10) / 10)),
        factors: {
          volume: Math.round(volumeScore * 10) / 10,
          uniqueBuyers: Math.round(buyerScore * 10) / 10,
          avgTicket: Math.round(ticketScore * 10) / 10,
          repeatRate: Math.round(repeatScore * 10) / 10,
        },
      }
    }).sort((a, b) => b.score - a.score)

    const proData = {
      missingMarkets: missingMarkets.slice(0, 10),
      locationScores,
    }

    if (insightLevel === 'pro') {
      return NextResponse.json({
        tier: vendorProfile.tier,
        insightLevel,
        ...basicData,
        ...proData,
      })
    }

    // ═══════════════════════════════════════════════════════════
    // BOSS TIER DATA (+ buyer density, coverage gaps)
    // ═══════════════════════════════════════════════════════════

    // 7. Buyer density near vendor's markets
    const { data: allBuyerProfiles } = await serviceClient
      .from('user_profiles')
      .select('latitude, longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    const buyerDensity: {
      marketId: string
      marketName: string
      within5mi: number
      within10mi: number
      within25mi: number
    }[] = []

    for (const item of orderItems || []) {
      const market = (item as any).markets as { id: string; name: string; latitude: number; longitude: number } | null
      if (!market?.latitude || !market?.longitude) continue
      // Skip if already processed this market
      if (buyerDensity.some(d => d.marketId === market.id)) continue

      const mLat = Number(market.latitude)
      const mLng = Number(market.longitude)
      let w5 = 0, w10 = 0, w25 = 0

      for (const buyer of allBuyerProfiles || []) {
        const dist = haversineDistance(mLat, mLng, Number(buyer.latitude), Number(buyer.longitude))
        if (dist <= 5) w5++
        if (dist <= 10) w10++
        if (dist <= 25) w25++
      }

      buyerDensity.push({
        marketId: market.id,
        marketName: market.name,
        within5mi: w5,
        within10mi: w10,
        within25mi: w25,
      })
    }

    buyerDensity.sort((a, b) => b.within5mi - a.within5mi)

    // 8. Coverage gaps — aggregate buyer_search_log by zip for vendor's vertical
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: searchLogs } = await serviceClient
      .from('buyer_search_log')
      .select('zip_code, results_count')
      .eq('vertical_id', vertical)
      .gte('created_at', thirtyDaysAgo)
      .not('zip_code', 'is', null)

    // Aggregate by zip
    const zipStats = new Map<string, { total: number; zeroResults: number }>()
    for (const log of searchLogs || []) {
      if (!log.zip_code) continue
      if (!zipStats.has(log.zip_code)) {
        zipStats.set(log.zip_code, { total: 0, zeroResults: 0 })
      }
      const s = zipStats.get(log.zip_code)!
      s.total++
      if (log.results_count === 0) s.zeroResults++
    }

    // Get city/state for top zips
    const topZips = Array.from(zipStats.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)

    const zipCodes = topZips.map(([zip]) => zip)
    const zipDetails = new Map<string, { city: string; state: string }>()

    if (zipCodes.length > 0) {
      const { data: zipData } = await serviceClient
        .from('zip_codes')
        .select('zip, city, state')
        .in('zip', zipCodes)

      for (const z of zipData || []) {
        zipDetails.set(z.zip, { city: z.city, state: z.state })
      }
    }

    const coverageGaps = topZips.map(([zip, stats]) => ({
      zip,
      city: zipDetails.get(zip)?.city || '',
      state: zipDetails.get(zip)?.state || '',
      searchCount: stats.total,
      zeroResultPct: stats.total > 0 ? Math.round((stats.zeroResults / stats.total) * 100) : 0,
    }))

    const bossData = {
      buyerDensity,
      coverageGaps,
    }

    return NextResponse.json({
      tier: vendorProfile.tier,
      insightLevel,
      ...basicData,
      ...proData,
      ...bossData,
    })
  })
}
