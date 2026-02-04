'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import LocationSearchInline from '@/components/location/LocationSearchInline'
import VendorAvatar from '@/components/shared/VendorAvatar'
import TierBadge from '@/components/shared/TierBadge'
import { VendorTierType } from '@/lib/constants'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface VendorMarket {
  id: string
  name: string
  market_type?: string
  distance_miles?: number
}

interface EnrichedVendor {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  tier: VendorTierType
  createdAt: string
  averageRating: number | null
  ratingCount: number | null
  listingCount: number
  categories: string[]
  markets: VendorMarket[]
  distance_miles?: number | null
}

// Helper to get the two most relevant markets (closest traditional + closest private pickup)
function getDisplayMarkets(markets: VendorMarket[]): { displayed: VendorMarket[]; remaining: number } {
  if (markets.length === 0) return { displayed: [], remaining: 0 }
  if (markets.length <= 2) return { displayed: markets, remaining: 0 }

  // Separate by type and sort by distance
  const traditional = markets
    .filter(m => m.market_type === 'traditional')
    .sort((a, b) => (a.distance_miles ?? 999) - (b.distance_miles ?? 999))
  const privatePickup = markets
    .filter(m => m.market_type === 'private_pickup')
    .sort((a, b) => (a.distance_miles ?? 999) - (b.distance_miles ?? 999))

  const displayed: VendorMarket[] = []

  // Add closest traditional market if exists
  if (traditional.length > 0) {
    displayed.push(traditional[0])
  }

  // Add closest private pickup if exists
  if (privatePickup.length > 0) {
    displayed.push(privatePickup[0])
  }

  // If we only have one type, add the second closest of that type
  if (displayed.length < 2) {
    if (traditional.length > 1) {
      displayed.push(traditional[1])
    } else if (privatePickup.length > 1) {
      displayed.push(privatePickup[1])
    }
  }

  // Calculate remaining
  const remaining = markets.length - displayed.length

  return { displayed, remaining }
}

interface VendorsWithLocationProps {
  vertical: string
  initialVendors: EnrichedVendor[]
  currentMarket?: string
  currentCategory?: string
  currentSearch?: string
  currentSort: string
  /** Server-side location from cookie/profile - skips initial API call */
  initialLocation?: {
    latitude: number
    longitude: number
    locationText: string
  } | null
}

export default function VendorsWithLocation({
  vertical,
  initialVendors,
  currentMarket,
  currentCategory,
  currentSearch,
  currentSort,
  initialLocation
}: VendorsWithLocationProps) {
  // Initialize state from server-provided location (if available)
  const [hasLocation, setHasLocation] = useState<boolean | null>(initialLocation ? true : null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(
    initialLocation ? { lat: initialLocation.latitude, lng: initialLocation.longitude } : null
  )
  const [locationText, setLocationText] = useState(initialLocation?.locationText || '')
  // Start with initialVendors to show content immediately while location loads
  const [vendors, setVendors] = useState<EnrichedVendor[]>(initialVendors)
  const [loading, setLoading] = useState(false)
  // If we have initialLocation, we can skip the API check
  const [locationChecked, setLocationChecked] = useState(!!initialLocation)
  // Track if we've done a location-based search yet (to know if we're showing preliminary data)
  const [hasLocationResults, setHasLocationResults] = useState(false)

  // Check for saved location on mount - ONLY if no initialLocation provided
  useEffect(() => {
    if (!initialLocation) {
      checkSavedLocation()
    }
  }, [])

  // Re-fetch when filters change (and we have location)
  // Only run after initial location check is complete to avoid race condition
  useEffect(() => {
    if (!locationChecked) return // Wait for initial location check

    if (userLocation) {
      fetchNearbyVendors(userLocation.lat, userLocation.lng)
    } else {
      // No location set - show empty state (user needs to enter location)
      setVendors([])
    }
  }, [currentMarket, currentCategory, currentSearch, currentSort, locationChecked])

  const checkSavedLocation = async () => {
    try {
      const response = await fetch('/api/buyer/location')
      const data = await response.json()

      if (data.hasLocation) {
        setHasLocation(true)
        setUserLocation({ lat: data.latitude, lng: data.longitude })
        setLocationText(data.locationText || 'Your location')
        // Fetch nearby vendors and then mark location as checked
        await fetchNearbyVendors(data.latitude, data.longitude)
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

  const fetchNearbyVendors = async (lat: number, lng: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        vertical,
        radius: '25',
        sort: currentSort
      })

      if (currentMarket) params.set('market', currentMarket)
      if (currentCategory) params.set('category', currentCategory)
      if (currentSearch) params.set('search', currentSearch)

      const response = await fetch(`/api/vendors/nearby?${params}`)
      const data = await response.json()

      if (data.vendors) {
        setVendors(data.vendors.map((v: Record<string, unknown>) => ({
          ...v,
          tier: (v.tier || 'standard') as VendorTierType
        })))
        setHasLocationResults(true)
      }
    } catch (error) {
      console.error('Error fetching nearby vendors:', error)
      // On error, keep showing initialVendors rather than empty state
      // so user still sees something useful
      setHasLocationResults(true) // Mark as "done" even on error to stop loading indicator
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
    fetchNearbyVendors(lat, lng)
  }

  const handleClearLocation = () => {
    setHasLocation(false)
    setUserLocation(null)
    setLocationText('')
    // Clear vendors - user needs to enter new location
    setVendors([])
  }

  return (
    <div>
      {/* Inline Location Search */}
      <div style={{ marginBottom: spacing.sm }}>
        <LocationSearchInline
          onLocationSet={handleLocationSet}
          hasLocation={hasLocation || false}
          locationText={locationText}
          onClear={handleClearLocation}
          labelPrefix="Vendors nearby"
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
            Enter your ZIP code above to find vendors within 25 miles
          </p>
        </div>
      )}

      {/* Loading indicator - only show blocking state if no vendors to display */}
      {loading && vendors.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: spacing.md,
          color: colors.textMuted
        }}>
          Loading nearby vendors...
        </div>
      )}

      {/* Results count with loading/refining indicator */}
      <div style={{
        marginBottom: spacing.md,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs
      }}>
        {loading && vendors.length > 0 ? (
          // Show refining message when we have preliminary results
          <>
            <span style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              border: '2px solid #e5e7eb',
              borderTopColor: colors.primary,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
            <span>Finding vendors near you...</span>
          </>
        ) : (
          <span>
            {vendors.length} vendor{vendors.length !== 1 ? 's' : ''} found
            {hasLocationResults && hasLocation && ' within 25 miles'}
            {!hasLocationResults && vendors.length > 0 && !hasLocation && ' (enter ZIP for local results)'}
          </span>
        )}
      </div>

      {/* Vendor Grid - show even while loading if we have vendors */}
      {vendors.length > 0 ? (
        <div
          className="vendors-grid"
          style={{
            display: 'grid',
            gap: spacing.md
          }}
        >
          {vendors.map(vendor => (
            <Link
              key={vendor.id}
              href={`/${vertical}/vendor/${vendor.id}/profile`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: spacing.md,
                backgroundColor: colors.surfaceElevated,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.lg,
                textDecoration: 'none',
                transition: 'box-shadow 0.2s, transform 0.2s',
                height: '100%',
                minWidth: 0,
                overflow: 'hidden'
              }}
              className="vendor-card"
            >
              {/* Vendor Header */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing.sm,
                marginBottom: spacing.xs
              }}>
                <VendorAvatar
                  imageUrl={vendor.imageUrl}
                  name={vendor.name}
                  size={56}
                  tier={vendor.tier}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary,
                    lineHeight: 1.3,
                    marginBottom: spacing['3xs']
                  }}>
                    {vendor.name}
                  </h3>

                  {/* Star Rating - Always show */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing['3xs']
                  }}>
                    <div style={{ display: 'flex', gap: 1 }}>
                      {[1, 2, 3, 4, 5].map((star) => {
                        const rating = vendor.averageRating || 0
                        const filled = star <= Math.floor(rating)
                        return (
                          <span
                            key={star}
                            style={{
                              fontSize: 12,
                              color: filled ? '#f59e0b' : '#d1d5db'
                            }}
                          >
                            ★
                          </span>
                        )
                      })}
                    </div>
                    {vendor.ratingCount && vendor.ratingCount > 0 ? (
                      <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                        ({vendor.ratingCount})
                      </span>
                    ) : (
                      <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                        (0)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              {vendor.description && (
                <p style={{
                  margin: `0 0 ${spacing.xs} 0`,
                  fontSize: typography.sizes.sm,
                  color: colors.textSecondary,
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  flex: 1
                }}>
                  {vendor.description}
                </p>
              )}

              {/* Categories - Text in shaded section */}
              {vendor.categories.length > 0 && (
                <div style={{
                  padding: `${spacing['2xs']} ${spacing.xs}`,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.sm,
                  marginBottom: spacing.xs,
                  fontSize: typography.sizes.xs,
                  color: colors.textSecondary
                }}>
                  {vendor.categories.slice(0, 4).join(' • ')}
                  {vendor.categories.length > 4 && ` +${vendor.categories.length - 4}`}
                </div>
              )}

              {/* Markets with individual distances */}
              {vendor.markets.length > 0 && (() => {
                const { displayed, remaining } = getDisplayMarkets(vendor.markets)
                return (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: spacing['3xs'],
                    fontSize: typography.sizes.xs,
                    color: colors.textMuted,
                    marginBottom: spacing.xs
                  }}>
                    {displayed.map(market => (
                      <div key={market.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing['2xs']
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1
                        }}>
                          {market.market_type === 'private_pickup' ? 'Private: ' : ''}{market.name}
                        </span>
                        {market.distance_miles !== undefined && market.distance_miles < 999 && (
                          <span style={{
                            padding: `${spacing['3xs']} ${spacing.xs}`,
                            backgroundColor: colors.surfaceSubtle,
                            borderRadius: radius.sm,
                            fontWeight: typography.weights.medium,
                            flexShrink: 0
                          }}>
                            {market.distance_miles.toFixed(1)} mi
                          </span>
                        )}
                      </div>
                    ))}
                    {remaining > 0 && (
                      <div style={{
                        fontSize: typography.sizes.xs,
                        color: colors.textMuted,
                        paddingLeft: 20
                      }}>
                        +{remaining} more location{remaining !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Bottom row: Listings count + Premium badge */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: spacing.xs,
                borderTop: `1px solid ${colors.borderMuted}`,
                marginTop: 'auto'
              }}>
                <span style={{
                  fontSize: typography.sizes.xs,
                  color: colors.textMuted
                }}>
                  {vendor.listingCount} listing{vendor.listingCount !== 1 ? 's' : ''}
                </span>
                {vendor.tier !== 'standard' && (
                  <TierBadge tier={vendor.tier} size="sm" />
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : !loading ? (
        <div style={{
          padding: spacing['3xl'],
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          border: `1px dashed ${colors.border}`,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: spacing.sm, opacity: 0.5 }}>🧑‍🌾</div>
          <h3 style={{
            margin: `0 0 ${spacing['2xs']} 0`,
            color: colors.textSecondary,
            fontSize: typography.sizes.lg
          }}>
            No vendors found
          </h3>
          <p style={{
            margin: 0,
            color: colors.textMuted,
            fontSize: typography.sizes.base
          }}>
            {currentSearch || currentMarket || currentCategory
              ? 'Try adjusting your filters to see more vendors'
              : hasLocation
                ? 'No vendors found within 25 miles'
                : 'Check back soon for local vendors in your area'}
          </p>
        </div>
      ) : null}

      {/* Responsive grid - cards fill available space with minimum width */}
      <style>{`
        .vendors-grid {
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        }
        .vendor-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
