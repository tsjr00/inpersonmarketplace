import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { defaultBranding } from '@/lib/branding'
import VendorFilters from './VendorFilters'
import VendorsWithLocation from './VendorsWithLocation'
import { VendorTierType } from '@/lib/constants'
import { colors, spacing, typography, containers } from '@/lib/design-tokens'

const LOCATION_COOKIE_NAME = 'user_location'
const DEFAULT_RADIUS = 25
const VALID_RADIUS_OPTIONS = [10, 25, 50, 100]

// Helper to get location from cookie or user profile
async function getServerLocation(supabase: Awaited<ReturnType<typeof createClient>>) {
  // Get cookie data first (needed for radius even if user is authenticated)
  const cookieStore = await cookies()
  const locationCookie = cookieStore.get(LOCATION_COOKIE_NAME)
  let cookieRadius = DEFAULT_RADIUS

  if (locationCookie) {
    try {
      const cookieData = JSON.parse(locationCookie.value)
      if (typeof cookieData.radius === 'number' && VALID_RADIUS_OPTIONS.includes(cookieData.radius)) {
        cookieRadius = cookieData.radius
      }
    } catch {
      // Invalid cookie, use default radius
    }
  }

  // First try to get from user profile if authenticated
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('preferred_latitude, preferred_longitude, location_source, location_text')
      .eq('user_id', user.id)
      .single()

    if (profile?.preferred_latitude && profile?.preferred_longitude) {
      return {
        latitude: profile.preferred_latitude,
        longitude: profile.preferred_longitude,
        locationText: profile.location_text || (profile.location_source === 'gps' ? 'Current location' : 'Your location'),
        radius: cookieRadius
      }
    }
  }

  // Fall back to cookie for location
  if (locationCookie) {
    try {
      const { latitude, longitude, locationText, source, radius } = JSON.parse(locationCookie.value)
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        const validRadius = typeof radius === 'number' && VALID_RADIUS_OPTIONS.includes(radius)
          ? radius
          : DEFAULT_RADIUS
        return {
          latitude,
          longitude,
          locationText: locationText || (source === 'gps' ? 'Current location' : 'Your location'),
          radius: validRadius
        }
      }
    } catch {
      // Invalid cookie, ignore
    }
  }

  return null
}

// Cache page for 10 minutes - vendor data changes infrequently
export const revalidate = 600

interface VendorsPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{
    market?: string
    category?: string
    search?: string
    sort?: string
  }>
}

export default async function VendorsPage({ params, searchParams }: VendorsPageProps) {
  const { vertical } = await params
  const { market, category, search, sort = 'rating' } = await searchParams
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

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
        rating_count
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
      tier: (vendor.tier || 'standard') as VendorTierType,
      createdAt: vendor.created_at,
      averageRating: vendor.average_rating as number | null,
      ratingCount: vendor.rating_count as number | null,
      listingCount,
      categories,
      markets: vendorMarkets
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

  // Apply sorting - premium vendors always shown first
  filteredVendors.sort((a, b) => {
    // Premium/featured vendors first (featured > premium > standard)
    const tierOrder: Record<string, number> = { featured: 0, premium: 1, standard: 2 }
    const aTier = tierOrder[a.tier] ?? 2
    const bTier = tierOrder[b.tier] ?? 2
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
          Local Vendors
        </h1>
        <p style={{
          color: colors.textSecondary,
          margin: 0,
          fontSize: typography.sizes.base
        }}>
          Discover and connect with local farmers, artisans, and producers
        </p>
      </div>

      {/* Filters */}
      <VendorFilters
        currentMarket={market}
        currentCategory={category}
        currentSearch={search}
        currentSort={sort}
        markets={allMarkets}
        categories={allCategories}
      />

      {/* Vendors with Location Filtering */}
      <VendorsWithLocation
        vertical={vertical}
        initialVendors={filteredVendors}
        currentMarket={market}
        currentCategory={category}
        currentSearch={search}
        currentSort={sort}
        initialLocation={savedLocation}
      />
    </div>
  )
}
