import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Debug endpoint to check vendor data - remove after debugging
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const searchParams = request.nextUrl.searchParams
    const vertical = searchParams.get('vertical') || 'farmers_market'

    // Get all approved vendors
    const { data: vendors, error: vendorError } = await supabase
      .from('vendor_profiles')
      .select('id, profile_data, status, latitude, longitude, tier')
      .eq('vertical_id', vertical)
      .eq('status', 'approved')

    if (vendorError) {
      return NextResponse.json({ error: 'Failed to fetch vendors', details: vendorError }, { status: 500 })
    }

    const vendorIds = vendors?.map(v => v.id) || []

    // Get market_vendors entries (explicit vendor-market relationships)
    const { data: marketVendors, error: mvError } = await supabase
      .from('market_vendors')
      .select(`
        vendor_profile_id,
        market_id,
        status,
        markets (
          id,
          name,
          latitude,
          longitude,
          market_type
        )
      `)
      .in('vendor_profile_id', vendorIds)

    // Get listing_markets entries (listings at markets)
    const { data: listingMarkets, error: lmError } = await supabase
      .from('listing_markets')
      .select(`
        listing_id,
        market_id,
        listings!inner (
          id,
          title,
          vendor_profile_id,
          status
        ),
        markets (
          id,
          name,
          latitude,
          longitude
        )
      `)
      .eq('listings.status', 'published')

    // Get listings count per vendor
    const { data: listings, error: listError } = await supabase
      .from('listings')
      .select('id, vendor_profile_id, title, status')
      .in('vendor_profile_id', vendorIds)
      .eq('status', 'published')
      .is('deleted_at', null)

    // Build vendor summary
    const vendorSummary = vendors?.map(v => {
      const profileData = v.profile_data as Record<string, unknown>
      const name = (profileData?.business_name as string) ||
                   (profileData?.farm_name as string) ||
                   'Unknown'

      const vendorMarketEntries = marketVendors?.filter(mv => mv.vendor_profile_id === v.id) || []
      const vendorListings = listings?.filter(l => l.vendor_profile_id === v.id) || []
      const vendorListingMarkets = listingMarkets?.filter(lm =>
        (lm.listings as any)?.vendor_profile_id === v.id
      ) || []

      return {
        id: v.id,
        name,
        status: v.status,
        has_direct_coords: v.latitude !== null && v.longitude !== null,
        direct_lat: v.latitude,
        direct_lng: v.longitude,
        listing_count: vendorListings.length,
        market_vendors_entries: vendorMarketEntries.map(mv => ({
          market_id: mv.market_id,
          market_name: (mv.markets as any)?.name,
          market_has_coords: (mv.markets as any)?.latitude !== null,
          mv_status: mv.status,
          issue: mv.status !== 'approved' ? `market_vendors.status=${mv.status}` : null
        })),
        listing_markets_entries: vendorListingMarkets.map(lm => ({
          listing_id: lm.listing_id,
          listing_title: (lm.listings as any)?.title,
          market_id: lm.market_id,
          market_name: (lm.markets as any)?.name,
          market_has_coords: (lm.markets as any)?.latitude !== null
        })),
        issues: [
          vendorListings.length === 0 ? 'no published listings' : null,
          !v.latitude && !v.longitude && vendorMarketEntries.filter(mv => mv.status === 'approved' && (mv.markets as any)?.latitude).length === 0
            ? 'no location (no direct coords and no approved market with coords)' : null,
        ].filter(Boolean)
      }
    })

    return NextResponse.json({
      summary: {
        approved_vendors: vendors?.length || 0,
        vendors_with_direct_coords: vendors?.filter(v => v.latitude && v.longitude).length || 0,
        vendors_with_listings: vendorSummary?.filter(v => v.listing_count > 0).length || 0,
        market_vendors_total: marketVendors?.length || 0,
        listing_markets_total: listingMarkets?.length || 0,
      },
      vendors: vendorSummary,
      raw_market_vendors: marketVendors,
      raw_listing_markets: listingMarkets?.slice(0, 20), // Limit for readability
    })
  } catch (error) {
    console.error('Debug vendors error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
