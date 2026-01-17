'use client'

import { useState, useEffect } from 'react'
import LocationPrompt from '@/components/location/LocationPrompt'
import MarketCard from '@/components/markets/MarketCard'

interface Market {
  id: string
  name: string
  type: 'traditional' | 'private_pickup'
  description?: string
  address?: string
  city?: string
  state?: string
  market_type?: string
  active: boolean
  schedules?: any[]
  vendor_count?: number
  distance_miles?: number
}

interface MarketsWithLocationProps {
  vertical: string
  initialMarkets: Market[]
  type?: string
  cities: string[]
}

export default function MarketsWithLocation({
  vertical,
  initialMarkets,
  type,
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
        radius: '25'
      })
      if (type) params.set('type', type)

      const response = await fetch(`/api/markets/nearby?${params}`)
      const data = await response.json()

      if (data.markets) {
        setMarkets(data.markets.map((m: any) => ({
          ...m,
          type: m.market_type || m.type,
          active: m.active ?? (m.status === 'active'),
          schedules: m.market_schedules,
          vendor_count: m.market_vendors?.[0]?.count || 0
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
        <div style={{ marginBottom: 24 }}>
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
          marginBottom: 16,
          padding: '12px 16px',
          backgroundColor: '#f8fafc',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ color: '#64748b', fontSize: 14 }}>
            Set your location to see markets within 25 miles
          </span>
          <button
            onClick={() => { setShowLocationPrompt(true); setLocationDismissed(false); }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            Set Location
          </button>
        </div>
      )}

      {/* Location indicator when location is set */}
      {hasLocation && userLocation && !showLocationPrompt && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          backgroundColor: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ color: '#166534', fontSize: 14 }}>
            📍 Showing markets within 25 miles of your location
          </span>
          <button
            onClick={() => setShowLocationPrompt(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#16a34a',
              cursor: 'pointer',
              fontSize: 14,
              textDecoration: 'underline'
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
          padding: 40,
          color: '#64748b'
        }}>
          Loading nearby markets...
        </div>
      )}

      {/* Results count */}
      {!loading && (
        <div style={{ marginBottom: 16, color: '#666' }}>
          {markets.length} market{markets.length !== 1 ? 's' : ''} found
          {hasLocation && ' within 25 miles'}
        </div>
      )}

      {/* Market grid */}
      {!loading && markets.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 20,
        }}>
          {markets.map(market => (
            <div key={market.id} style={{ position: 'relative' }}>
              <MarketCard market={market} vertical={vertical} />
              {market.distance_miles !== undefined && (
                <div style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 500
                }}>
                  {market.distance_miles} mi
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !loading ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 60,
          textAlign: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <p style={{ color: '#666', fontSize: 16 }}>
            {hasLocation
              ? 'No markets found within 25 miles of your location.'
              : 'No markets found matching your filters.'}
          </p>
          <p style={{ color: '#999', fontSize: 14, marginTop: 8 }}>
            {hasLocation
              ? 'Try changing your location or check back later.'
              : 'Try adjusting your search criteria or check back later.'}
          </p>
        </div>
      ) : null}
    </div>
  )
}
