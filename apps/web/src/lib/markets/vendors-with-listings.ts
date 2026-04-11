import type { SupabaseClient } from '@supabase/supabase-js'

export interface VendorWithListings {
  vendor_profile_id: string
  business_name: string
  profile_image_url: string | null
  categories: string[]
  listing_count: number
}

export interface MarketVendorsResult {
  market: {
    id: string
    name: string
    market_type: string
  } | null
  vendors: VendorWithListings[]
  categories: string[]
  vendor_count: number
  /** Explains why the result might be empty. Callers can surface this for debugging. */
  reason?: 'not_found' | 'not_active' | 'query_error'
  errorMessage?: string
}

interface ListingMarketRow {
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

interface EventListingRow {
  listing_id: string
  vendor_profile_id: string
  listings: {
    id: string
    title: string
    category: string | null
    status: string
  }
  vendor_profiles: {
    id: string
    profile_data: Record<string, unknown>
    status: string
    profile_image_url: string | null
  }
}

/**
 * Fetch the list of vendors with published listings at a market.
 *
 * Used by both the market detail page (server component, calls this directly
 * to avoid a self-HTTP fetch) and the /api/markets/[id]/vendors-with-listings
 * route (which wraps this with auth + rate-limit + cache headers for browser
 * callers).
 *
 * Filters:
 * - Market must exist and have status = 'active'
 * - Listings must be status = 'published'
 * - Vendor profiles must be status = 'approved'
 * - Event markets use event_vendor_listings; others use listing_markets
 *
 * Session 70: extracted from the route to fix the market page rendering 0
 * vendors on Vercel Auth-protected staging previews. The page was doing
 * `fetch('${baseUrl}/api/...')` which got blocked by Vercel's SSO auth layer.
 */
export async function getMarketVendorsWithListings(
  supabase: SupabaseClient,
  marketId: string
): Promise<MarketVendorsResult> {
  const empty: Omit<MarketVendorsResult, 'reason' | 'errorMessage'> = {
    market: null,
    vendors: [],
    categories: [],
    vendor_count: 0,
  }

  const { data: market, error: marketError } = await supabase
    .from('markets')
    .select('id, name, market_type, status')
    .eq('id', marketId)
    .single()

  if (marketError || !market) {
    return { ...empty, reason: 'not_found', errorMessage: marketError?.message }
  }

  if (market.status !== 'active') {
    return {
      market: { id: market.id, name: market.name, market_type: market.market_type },
      vendors: [],
      categories: [],
      vendor_count: 0,
      reason: 'not_active',
    }
  }

  const vendorMap = new Map<string, VendorWithListings>()

  if (market.market_type === 'event') {
    const { data: eventListings, error } = await supabase
      .from('event_vendor_listings')
      .select(`
        listing_id,
        vendor_profile_id,
        listings!inner (
          id,
          title,
          category,
          status
        ),
        vendor_profiles!inner (
          id,
          profile_data,
          status,
          profile_image_url
        )
      `)
      .eq('market_id', marketId)

    if (error) {
      return {
        market: { id: market.id, name: market.name, market_type: market.market_type },
        vendors: [],
        categories: [],
        vendor_count: 0,
        reason: 'query_error',
        errorMessage: error.message,
      }
    }

    for (const el of (eventListings || []) as unknown as EventListingRow[]) {
      if (el.listings.status !== 'published') continue
      if (el.vendor_profiles.status !== 'approved') continue

      const vendorId = el.vendor_profile_id
      const profileData = el.vendor_profiles.profile_data as Record<string, unknown>
      const businessName = (profileData?.business_name || profileData?.farm_name || 'Unknown') as string

      const existing = vendorMap.get(vendorId)
      if (existing) {
        existing.listing_count++
        if (el.listings.category && !existing.categories.includes(el.listings.category)) {
          existing.categories.push(el.listings.category)
        }
      } else {
        vendorMap.set(vendorId, {
          vendor_profile_id: vendorId,
          business_name: businessName,
          profile_image_url: el.vendor_profiles.profile_image_url,
          categories: el.listings.category ? [el.listings.category] : [],
          listing_count: 1,
        })
      }
    }
  } else {
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
      return {
        market: { id: market.id, name: market.name, market_type: market.market_type },
        vendors: [],
        categories: [],
        vendor_count: 0,
        reason: 'query_error',
        errorMessage: error.message,
      }
    }

    for (const lm of (listingMarkets as unknown as ListingMarketRow[]) || []) {
      const listing = lm.listings

      if (listing.status !== 'published') continue
      if (listing.vendor_profiles.status !== 'approved') continue

      const vendorId = listing.vendor_profile_id
      const profileData = listing.vendor_profiles.profile_data as Record<string, unknown>
      const businessName = (profileData?.business_name || profileData?.farm_name || 'Unknown') as string

      const existing = vendorMap.get(vendorId)
      if (existing) {
        existing.listing_count++
        if (listing.category && !existing.categories.includes(listing.category)) {
          existing.categories.push(listing.category)
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
  }

  const vendors = Array.from(vendorMap.values()).sort((a, b) =>
    a.business_name.localeCompare(b.business_name)
  )
  const categories = [...new Set(vendors.flatMap((v) => v.categories))].sort()

  return {
    market: { id: market.id, name: market.name, market_type: market.market_type },
    vendors,
    categories,
    vendor_count: vendors.length,
  }
}
