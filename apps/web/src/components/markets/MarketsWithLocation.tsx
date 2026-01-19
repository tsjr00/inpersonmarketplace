'use client'

import { useState, useEffect } from 'react'
import LocationPrompt from '@/components/location/LocationPrompt'
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
}

export default function MarketsWithLocation({
  vertical,
  initialMarkets,
  cities
}: MarketsWithLocationProps) {
  const [hasLocation, setHasLocation] = useState<boolean | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [markets, setMarkets] = useState<Market[]>(initialMarkets)
  const [loading, setLoading] = useState(false)
  const [showLocationPrompt, setShowLocationPrompt] = useState(false)
  const [locationDismissed, setLocationDismissed] = useState(false)

  // Check for saved location on mount
  useEffect(() => {
    checkSavedLocation()
  }, [])

  const checkSavedLocation = async () => {
    try {
      const response = await fetch('/api/buyer/location')
      const data = await response.json()

      if (data.hasLocation) {
        setHasLocation(true)
        setUserLocation({ lat: data.latitude, lng: data.longitude })
        // Fetch nearby markets
        fetchNearbyMarkets(data.latitude, data.longitude)
      } else {
        setHasLocation(false)
        setShowLocationPrompt(true)
      }
    } catch (error) {
      console.error('Error checking location:', error)
      setHasLocation(false)
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

      const response = await fetch(`/api/markets/nearby?${params}`)
      const data = await response.json()

      if (data.markets) {
        setMarkets(data.markets.map((m: Record<string, unknown>) => ({
          ...m,
          market_type: (m.market_type || 'traditional') as 'traditional' | 'private_pickup',
          active: (m.active as boolean) ?? ((m.status as string) === 'active'),
          schedules: m.market_schedules as Market['schedules'],
          vendor_count: ((m.market_vendors as Array<{ count: number }> | undefined)?.[0]?.count) || 0
        })))
      }
    } catch (error) {
      console.error('Error fetching nearby markets:', error)
      // Fall back to initial markets
      setMarkets(initialMarkets)
    } finally {
      setLoading(false)
    }
  }

  const handleLocationSet = (lat: number, lng: number) => {
    setUserLocation({ lat, lng })
    setHasLocation(true)
    setShowLocationPrompt(false)
    fetchNearbyMarkets(lat, lng)
  }

  const handleDismissLocationPrompt = () => {
    setLocationDismissed(true)
    setShowLocationPrompt(false)
  }

  return (
    <div>
      {/* Location Prompt - show if no location and not dismissed */}
      {showLocationPrompt && !locationDismissed && (
        <div style={{ marginBottom: spacing.md }}>
          <LocationPrompt
            onLocationSet={handleLocationSet}
            onClose={handleDismissLocationPrompt}
            showCloseButton={true}
          />
        </div>
      )}

      {/* Show button to set location if dismissed */}
      {locationDismissed && !hasLocation && (
        <div style={{
          marginBottom: spacing.sm,
          padding: `${spacing.sm} ${spacing.md}`,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
            Set your location to see markets within 25 miles
          </span>
          <button
            onClick={() => { setShowLocationPrompt(true); setLocationDismissed(false); }}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: colors.primary,
              color: colors.textInverse,
              border: 'none',
              borderRadius: radius.md,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              cursor: 'pointer',
              minHeight: 44
            }}
          >
            Set Location
          </button>
        </div>
      )}

      {/* Location indicator when location is set */}
      {hasLocation && userLocation && !showLocationPrompt && (
        <div style={{
          marginBottom: spacing.sm,
          padding: `${spacing.sm} ${spacing.md}`,
          backgroundColor: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: radius.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ color: '#166534', fontSize: typography.sizes.sm }}>
            📍 Showing markets within 25 miles of your location
          </span>
          <button
            onClick={() => setShowLocationPrompt(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#16a34a',
              cursor: 'pointer',
              fontSize: typography.sizes.sm,
              textDecoration: 'underline',
              minHeight: 44
            }}
          >
            Change
          </button>
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
          <p style={{ color: colors.textSecondary, fontSize: typography.sizes.base, margin: 0 }}>
            {hasLocation
              ? 'No farmers markets found within 25 miles of your location.'
              : 'No farmers markets found matching your filters.'}
          </p>
          <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, marginTop: spacing.xs }}>
            {hasLocation
              ? 'Try changing your location or check back later.'
              : 'Try adjusting your search criteria or check back later.'}
          </p>
        </div>
      ) : null}

      {/* Responsive grid styles */}
      <style>{`
        .markets-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .markets-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .markets-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (min-width: 1280px) {
          .markets-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
      `}</style>
    </div>
  )
}
