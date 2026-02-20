import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import MarketFilters from './MarketFilters'
import MarketsWithLocation from '@/components/markets/MarketsWithLocation'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { term, getRadiusOptions } from '@/lib/vertical'
import { getMarketVendorCounts, mergeVendorCounts } from '@/lib/db/markets'

const LOCATION_COOKIE_NAME = 'user_location'
const DEFAULT_RADIUS = 25
const VALID_RADIUS_OPTIONS = [2, 5, 10, 25, 50, 100]

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

// Cache page for 10 minutes - markets change infrequently
export const revalidate = 600

interface MarketsPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ city?: string; search?: string; zip?: string; state?: string; type?: string }>
}

export default async function MarketsPage({ params, searchParams }: MarketsPageProps) {
  const { vertical } = await params
  const { city, search, zip, state, type: locationType } = await searchParams
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

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

  if (state) {
    query = query.ilike('state', state)
  }

  if (city) {
    query = query.ilike('city', `%${city}%`)
  }

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  // Query for upcoming events
  const todayStr = new Date().toISOString().split('T')[0]
  const eventsQuery = supabase
    .from('markets')
    .select(`
      *,
      market_schedules(*)
    `)
    .eq('vertical_id', vertical)
    .eq('status', 'active')
    .eq('market_type', 'event')
    .eq('approval_status', 'approved')
    .gte('event_end_date', todayStr)
    .order('event_start_date', { ascending: true })

  // PARALLEL PHASE 1: Run location check, markets query, cities query, and events simultaneously
  // These are independent and can run in parallel to reduce waterfall
  const [savedLocation, marketsResult, allMarketsResult, eventsResult] = await Promise.all([
    getServerLocation(supabase),
    query,
    supabase
      .from('markets')
      .select('city, state')
      .eq('vertical_id', vertical)
      .eq('status', 'active')
      .eq('market_type', 'traditional')
      .eq('approval_status', 'approved')
      .not('city', 'is', null),
    eventsQuery
  ])

  const { data: markets, error } = marketsResult
  const { data: allMarkets } = allMarketsResult
  const { data: eventMarkets } = eventsResult

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

  // Extract unique states from markets
  const stateMap = new Map<string, string>()
  allMarkets?.forEach(m => {
    if (m.state) {
      const key = m.state.toLowerCase().trim()
      if (!stateMap.has(key)) {
        stateMap.set(key, m.state.trim().toUpperCase())
      }
    }
  })
  const states = Array.from(stateMap.values()).sort()

  // If state is selected, filter cities to only those in that state
  const filteredCities = state
    ? Array.from(new Set(
        allMarkets
          ?.filter(m => m.city && m.state && m.state.toLowerCase().trim() === state.toLowerCase().trim())
          .map(m => properCase(m.city!.trim()))
      )).sort()
    : cities

  // Fetch true vendor counts from the market_vendor_counts view
  const marketIds = markets?.map(m => m.id) || []
  const vendorCounts = marketIds.length > 0
    ? await getMarketVendorCounts(supabase, marketIds)
    : new Map<string, number>()

  // Transform markets data with true vendor counts
  const transformedMarkets = markets?.map(market => ({
    ...market,
    market_type: market.market_type as 'traditional' | 'private_pickup' | 'event',
    active: market.active ?? (market.status === 'active'),
    schedules: market.market_schedules,
    vendor_count: vendorCounts.get(market.id) || 0,
    market_schedules: undefined,
  })) || []

  // Get event vendor counts
  const eventIds = eventMarkets?.map(m => m.id) || []
  const eventVendorCounts = eventIds.length > 0
    ? await getMarketVendorCounts(supabase, eventIds)
    : new Map<string, number>()

  // Format event date for display
  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

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
          {term(vertical, 'traditional_markets')}
        </h1>
        <p style={{
          color: colors.textSecondary,
          margin: 0,
          fontSize: typography.sizes.base
        }}>
          {vertical === 'food_trucks'
            ? `Discover ${term(vertical, 'traditional_markets').toLowerCase()} and food trucks in your area`
            : `Discover local ${term(vertical, 'traditional_markets').toLowerCase()} and shop from ${term(vertical, 'vendors').toLowerCase()} in your area`
          }
        </p>
      </div>

      {/* Filters */}
      <MarketFilters
        vertical={vertical}
        currentCity={city}
        currentSearch={search}
        currentState={state}
        currentType={locationType}
        cities={filteredCities}
        states={states}
      />

      {/* Upcoming Events Section — hidden when type filter excludes events */}
      {(!locationType || locationType === 'event') && eventMarkets && eventMarkets.length > 0 && (
        <div style={{ marginBottom: spacing.lg }}>
          <h2 style={{
            color: branding.colors.primary,
            margin: `0 0 ${spacing.sm} 0`,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.semibold
          }}>
            {'\u{1F3AA}'} Upcoming {term(vertical, 'events')}
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: spacing.sm
          }}>
            {eventMarkets.map(event => {
              const startDate = event.event_start_date as string
              const endDate = event.event_end_date as string
              const isSingleDay = startDate === endDate
              const vendorCount = eventVendorCounts.get(event.id) || 0
              const address = [event.address, event.city, event.state].filter(Boolean).join(', ')

              return (
                <Link
                  key={event.id}
                  href={`/${vertical}/markets/${event.id}`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
                  <div style={{
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: radius.lg,
                    border: '2px solid #fde68a',
                    padding: spacing.md,
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    cursor: 'pointer'
                  }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: spacing['3xs'],
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      marginBottom: spacing.xs
                    }}>
                      {'\u{1F3AA}'} Event
                    </div>
                    <h3 style={{
                      margin: `0 0 ${spacing['2xs']} 0`,
                      fontSize: typography.sizes.lg,
                      fontWeight: typography.weights.semibold,
                      color: colors.textPrimary
                    }}>
                      {event.name}
                    </h3>
                    <div style={{
                      fontSize: typography.sizes.sm,
                      color: '#92400e',
                      fontWeight: typography.weights.medium,
                      marginBottom: spacing['2xs']
                    }}>
                      {'\u{1F4C5}'} {formatEventDate(startDate)}{!isSingleDay && ` \u2013 ${formatEventDate(endDate)}`}
                    </div>
                    {address && (
                      <div style={{
                        fontSize: typography.sizes.sm,
                        color: colors.textMuted,
                        marginBottom: spacing.xs
                      }}>
                        {'\u{1F4CD}'} {address}
                      </div>
                    )}
                    {event.description && (
                      <p style={{
                        margin: `0 0 ${spacing.xs} 0`,
                        fontSize: typography.sizes.sm,
                        color: colors.textSecondary,
                        lineHeight: typography.leading.relaxed,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {event.description}
                      </p>
                    )}
                    <div style={{
                      fontSize: typography.sizes.sm,
                      color: colors.textMuted,
                      paddingTop: spacing.xs,
                      borderTop: `1px solid ${colors.borderMuted}`
                    }}>
                      {'\u{1F465}'} {vendorCount} {term(vertical, vendorCount !== 1 ? 'vendors' : 'vendor').toLowerCase()}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Markets with Location Filtering — hidden when type filter is events-only */}
      {locationType !== 'event' && (
        <MarketsWithLocation
          vertical={vertical}
          initialMarkets={transformedMarkets}
          cities={cities}
          currentCity={city}
          currentSearch={search}
          initialLocation={savedLocation}
          radiusOptions={getRadiusOptions(vertical)}
        />
      )}
    </div>
  )
}
