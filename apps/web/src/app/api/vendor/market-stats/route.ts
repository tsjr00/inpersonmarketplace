import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Get market stats for vendor (used in listing form)
export async function GET(request: Request) {
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

    // Get vendor profile
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id, tier')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
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

    // Filter markets: show fixed markets + vendor's own private pickup markets
    const relevantMarkets = (allMarkets || []).filter(m =>
      m.market_type === 'fixed' || m.vendor_profile_id === vendorProfile.id
    )

    // Get listing counts per market for this vendor
    const marketStats = await Promise.all(
      relevantMarkets.map(async (market) => {
        // Get count of published listings at this market
        const { data: count } = await supabase
          .rpc('get_vendor_listing_count_at_market', {
            p_vendor_profile_id: vendorProfile.id,
            p_market_id: market.id
          })

        // Check if vendor can add listing to this market
        const { data: canAdd } = await supabase
          .rpc('can_vendor_add_listing_to_market', {
            p_vendor_profile_id: vendorProfile.id,
            p_market_id: market.id,
            p_listing_id: listingId || null
          })

        const limit = vendorProfile.tier === 'premium' ? 10 : 5

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
          currentCount: count || 0,
          limit,
          canAdd: canAdd ?? true,
          isVendorOwned: market.vendor_profile_id === vendorProfile.id
        }
      })
    )

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
      vendorTier: vendorProfile.tier || 'standard'
    })
  } catch (error) {
    console.error('[/api/vendor/market-stats] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
