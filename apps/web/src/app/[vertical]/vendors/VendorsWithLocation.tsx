'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import LocationSearchInline from '@/components/location/LocationSearchInline'
import VendorAvatar from '@/components/shared/VendorAvatar'
import TierBadge from '@/components/shared/TierBadge'
import { VendorTierType } from '@/lib/constants'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

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
  markets: { id: string; name: string }[]
  distance_miles?: number | null
}

interface VendorsWithLocationProps {
  vertical: string
  initialVendors: EnrichedVendor[]
  currentMarket?: string
  currentCategory?: string
  currentSearch?: string
  currentSort: string
}

export default function VendorsWithLocation({
  vertical,
  initialVendors,
  currentMarket,
  currentCategory,
  currentSearch,
  currentSort
}: VendorsWithLocationProps) {
  const [hasLocation, setHasLocation] = useState<boolean | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationText, setLocationText] = useState('')
  // Start with empty array - only show vendors after location-based search
  const [vendors, setVendors] = useState<EnrichedVendor[]>([])
  const [loading, setLoading] = useState(false)
  const [locationChecked, setLocationChecked] = useState(false)

  // Check for saved location on mount
  useEffect(() => {
    checkSavedLocation()
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
      }
    } catch (error) {
      console.error('Error fetching nearby vendors:', error)
      // On error, show empty state rather than unfiltered vendors
      setVendors([])
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

      {/* Loading indicator */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: spacing.md,
          color: colors.textMuted
        }}>
          Loading nearby vendors...
        </div>
      )}

      {/* Results count */}
      {!loading && (
        <div style={{
          marginBottom: spacing.md,
          color: colors.textMuted,
          fontSize: typography.sizes.sm
        }}>
          {vendors.length} vendor{vendors.length !== 1 ? 's' : ''} found
          {hasLocation && ' within 25 miles'}
        </div>
      )}

      {/* Vendor Grid */}
      {!loading && vendors.length > 0 ? (
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

              {/* Markets with distance */}
              {vendor.markets.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing['2xs'],
                  fontSize: typography.sizes.xs,
                  color: colors.textMuted,
                  marginBottom: spacing.xs
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}>
                    {vendor.markets.slice(0, 2).map(m => m.name).join(', ')}
                    {vendor.markets.length > 2 && ` +${vendor.markets.length - 2}`}
                  </span>
                  {vendor.distance_miles !== undefined && vendor.distance_miles !== null && (
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: colors.surfaceSubtle,
                      borderRadius: radius.sm,
                      fontWeight: typography.weights.medium
                    }}>
                      {vendor.distance_miles.toFixed(1)} mi
                    </span>
                  )}
                </div>
              )}

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
      `}</style>
    </div>
  )
}
