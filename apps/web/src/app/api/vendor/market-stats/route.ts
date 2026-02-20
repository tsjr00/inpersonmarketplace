import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPremiumTier, getTierLimits } from '@/lib/vendor-limits'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

// GET - Get market stats for vendor (used in listing form)
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/market-stats', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-market-stats:${clientIp}`, rateLimits.api)
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

      // Get vendor profile with home market
      const { data: vendorProfile, error: vpError } = await supabase
        .from('vendor_profiles')
        .select('id, tier, home_market_id')
        .eq('user_id', user.id)
        .eq('vertical_id', vertical)
        .is('deleted_at', null)
        .single()

      if (vpError || !vendorProfile) {
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

      // Check vendor tier for home market restrictions
      const vendorTier = vendorProfile.tier || 'standard'
      const isVendorPremium = isPremiumTier(vendorTier)
      const tierLimits = getTierLimits(vendorTier)

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

      // Build market stats - now showing account total instead of per-market count
      const marketStats = relevantMarkets.map((market) => {
        const isHomeMarket = market.id === vendorProfile.home_market_id
        const isTraditionalMarket = market.market_type === 'traditional'

        // Determine if vendor can select this market
        let canAdd = canAddMoreListings
        let homeMarketRestricted = false

        if (isTraditionalMarket && !isVendorPremium) {
          // Standard vendor with traditional market
          if (vendorProfile.home_market_id) {
            // Has a home market - can only use that one
            if (!isHomeMarket) {
              canAdd = false
              homeMarketRestricted = true
            }
          }
          // If no home market yet, any traditional market can become home market (first use)
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
          homeMarketRestricted // true if this market is blocked due to home market restriction
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
