import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import VendorFilters from './VendorFilters'
import VendorsWithLocation from './VendorsWithLocation'
import { VendorTierType } from '@/lib/constants'
import { getTierSortPriority } from '@/lib/vendor-limits'
import { colors, spacing, typography, containers } from '@/lib/design-tokens'
import { term, getRadiusOptions } from '@/lib/vertical'
import { getServerLocation } from '@/lib/location/server'

// Cache page for 10 minutes - vendor data changes infrequently
export const revalidate = 600

export async function generateMetadata({ params }: { params: Promise<{ vertical: string }> }): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const isFT = vertical === 'food_trucks'

  return {
    title: isFT
      ? `Find Local Food Trucks | ${branding.brand_name}`
      : `Local Vendors & Cottage Food Sellers | ${branding.brand_name}`,
    description: isFT
      ? 'Find food trucks near you — tacos, BBQ, pizza, burgers, Thai, sushi, and more from verified local operators. Pre-order online and skip the line.'
      : 'Discover verified farmers, cottage food producers, home bakers, and artisans selling at farmers markets near you. Pre-order online for market pickup.',
  }
}

interface VendorsPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{
    market?: string
    category?: string
    search?: string
    sort?: string
    payment?: string
    favorites?: string
  }>
}

export default async function VendorsPage({ params, searchParams }: VendorsPageProps) {
  const { vertical } = await params
  const { market, category, search, sort = 'rating', payment, favorites } = await searchParams
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // PARALLEL PHASE 1: Run location check and vendor query simultaneously
  // These are independent and can run in parallel to reduce waterfall
  const [savedLocation, vendorsResult] = await Promise.all([
    getServerLocation(supabase),
    supabase
      .from('vendor_profiles')
      .select(`
        id,
        profile_data,
        description,
        profile_image_url,
        tier,
        created_at,
        average_rating,
        rating_count,
        venmo_username,
        cashapp_cashtag,
        paypal_username,
        accepts_cash_at_pickup,
        event_approved
      `)
      .eq('vertical_id', vertical)
      .eq('status', 'approved')
  ])

  const { data: vendors, error } = vendorsResult

  if (error) {
    console.error('Error fetching vendors:', error)
  }

  // Get vendor listings count and categories
  const vendorIds = (vendors || []).map(v => v.id)

  let listingsData: { vendor_profile_id: string; category: string | null }[] = []
  let marketVendorsData: { vendor_profile_id: string; market_id: string; market: { id: string; name: string } | null }[] = []

  if (vendorIds.length > 0) {
    // PARALLEL PHASE 2: Run listings and market queries simultaneously
    // Both depend on vendorIds but are independent of each other
    const [listingsResult, marketVendorsResult] = await Promise.all([
      supabase
        .from('listings')
        .select('vendor_profile_id, category')
        .in('vendor_profile_id', vendorIds)
        .eq('status', 'published')
        .is('deleted_at', null),
      supabase
        .from('market_vendors')
        .select(`
          vendor_profile_id,
          market_id,
          markets (
            id,
            name
          )
        `)
        .in('vendor_profile_id', vendorIds)
        .eq('status', 'approved')
    ])

    listingsData = listingsResult.data || []

    // Transform the data to match expected shape
    // Note: markets is a single related record but Supabase types it as potentially an array
    marketVendorsData = (marketVendorsResult.data || []).map(mv => {
      const marketData = mv.markets as unknown as { id: string; name: string } | null
      return {
        vendor_profile_id: mv.vendor_profile_id as string,
        market_id: mv.market_id as string,
        market: marketData
      }
    })
  }

  // Build vendor data with enriched info
  const enrichedVendors = (vendors || []).map(vendor => {
    const profileData = vendor.profile_data as Record<string, unknown>
    const vendorName = (profileData?.business_name as string) ||
                       (profileData?.farm_name as string) ||
                       'Vendor'

    // Get listing count and categories for this vendor
    const vendorListings = listingsData.filter(l => l.vendor_profile_id === vendor.id)
    const listingCount = vendorListings.length
    const categories = [...new Set(vendorListings.map(l => l.category).filter(Boolean))] as string[]

    // Get markets for this vendor
    const vendorMarkets = marketVendorsData
      .filter(mv => mv.vendor_profile_id === vendor.id && mv.market)
      .map(mv => mv.market!)

    return {
      id: vendor.id,
      name: vendorName,
      description: vendor.description as string | null,
      imageUrl: vendor.profile_image_url as string | null,
      tier: (vendor.tier || 'free') as VendorTierType,
      createdAt: vendor.created_at,
      averageRating: vendor.average_rating as number | null,
      ratingCount: vendor.rating_count as number | null,
      listingCount,
      categories,
      markets: vendorMarkets,
      eventApproved: (vendor.event_approved as boolean) || false,
      paymentMethods: {
        venmo: vendor.venmo_username as string | null,
        cashapp: vendor.cashapp_cashtag as string | null,
        paypal: vendor.paypal_username as string | null,
        cash: (vendor.accepts_cash_at_pickup as boolean) || false,
      }
    }
  })

  // Apply filters
  // First, exclude vendors with no active listings (they have nothing to sell)
  let filteredVendors = enrichedVendors.filter(v => v.listingCount > 0)

  // Filter by market
  if (market) {
    filteredVendors = filteredVendors.filter(v =>
      v.markets.some(m => m.id === market)
    )
  }

  // Filter by category
  if (category) {
    filteredVendors = filteredVendors.filter(v =>
      v.categories.includes(category)
    )
  }

  // Filter by search
  if (search) {
    const searchLower = search.toLowerCase()
    filteredVendors = filteredVendors.filter(v =>
      v.name.toLowerCase().includes(searchLower) ||
      (v.description?.toLowerCase().includes(searchLower))
    )
  }

  // Filter by payment method
  if (payment) {
    filteredVendors = filteredVendors.filter(v => {
      switch (payment) {
        case 'cards': return true // All vendors accept cards via Stripe
        case 'venmo': return !!v.paymentMethods.venmo
        case 'cashapp': return !!v.paymentMethods.cashapp
        case 'paypal': return !!v.paymentMethods.paypal
        case 'cash': return v.paymentMethods.cash
        default: return true
      }
    })
  }

  // Apply sorting - premium vendors always shown first
  filteredVendors.sort((a, b) => {
    // Higher-tier vendors first (works for both FM and FT tiers)
    const aTier = getTierSortPriority(a.tier, vertical)
    const bTier = getTierSortPriority(b.tier, vertical)
    if (aTier !== bTier) return aTier - bTier

    // Then apply secondary sort
    switch (sort) {
      case 'rating':
        // Vendors with ratings first, then by rating desc
        if (a.averageRating && !b.averageRating) return -1
        if (!a.averageRating && b.averageRating) return 1
        if (a.averageRating && b.averageRating) return b.averageRating - a.averageRating
        return a.name.localeCompare(b.name)
      case 'name':
        return a.name.localeCompare(b.name)
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case 'listings':
        return b.listingCount - a.listingCount
      default:
        return 0
    }
  })

  // Get unique markets for filter dropdown
  const allMarkets = [...new Map(
    marketVendorsData
      .filter(mv => mv.market)
      .map(mv => [mv.market!.id, mv.market!])
  ).values()].sort((a, b) => a.name.localeCompare(b.name))

  // Get unique categories for filter dropdown
  const allCategories = [...new Set(
    listingsData.map(l => l.category).filter(Boolean)
  )].sort() as string[]

  return (
    <div style={{
      maxWidth: containers.xl,
      margin: '0 auto',
      padding: `${spacing.md} ${spacing.sm}`,
      backgroundColor: colors.surfaceBase,
      minHeight: '100vh'
    }}>
      {/* Header */}
      <div style={{ marginBottom: spacing.md }}>
        <h1 style={{
          color: branding.colors.primary,
          marginBottom: spacing['2xs'],
          marginTop: 0,
          fontSize: typography.sizes['2xl'],
          fontWeight: typography.weights.bold
        }}>
          {term(vertical, 'vendors_page_title')}
        </h1>
        <p style={{
          color: colors.textSecondary,
          margin: 0,
          fontSize: typography.sizes.base
        }}>
          {term(vertical, 'vendors_page_subtitle')}
        </p>
      </div>

      {/* Vendors with Location Filtering */}
      <VendorsWithLocation
        vertical={vertical}
        initialVendors={filteredVendors}
        currentMarket={market}
        currentCategory={category}
        currentSearch={search}
        currentSort={sort}
        currentPayment={payment}
        initialFavoritesFilter={favorites === 'true'}
        initialLocation={savedLocation}
        radiusOptions={getRadiusOptions(vertical)}
        filtersSlot={
          <VendorFilters
            currentMarket={market}
            currentCategory={category}
            currentSearch={search}
            currentSort={sort}
            currentPayment={payment}
            markets={allMarkets}
            categories={allCategories}
          />
        }
      />
    </div>
  )
}
