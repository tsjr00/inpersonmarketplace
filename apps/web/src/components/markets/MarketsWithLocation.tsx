'use client'

import { useState, useEffect } from 'react'
import LocationSearchInline from '@/components/location/LocationSearchInline'
import MarketCard from '@/components/markets/MarketCard'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface Market {
  id: string
  name: string
  market_type: 'traditional' | 'private_pickup'
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
}

export default function MarketsWithLocation({
  vertical,
  initialMarkets,
  cities,
  currentCity,
  currentSearch
}: MarketsWithLocationProps) {
  const [hasLocation, setHasLocation] = useState<boolean | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationText, setLocationText] = useState('')
  // Start with empty array - only show markets after location-based search
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(false)
  const [locationChecked, setLocationChecked] = useState(false)

  // Check for saved location on mount
  useEffect(() => {
    checkSavedLocation()
  }, [])

  // Re-fetch when city or search filters change (and we have location)
  // Only run after initial location check to avoid race condition
  useEffect(() => {
    if (!locationChecked) return // Wait for initial location check

    if (userLocation) {
      fetchNearbyMarkets(userLocation.lat, userLocation.lng)
    } else {
      // No location set - show empty state (user needs to enter location)
      setMarkets([])
    }
  }, [currentCity, currentSearch, locationChecked])

  const checkSavedLocation = async () => {
    try {
      const response = await fetch('/api/buyer/location')
      const data = await response.json()

      if (data.hasLocation) {
        setHasLocation(true)
        setUserLocation({ lat: data.latitude, lng: data.longitude })
        setLocationText(data.locationText || 'Your location')
        // Fetch nearby markets and then mark location as checked
        await fetchNearbyMarkets(data.latitude, data.longitude)
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

  const fetchNearbyMarkets = async (lat: number, lng: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        vertical,
        radius: '25',
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
        setMarkets(data.markets.map((m: Record<string, unknown>) => ({
          ...m,
          market_type: (m.market_type || 'traditional') as 'traditional' | 'private_pickup',
          active: (m.active as boolean) ?? ((m.status as string) === 'active'),
          schedules: m.market_schedules as Market['schedules'],
          vendor_count: (m.vendor_count as number) || 0
        })))
      }
    } catch (error) {
      console.error('Error fetching nearby markets:', error)
      // On error, show empty state rather than unfiltered markets
      setMarkets([])
    } finally {
      setLoading(false)
    }
  }

  const handleLocationSet = async (lat: number, lng: number, source: 'gps' | 'manual', providedLocationText?: string) => {
    setUserLocation({ lat, lng })
    setHasLocation(true)

    // Use provided location text if available, otherwise fetch from API
    if (providedLocationText) {
      setLocationText(providedLocationText)
    } else {
      // Get location text from API for GPS-based location
      try {
        const response = await fetch('/api/buyer/location')
        const data = await response.json()
        setLocationText(data.locationText || (source === 'gps' ? 'Current location' : 'Your location'))
      } catch {
        setLocationText(source === 'gps' ? 'Current location' : 'Your location')
      }
    }
    fetchNearbyMarkets(lat, lng)
  }

  const handleClearLocation = () => {
    setHasLocation(false)
    setUserLocation(null)
    setLocationText('')
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
          labelPrefix="Markets nearby"
        />
      </div>

      {/* Location prompt card - show when no location is set and location check is complete */}
      {locationChecked && !hasLocation && (
        <div style={{
          padding: spacing.md,
          marginBottom: spacing.md,
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: radius.lg,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 24, marginBottom: spacing.xs }}>📍</div>
          <p style={{
            margin: 0,
            color: '#1e40af',
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.medium
          }}>
            Enter your ZIP code above to find markets within 25 miles
          </p>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: spacing['3xl'],
          color: colors.textMuted
        }}>
          Loading nearby markets...
        </div>
      )}

      {/* Results count */}
      {!loading && (
        <div style={{
          marginBottom: spacing.sm,
          color: colors.textMuted,
          fontSize: typography.sizes.sm
        }}>
          {markets.length} market{markets.length !== 1 ? 's' : ''} found
          {hasLocation && ' within 25 miles'}
        </div>
      )}

      {/* Market grid */}
      {!loading && markets.length > 0 ? (
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
          borderRadius: radius.lg,
          padding: spacing['3xl'],
          textAlign: 'center',
          boxShadow: shadows.sm,
          border: `1px solid ${colors.border}`
        }}>
          <div style={{ fontSize: '3rem', marginBottom: spacing.sm }}>🧺</div>
          <p style={{ color: colors.textSecondary, fontSize: typography.sizes.lg, margin: 0, fontWeight: typography.weights.medium }}>
            {hasLocation
              ? 'No farmers markets found within 25 miles'
              : 'No farmers markets found matching your filters'}
          </p>
          <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, marginTop: spacing.sm, maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
            Don't worry! Many vendors offer private pickup locations where you can meet them directly to pick up your order.
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
              borderRadius: radius.full,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              textDecoration: 'none',
              minHeight: 44,
            }}
          >
            Browse Available Products →
          </a>
          <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, marginTop: spacing.md }}>
            Look for listings with "Private Pickup" to connect directly with vendors
          </p>
        </div>
      ) : null}

      {/* Responsive grid with consistent card widths */}
      <style>{`
        .markets-grid {
          grid-template-columns: repeat(auto-fill, minmax(280px, 320px));
          justify-content: center;
        }
      `}</style>
    </div>
  )
}
