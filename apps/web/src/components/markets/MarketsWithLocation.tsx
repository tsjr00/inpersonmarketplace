'use client'

import { useState, useEffect } from 'react'
import LocationSearchInline from '@/components/location/LocationSearchInline'
import MarketCard from '@/components/markets/MarketCard'
import { colors, spacing, typography, radius as radiusToken, shadows } from '@/lib/design-tokens'
import { InlineLoading, Spinner } from '@/components/shared/Spinner'
import { term } from '@/lib/vertical'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

const DEFAULT_RADIUS = 25
const PAGE_SIZE = 35

interface Market {
  id: string
  name: string
  market_type: 'traditional' | 'private_pickup' | 'event'
  description?: string
  address?: string
  city?: string
  state?: string
  active: boolean
  schedules?: Array<{
    id: string
    day_of_week: number
    start_time: string
    end_time: string
    active: boolean
  }>
  vendor_count?: number
  distance_miles?: number
}

interface MarketsWithLocationProps {
  vertical: string
  initialMarkets: Market[]
  cities: string[]
  currentCity?: string
  currentSearch?: string
  /** Server-side location from cookie/profile - skips initial API call */
  initialLocation?: {
    latitude: number
    longitude: number
    locationText: string
    radius?: number
  } | null
  /** Custom radius options per vertical */
  radiusOptions?: number[]
  /** Optional content rendered between location bar and results (e.g. filters) */
  filtersSlot?: React.ReactNode
}

export default function MarketsWithLocation({
  vertical,
  initialMarkets,
  cities,
  currentCity,
  currentSearch,
  initialLocation,
  radiusOptions,
  filtersSlot
}: MarketsWithLocationProps) {
  const locale = getClientLocale()
  // Initialize state from server-provided location (if available)
  const [hasLocation, setHasLocation] = useState<boolean | null>(initialLocation ? true : null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(
    initialLocation ? { lat: initialLocation.latitude, lng: initialLocation.longitude } : null
  )
  const [locationText, setLocationText] = useState(initialLocation?.locationText || '')
  const [radius, setRadius] = useState(initialLocation?.radius || DEFAULT_RADIUS)
  // Start with initialMarkets to show content immediately while location loads
  const [markets, setMarkets] = useState<Market[]>(initialMarkets)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // If we have initialLocation, we can skip the API check
  const [locationChecked, setLocationChecked] = useState(!!initialLocation)
  // Track if we've done a location-based search yet (to know if we're showing preliminary data)
  const [hasLocationResults, setHasLocationResults] = useState(false)
  // Pagination state
  const [totalMarkets, setTotalMarkets] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [currentOffset, setCurrentOffset] = useState(0)

  // Check for saved location on mount - ONLY if no initialLocation provided
  useEffect(() => {
    if (!initialLocation) {
      checkSavedLocation()
    }
  }, [])

  // Re-fetch when filters or radius change (and we have location)
  // Only run after initial location check to avoid race condition
  useEffect(() => {
    if (!locationChecked) return // Wait for initial location check

    if (userLocation) {
      // Reset pagination when filters change
      setCurrentOffset(0)
      fetchNearbyMarkets(userLocation.lat, userLocation.lng, 0)
    } else {
      // No location set - show empty state (user needs to enter location)
      setMarkets([])
      setTotalMarkets(0)
      setHasMore(false)
    }
  }, [currentCity, currentSearch, radius, locationChecked])

  const checkSavedLocation = async () => {
    try {
      const response = await fetch('/api/buyer/location')
      const data = await response.json()

      if (data.hasLocation) {
        setHasLocation(true)
        setUserLocation({ lat: data.latitude, lng: data.longitude })
        setLocationText(data.locationText || t('location.your_location', locale))
        if (data.radius) setRadius(data.radius)
        // Fetch nearby markets and then mark location as checked
        await fetchNearbyMarkets(data.latitude, data.longitude, 0)
      } else {
        setHasLocation(false)
      }
    } catch (error) {
      console.error('Error checking location:', error)
      setHasLocation(false)
    } finally {
      setLocationChecked(true)
    }
  }

  const fetchNearbyMarkets = async (lat: number, lng: number, offset: number = 0, append: boolean = false) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        vertical,
        radius: radius.toString(),
        limit: PAGE_SIZE.toString(),
        offset: offset.toString(),
        type: 'traditional' // Only fetch traditional markets
      })

      // Include city and search filters if set
      if (currentCity) {
        params.set('city', currentCity)
      }
      if (currentSearch) {
        params.set('search', currentSearch)
      }

      const response = await fetch(`/api/markets/nearby?${params}`)
      const data = await response.json()

      if (data.markets) {
        const mappedMarkets = data.markets.map((m: Record<string, unknown>) => ({
          ...m,
          market_type: (m.market_type || 'traditional') as 'traditional' | 'private_pickup',
          active: (m.active as boolean) ?? ((m.status as string) === 'active'),
          schedules: m.market_schedules as Market['schedules'],
          vendor_count: (m.vendor_count as number) || 0
        }))

        if (append) {
          setMarkets(prev => [...prev, ...mappedMarkets])
        } else {
          setMarkets(mappedMarkets)
        }

        setTotalMarkets(data.total || mappedMarkets.length)
        setHasMore(data.hasMore || false)
        setCurrentOffset(offset + mappedMarkets.length)
        setHasLocationResults(true)
      }
    } catch (error) {
      console.error('Error fetching nearby markets:', error)
      // On error, keep showing initialMarkets rather than empty state
      // so user still sees something useful
      setHasLocationResults(true) // Mark as "done" even on error to stop loading indicator
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleLoadMore = () => {
    if (userLocation && hasMore && !loadingMore) {
      fetchNearbyMarkets(userLocation.lat, userLocation.lng, currentOffset, true)
    }
  }

  const handleRadiusChange = async (newRadius: number) => {
    setRadius(newRadius)
    // Save radius to cookie via API
    try {
      await fetch('/api/buyer/location', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radius: newRadius })
      })
    } catch {
      // Ignore errors - radius will still work locally
    }
  }

  const handleLocationSet = async (lat: number, lng: number, source: 'gps' | 'manual', providedLocationText?: string) => {
    setUserLocation({ lat, lng })
    setHasLocation(true)
    setCurrentOffset(0)

    // Use provided location text if available, otherwise fetch from API
    if (providedLocationText) {
      setLocationText(providedLocationText)
    } else {
      // Get location text from API for GPS-based location
      try {
        const response = await fetch('/api/buyer/location')
        const data = await response.json()
        setLocationText(data.locationText || (source === 'gps' ? t('location.current_location', locale) : t('location.your_location', locale)))
      } catch {
        setLocationText(source === 'gps' ? t('location.current_location', locale) : t('location.your_location', locale))
      }
    }
    fetchNearbyMarkets(lat, lng, 0)
  }

  const handleClearLocation = () => {
    setHasLocation(false)
    setUserLocation(null)
    setLocationText('')
    setTotalMarkets(0)
    setHasMore(false)
    setCurrentOffset(0)
    // Clear markets - user needs to enter new location
    setMarkets([])
  }

  return (
    <div>
      {/* Compact Inline Location Search */}
      <div style={{ marginBottom: spacing.sm }}>
        <LocationSearchInline
          onLocationSet={handleLocationSet}
          hasLocation={hasLocation || false}
          locationText={locationText}
          onClear={handleClearLocation}
          labelPrefix={t('markets.nearby', locale)}
          radius={radius}
          onRadiusChange={handleRadiusChange}
          radiusOptions={radiusOptions}
        />
      </div>

      {/* Filters slot — injected from page (e.g. MarketFilters) */}
      {filtersSlot}

      {/* Location prompt card - show when no location is set and location check is complete */}
      {locationChecked && !hasLocation && (
        <div style={{
          padding: spacing.md,
          marginBottom: spacing.md,
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: radiusToken.lg,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 24, marginBottom: spacing.xs }}>📍</div>
          <p style={{
            margin: 0,
            color: '#1e40af',
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.medium
          }}>
            {t('markets.enter_zip', locale)}
          </p>
        </div>
      )}

      {/* Loading indicator - only show blocking state if no markets to display */}
      {loading && markets.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: spacing.md,
          color: colors.textMuted
        }}>
          {t('markets.loading', locale)}
        </div>
      )}

      {/* Results count with loading/refining indicator */}
      <div style={{
        marginBottom: spacing.sm,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        flexWrap: 'wrap'
      }}>
        {loading && markets.length > 0 ? (
          // Show refining message when we have preliminary results
          <InlineLoading message={t('markets.finding', locale)} />
        ) : hasLocationResults && hasLocation ? (
          // Show "Showing X of Y" when we have location results
          <span>
            {totalMarkets > markets.length
              ? t('markets.showing_of', locale, { count: String(markets.length), total: String(totalMarkets), radius: String(radius) })
              : t('markets.found_within', locale, { count: String(markets.length), s: markets.length !== 1 ? 's' : '', radius: String(radius) })
            }
          </span>
        ) : (
          <span>
            {t('markets.found', locale, { count: String(markets.length), s: markets.length !== 1 ? 's' : '' })}
            {!hasLocationResults && markets.length > 0 && !hasLocation && ` ${t('markets.enter_zip_suffix', locale)}`}
          </span>
        )}
      </div>

      {/* Market grid - show even while loading if we have markets */}
      {markets.length > 0 ? (
        <div
          className="markets-grid"
          style={{
            display: 'grid',
            gap: spacing.md,
          }}
        >
          {markets.map(market => (
            <MarketCard key={market.id} market={market} vertical={vertical} />
          ))}
        </div>
      ) : !loading ? (
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radiusToken.lg,
          padding: spacing['3xl'],
          textAlign: 'center',
          boxShadow: shadows.sm,
          border: `1px solid ${colors.border}`
        }}>
          <div style={{ fontSize: '3rem', marginBottom: spacing.sm }}>{term(vertical, 'no_results_market_emoji', locale)}</div>
          <p style={{ color: colors.textSecondary, fontSize: typography.sizes.lg, margin: 0, fontWeight: typography.weights.medium }}>
            {hasLocation
              ? t('markets.no_found_radius', locale, { markets: term(vertical, 'traditional_markets', locale).toLowerCase(), radius: String(radius) })
              : t('markets.no_found_filters', locale, { markets: term(vertical, 'traditional_markets', locale).toLowerCase() })}
          </p>
          <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, marginTop: spacing.sm, maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
            {t('markets.private_note', locale, { vendors: term(vertical, 'vendors', locale).toLowerCase() })}
          </p>
          <a
            href={`/${vertical}/browse`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              marginTop: spacing.md,
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: colors.primary,
              color: colors.textInverse,
              borderRadius: radiusToken.full,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              textDecoration: 'none',
              minHeight: 44,
            }}
          >
            {t('markets.browse_products', locale)}
          </a>
          <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, marginTop: spacing.md }}>
            {t('markets.look_for_private', locale, { vendors: term(vertical, 'vendors', locale).toLowerCase() })}
          </p>
        </div>
      ) : null}

      {/* Load More button */}
      {hasMore && !loading && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: spacing.lg
        }}>
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              padding: `${spacing.sm} ${spacing.xl}`,
              backgroundColor: loadingMore ? '#e5e7eb' : '#3b82f6',
              color: loadingMore ? '#6b7280' : 'white',
              border: 'none',
              borderRadius: radiusToken.md,
              fontSize: typography.sizes.base,
              fontWeight: 600,
              cursor: loadingMore ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs
            }}
          >
            {loadingMore ? (
              <InlineLoading message={t('markets.loading_more', locale)} color="#6b7280" />
            ) : (
              t('markets.load_more', locale, { count: String(Math.min(PAGE_SIZE, totalMarkets - markets.length)) })
            )}
          </button>
        </div>
      )}

      {/* Responsive grid - cards fill available space with minimum width */}
      <style>{`
        .markets-grid {
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        }
      `}</style>
    </div>
  )
}
