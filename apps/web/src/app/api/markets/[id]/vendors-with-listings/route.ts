import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ListingMarketData {
  listing_id: string
  listings: {
    id: string
    title: string
    category: string | null
    status: string
    vendor_profile_id: string
    vendor_profiles: {
      id: string
      profile_data: Record<string, unknown>
      status: string
      profile_image_url: string | null
    }
  }
}

interface VendorWithListings {
  vendor_profile_id: string
  business_name: string
  profile_image_url: string | null
  categories: string[]
  listing_count: number
}

// GET /api/markets/[id]/vendors-with-listings - Get vendors with published listings at this market
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: marketId } = await params

  // Verify market exists and is traditional (not private pickup)
  const { data: market, error: marketError } = await supabase
    .from('markets')
    .select('id, name, market_type, status')
    .eq('id', marketId)
    .single()

  if (marketError || !market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }

  if (market.status !== 'active') {
    return NextResponse.json({ error: 'Market is not active' }, { status: 400 })
  }

  // Get all published listings at this market with vendor info
  const { data: listingMarkets, error } = await supabase
    .from('listing_markets')
    .select(`
      listing_id,
      listings!inner (
        id,
        title,
        category,
        status,
        vendor_profile_id,
        vendor_profiles!inner (
          id,
          profile_data,
          status,
          profile_image_url
        )
      )
    `)
    .eq('market_id', marketId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Transform and aggregate by vendor
  const vendorMap = new Map<string, VendorWithListings>()

  for (const lm of (listingMarkets as unknown as ListingMarketData[]) || []) {
    const listing = lm.listings

    // Skip non-published listings or non-approved vendors
    if (listing.status !== 'published') continue
    if (listing.vendor_profiles.status !== 'approved') continue

    const vendorId = listing.vendor_profile_id
    const profileData = listing.vendor_profiles.profile_data as Record<string, unknown>
    const businessName = (profileData?.business_name || profileData?.farm_name || 'Unknown') as string

    if (vendorMap.has(vendorId)) {
      const vendor = vendorMap.get(vendorId)!
      vendor.listing_count++
      if (listing.category && !vendor.categories.includes(listing.category)) {
        vendor.categories.push(listing.category)
      }
    } else {
      vendorMap.set(vendorId, {
        vendor_profile_id: vendorId,
        business_name: businessName,
        profile_image_url: listing.vendor_profiles.profile_image_url,
        categories: listing.category ? [listing.category] : [],
        listing_count: 1,
      })
    }
  }

  // Convert to array and sort alphabetically
  const vendors = Array.from(vendorMap.values()).sort((a, b) =>
    a.business_name.localeCompare(b.business_name)
  )

  // Get all unique categories for filtering
  const allCategories = [...new Set(vendors.flatMap(v => v.categories))].sort()

  return NextResponse.json({
    market: {
      id: market.id,
      name: market.name,
      market_type: market.market_type,
    },
    vendors,
    categories: allCategories,
    vendor_count: vendors.length,
  })
}
