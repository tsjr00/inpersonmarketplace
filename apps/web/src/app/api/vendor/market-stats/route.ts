import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPremiumTier, getTierLimits, getTraditionalMarketUsage } from '@/lib/vendor-limits'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

// GET - Get market stats for vendor (used in listing form)
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/market-stats', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-market-stats:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const supabase = await createClient()

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { searchParams } = new URL(request.url)
      const vertical = searchParams.get('vertical')
      const listingId = searchParams.get('listingId') // Optional - for edit mode

      if (!vertical) {
        return NextResponse.json({ error: 'Vertical required' }, { status: 400 })
      }

      // Multi-vertical safe vendor profile lookup via shared utility
      const { profile: vendorProfile, error: vpError } = await getVendorProfileForVertical<{
        id: string
        tier: string | null
        home_market_id: string | null
        deleted_at: string | null
      }>(supabase, user.id, vertical, 'id, tier, home_market_id, deleted_at')

      if (vpError || !vendorProfile || vendorProfile.deleted_at !== null) {
        return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
      }

      // Get all active markets for this vertical (both fixed and vendor's private pickup)
      const { data: allMarkets, error: marketsError } = await supabase
        .from('markets')
        .select('id, name, market_type, address, city, state, day_of_week, start_time, end_time, vendor_profile_id')
        .eq('vertical_id', vertical)
        .eq('status', 'active')
        .order('market_type')
        .order('name')

      if (marketsError) {
        console.error('[/api/vendor/market-stats] Error fetching markets:', marketsError)
        return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 })
      }

      // Filter markets: show traditional markets + events + vendor's own private pickup markets
      const relevantMarkets = (allMarkets || []).filter(m =>
        m.market_type === 'traditional' || m.market_type === 'event' || m.vendor_profile_id === vendorProfile.id
      )

      const vendorTier = vendorProfile.tier || 'free'
      const isVendorPremium = isPremiumTier(vendorTier, vertical)
      const tierLimits = getTierLimits(vendorTier, vertical)

      // Get TOTAL listing count for this vendor (per-account, not per-market)
      // Count published listings that aren't soft-deleted
      const { count: totalListingCount } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('status', 'published')
        .is('deleted_at', null)

      const currentTotalListings = totalListingCount || 0

      // If editing an existing listing, it doesn't count against the limit
      // (vendor is updating, not creating new)
      const effectiveCount = listingId ? currentTotalListings - 1 : currentTotalListings
      const canAddMoreListings = effectiveCount < tierLimits.productListings

      // Get the vendor's current unique traditional market count for per-tier cap enforcement.
      // Session 70: replaces the stale home_market-based restriction.
      const traditionalUsage = await getTraditionalMarketUsage(supabase, vendorProfile.id)
      const usedTraditionalIds = new Set(traditionalUsage.marketIds)
      const canAddNewTraditional = traditionalUsage.count < tierLimits.traditionalMarkets

      // Build market stats - now showing account total instead of per-market count
      const marketStats = relevantMarkets.map((market) => {
        const isHomeMarket = market.id === vendorProfile.home_market_id
        const isTraditionalMarket = market.market_type === 'traditional'

        // Determine if vendor can select this market:
        // 1. Must have room under the total listing count cap
        // 2. For NEW traditional markets (not already in vendor's usage),
        //    must have room under the traditional market count cap
        // 3. Premium vendors still get the cap, but their cap is higher
        let canAdd = canAddMoreListings
        let marketLimitReached = false

        if (canAdd && isTraditionalMarket && !usedTraditionalIds.has(market.id)) {
          if (!canAddNewTraditional) {
            canAdd = false
            marketLimitReached = true
          }
        }

        return {
          id: market.id,
          name: market.name,
          market_type: market.market_type,
          address: market.address,
          city: market.city,
          state: market.state,
          day_of_week: market.day_of_week,
          start_time: market.start_time,
          end_time: market.end_time,
          currentCount: currentTotalListings, // Account total, same for all markets
          limit: tierLimits.productListings,
          canAdd,
          isVendorOwned: market.vendor_profile_id === vendorProfile.id,
          isHomeMarket,
          // Kept for backward compatibility with clients that still read it — always false now
          homeMarketRestricted: false,
          marketLimitReached, // true if this market is blocked due to traditional market count cap
        }
      })

      // Get current listing's markets if editing
      let currentMarketIds: string[] = []
      if (listingId) {
        const { data: currentMarkets } = await supabase
          .from('listing_markets')
          .select('market_id')
          .eq('listing_id', listingId)

        if (currentMarkets) {
          currentMarketIds = currentMarkets.map(m => m.market_id)
        }
      }

      return NextResponse.json({
        markets: marketStats,
        currentMarketIds,
        vendorTier,
        homeMarketId: vendorProfile.home_market_id,
        isPremium: isVendorPremium,
        totalListings: currentTotalListings,
        traditionalMarketCount: traditionalUsage.count,
        tierLimits: {
          traditionalMarkets: tierLimits.traditionalMarkets,
          productListings: tierLimits.productListings
        }
      })
    } catch (error) {
      console.error('[/api/vendor/market-stats] Unexpected error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
