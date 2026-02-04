'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { createSmartRefreshManager } from '@/lib/hooks/useSmartRefresh'

interface MarketInfo {
  market_id: string
  market_name: string
  market_type: string
  address: string
  city: string
  state: string
  day_of_week: number | null
  start_time: string | null
  end_time: string | null
}

interface MarketAvailability {
  market_id: string
  market_name: string
  market_type: string
  is_accepting: boolean
  cutoff_at: string | null
  next_market_at: string | null
  reason: string | null
}

interface PickupLocationsCardProps {
  listingId: string
  markets: MarketInfo[]
  vertical: string
  isLoggedIn: boolean
  primaryColor?: string
}

// Combine market info with availability status
interface CombinedMarket extends MarketInfo {
  is_accepting: boolean
  cutoff_at: string | null
  next_market_at: string | null
  is_closing_soon: boolean
  hours_until_cutoff: number | null
}

export default function PickupLocationsCard({
  listingId,
  markets,
  vertical,
  isLoggedIn,
  primaryColor = '#16a34a'
}: PickupLocationsCardProps) {
  const [availability, setAvailability] = useState<MarketAvailability[]>([])
  const [loading, setLoading] = useState(true)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Memoize fetch function to avoid recreating it
  const fetchAvailability = useCallback(async () => {
    try {
      const response = await fetch(`/api/listings/${listingId}/availability`)
      if (response.ok) {
        const data = await response.json()
        setAvailability(data.markets || [])
      }
    } catch (error) {
      console.error('Failed to fetch availability:', error)
    } finally {
      setLoading(false)
    }
  }, [listingId])

  // Initial fetch
  useEffect(() => {
    fetchAvailability()
  }, [fetchAvailability])

  // Smart refresh based on cutoff times
  useEffect(() => {
    // Clean up previous manager if any
    if (cleanupRef.current) {
      cleanupRef.current()
    }

    // Get cutoff times from availability data
    const cutoffTimes = availability.map(a => a.cutoff_at)

    // Set up smart refresh manager for listing detail page
    const { cleanup } = createSmartRefreshManager(
      { type: 'detail' },
      cutoffTimes,
      fetchAvailability
    )

    cleanupRef.current = cleanup

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
      }
    }
  }, [availability, fetchAvailability])

  if (!markets || markets.length === 0) {
    return null
  }

  // Combine market info with availability status
  const combinedMarkets: CombinedMarket[] = markets.map(market => {
    const avail = availability.find(a => a.market_id === market.market_id)
    const cutoffAt = avail?.cutoff_at
    const hoursUntilCutoff = cutoffAt
      ? (new Date(cutoffAt).getTime() - Date.now()) / (1000 * 60 * 60)
      : null

    // Closing soon if less than 24 hours until cutoff (the actual cutoff times
    // are already calculated by the backend based on market type)
    const isClosingSoon = !!(avail?.is_accepting && hoursUntilCutoff !== null && hoursUntilCutoff < 24 && hoursUntilCutoff > 0)

    return {
      ...market,
      is_accepting: avail?.is_accepting ?? true, // Default to accepting if no availability data yet
      cutoff_at: cutoffAt || null,
      next_market_at: avail?.next_market_at || null,
      is_closing_soon: isClosingSoon,
      hours_until_cutoff: hoursUntilCutoff
    }
  })

  // Sort: open locations first, then closing soon, then closed
  const sortedMarkets = [...combinedMarkets].sort((a, b) => {
    // Open and not closing soon = 0
    // Closing soon = 1
    // Closed = 2
    const getOrder = (m: CombinedMarket) => {
      if (!m.is_accepting) return 2
      if (m.is_closing_soon) return 1
      return 0
    }
    return getOrder(a) - getOrder(b)
  })

  // Format time until cutoff - full words for clarity
  const formatTimeRemaining = (hoursLeft: number): string => {
    if (hoursLeft < 1) {
      const minutes = Math.max(1, Math.round(hoursLeft * 60))
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`
    }
    if (hoursLeft < 24) {
      const hours = Math.floor(hoursLeft)
      return `${hours} hour${hours !== 1 ? 's' : ''}`
    }
    const days = Math.floor(hoursLeft / 24)
    return `${days} day${days !== 1 ? 's' : ''}`
  }

  // Check if we need to show the explanatory footer
  const hasClosedOrClosingSoon = sortedMarkets.some(m => !m.is_accepting || m.is_closing_soon)

  // Determine card background and text colors based on status
  const getCardStyles = (market: CombinedMarket) => {
    if (!market.is_accepting) {
      // Closed - red
      return {
        backgroundColor: '#fee2e2',
        borderColor: '#fecaca',
        statusColor: '#991b1b',
        textColor: '#7f1d1d',
        icon: '✗',
        statusText: 'Orders Closed'
      }
    }
    if (market.is_closing_soon && market.hours_until_cutoff !== null) {
      // Closing soon - yellow
      return {
        backgroundColor: '#fef3c7',
        borderColor: '#fde68a',
        statusColor: '#92400e',
        textColor: '#78350f',
        icon: '⏰',
        statusText: `Orders close in ${formatTimeRemaining(market.hours_until_cutoff)}`
      }
    }
    // Open - green
    return {
      backgroundColor: '#dcfce7',
      borderColor: '#bbf7d0',
      statusColor: '#166534',
      textColor: '#15803d',
      icon: '✓',
      statusText: 'Accepting Orders'
    }
  }

  return (
    <div style={{
      border: `2px solid ${primaryColor}`,
      borderRadius: radius.sm,
      overflow: 'hidden'
    }}>
      {/* Header - compact */}
      <div style={{
        padding: `${spacing['2xs']} ${spacing.xs}`,
        backgroundColor: colors.surfaceElevated,
        borderBottom: `1px solid ${colors.border}`
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing['2xs']
        }}>
          <span style={{ fontSize: 14 }}>📍</span>
          <span style={{
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
            fontSize: typography.sizes.xs
          }}>
            Pickup Locations
          </span>
        </div>
      </div>

      {/* Location cards - compact */}
      <div style={{
        padding: spacing['2xs'],
        display: 'flex',
        flexDirection: 'column',
        gap: spacing['2xs'],
        backgroundColor: colors.surfaceElevated
      }}>
        {loading ? (
          <div style={{
            padding: spacing.xs,
            textAlign: 'center',
            color: colors.textMuted,
            fontSize: typography.sizes.xs
          }}>
            Loading...
          </div>
        ) : (
          <>
            {sortedMarkets.map(market => {
              const styles = getCardStyles(market)

              return (
                <div
                  key={market.market_id}
                  style={{
                    padding: `${spacing['2xs']} ${spacing.xs}`,
                    backgroundColor: styles.backgroundColor,
                    border: `1px solid ${styles.borderColor}`,
                    borderRadius: radius.sm
                  }}
                >
                  {/* Status on first line */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing['3xs'],
                    marginBottom: spacing['3xs']
                  }}>
                    <span style={{
                      fontWeight: typography.weights.bold,
                      color: styles.statusColor,
                      fontSize: typography.sizes.sm
                    }}>
                      {styles.icon}
                    </span>
                    <span style={{
                      fontWeight: typography.weights.semibold,
                      color: styles.statusColor,
                      fontSize: typography.sizes.xs
                    }}>
                      {styles.statusText}
                    </span>
                  </div>

                  {/* Market name on second line */}
                  <div style={{
                    fontWeight: typography.weights.medium,
                    color: styles.textColor,
                    fontSize: typography.sizes.xs,
                    paddingLeft: spacing.sm
                  }}>
                    {market.market_name}
                  </div>
                </div>
              )
            })}

            {/* Explanatory footer - only when there are closed or closing-soon locations */}
            {hasClosedOrClosingSoon && (
              <div style={{
                padding: `${spacing['2xs']} ${spacing.xs}`,
                backgroundColor: colors.surfaceMuted,
                borderRadius: radius.sm,
                marginTop: spacing['2xs']
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: spacing['2xs']
                }}>
                  <span style={{ fontSize: 11, flexShrink: 0 }}>ℹ️</span>
                  <p style={{
                    margin: 0,
                    fontSize: 10,
                    color: colors.textMuted,
                    lineHeight: 1.4
                  }}>
                    Orders automatically close before pickup days to give vendors time to prepare for upcoming market / pickup hours.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
