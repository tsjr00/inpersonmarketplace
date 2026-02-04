import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { defaultBranding } from '@/lib/branding'
import MarketFilters from './MarketFilters'
import MarketsWithLocation from '@/components/markets/MarketsWithLocation'
import { colors, spacing, typography, containers } from '@/lib/design-tokens'
import { getMarketVendorCounts, mergeVendorCounts } from '@/lib/db/markets'

const LOCATION_COOKIE_NAME = 'user_location'

// Helper to get location from cookie or user profile
async function getServerLocation(supabase: Awaited<ReturnType<typeof createClient>>) {
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
        locationText: profile.location_text || (profile.location_source === 'gps' ? 'Current location' : 'Your location')
      }
    }
  }

  // Fall back to cookie
  const cookieStore = await cookies()
  const locationCookie = cookieStore.get(LOCATION_COOKIE_NAME)

  if (locationCookie) {
    try {
      const { latitude, longitude, locationText, source } = JSON.parse(locationCookie.value)
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        return {
          latitude,
          longitude,
          locationText: locationText || (source === 'gps' ? 'Current location' : 'Your location')
        }
      }
    } catch {
      // Invalid cookie, ignore
    }
  }

  return null
}

// Cache page for 10 minutes - markets change infrequently
export const revalidate = 600

interface MarketsPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ city?: string; search?: string; zip?: string }>
}

export default async function MarketsPage({ params, searchParams }: MarketsPageProps) {
  const { vertical } = await params
  const { city, search, zip } = await searchParams
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Build query for traditional markets only (exclude private pickup)
  // Only show approved markets (vendor submissions need admin approval)
  let query = supabase
    .from('markets')
    .select(`
      *,
      market_schedules(*)
    `)
    .eq('vertical_id', vertical)
    .eq('status', 'active')
    .eq('market_type', 'traditional')
    .eq('approval_status', 'approved')
    .order('name', { ascending: true })

  if (city) {
    query = query.ilike('city', `%${city}%`)
  }

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  // PARALLEL PHASE 1: Run location check, markets query, and cities query simultaneously
  // These are independent and can run in parallel to reduce waterfall
  const [savedLocation, marketsResult, allMarketsResult] = await Promise.all([
    getServerLocation(supabase),
    query,
    supabase
      .from('markets')
      .select('city')
      .eq('vertical_id', vertical)
      .eq('status', 'active')
      .eq('market_type', 'traditional')
      .eq('approval_status', 'approved')
      .not('city', 'is', null)
  ])

  const { data: markets, error } = marketsResult
  const { data: allMarkets } = allMarketsResult

  if (error) {
    console.error('Error fetching markets:', error)
  }

  // Proper-case and deduplicate cities (case-insensitive)
  const properCase = (str: string) =>
    str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

  const cityMap = new Map<string, string>()
  allMarkets?.forEach(m => {
    if (m.city) {
      const key = m.city.toLowerCase().trim()
      if (!cityMap.has(key)) {
        cityMap.set(key, properCase(m.city.trim()))
      }
    }
  })
  const cities = Array.from(cityMap.values()).sort()

  // Fetch true vendor counts from the market_vendor_counts view
  const marketIds = markets?.map(m => m.id) || []
  const vendorCounts = marketIds.length > 0
    ? await getMarketVendorCounts(supabase, marketIds)
    : new Map<string, number>()

  // Transform markets data with true vendor counts
  const transformedMarkets = markets?.map(market => ({
    ...market,
    market_type: market.market_type as 'traditional' | 'private_pickup',
    active: market.active ?? (market.status === 'active'),
    schedules: market.market_schedules,
    vendor_count: vendorCounts.get(market.id) || 0,
    market_schedules: undefined,
  })) || []

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
          Farmers Markets
        </h1>
        <p style={{
          color: colors.textSecondary,
          margin: 0,
          fontSize: typography.sizes.base
        }}>
          Discover local farmers markets and shop from vendors in your area
        </p>
      </div>

      {/* Filters */}
      <MarketFilters
        currentCity={city}
        currentSearch={search}
        cities={cities}
      />

      {/* Markets with Location Filtering */}
      <MarketsWithLocation
        vertical={vertical}
        initialMarkets={transformedMarkets}
        cities={cities}
        currentCity={city}
        currentSearch={search}
        initialLocation={savedLocation}
      />
    </div>
  )
}
