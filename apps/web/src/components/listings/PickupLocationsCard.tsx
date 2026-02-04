'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

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

  useEffect(() => {
    async function fetchAvailability() {
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
    }

    fetchAvailability()

    // Refresh every minute to keep status accurate
    const interval = setInterval(fetchAvailability, 60 * 1000)
    return () => clearInterval(interval)
  }, [listingId])

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

  const hasClosedMarkets = sortedMarkets.some(m => !m.is_accepting)
  const hasOpenMarkets = sortedMarkets.some(m => m.is_accepting)

  // Format time until cutoff
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

  // Format day of week
  const getDayName = (dayOfWeek: number): string => {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]
  }

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
        statusText: 'Orders Currently Closed'
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
    <div>
      {/* Main container with green border */}
      <div style={{
        border: `2px solid ${primaryColor}`,
        borderRadius: radius.md,
        overflow: 'hidden',
        marginBottom: hasClosedMarkets && hasOpenMarkets ? spacing.sm : 0
      }}>
        {/* Header */}
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          backgroundColor: colors.surfaceElevated,
          borderBottom: `1px solid ${colors.border}`
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs
          }}>
            <span style={{ fontSize: 16 }}>📍</span>
            <span style={{
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary,
              fontSize: typography.sizes.sm
            }}>
              Available Pickup Locations
            </span>
          </div>
        </div>

        {/* Location cards */}
        <div style={{
          padding: spacing.sm,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.xs,
          backgroundColor: colors.surfaceElevated
        }}>
          {loading ? (
            <div style={{
              padding: spacing.sm,
              textAlign: 'center',
              color: colors.textMuted,
              fontSize: typography.sizes.sm
            }}>
              Loading availability...
            </div>
          ) : (
            sortedMarkets.map(market => {
              const styles = getCardStyles(market)
              const isPrivate = market.market_type === 'private_pickup'
              const showAddress = !isPrivate || isLoggedIn

              return (
                <div
                  key={market.market_id}
                  style={{
                    padding: spacing.sm,
                    backgroundColor: styles.backgroundColor,
                    border: `1px solid ${styles.borderColor}`,
                    borderRadius: radius.sm
                  }}
                >
                  {/* Status indicator */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing['2xs'],
                    marginBottom: spacing['2xs']
                  }}>
                    <span style={{
                      fontWeight: typography.weights.bold,
                      color: styles.statusColor,
                      fontSize: typography.sizes.base
                    }}>
                      {styles.icon}
                    </span>
                    <span style={{
                      fontWeight: typography.weights.semibold,
                      color: styles.statusColor,
                      fontSize: typography.sizes.sm
                    }}>
                      {styles.statusText}
                    </span>
                  </div>

                  {/* Market name */}
                  <div style={{
                    fontWeight: typography.weights.semibold,
                    color: styles.textColor,
                    fontSize: typography.sizes.sm,
                    marginBottom: spacing['3xs']
                  }}>
                    {isPrivate ? 'Private Pickup: ' : 'Market: '}
                    {market.market_name}
                  </div>

                  {/* Address */}
                  {showAddress ? (
                    <div style={{
                      color: styles.textColor,
                      fontSize: typography.sizes.xs,
                      opacity: 0.9
                    }}>
                      {market.address}, {market.city}, {market.state}
                    </div>
                  ) : (
                    <div style={{
                      fontSize: typography.sizes.xs,
                      fontStyle: 'italic',
                      color: styles.textColor
                    }}>
                      <Link
                        href={`/${vertical}/login`}
                        style={{ color: colors.primary, textDecoration: 'none' }}
                      >
                        Log in
                      </Link>
                      {' '}to see pickup address
                    </div>
                  )}

                  {/* Schedule for traditional markets */}
                  {market.market_type === 'traditional' && market.day_of_week !== null && (
                    <div style={{
                      color: styles.textColor,
                      fontSize: typography.sizes.xs,
                      marginTop: spacing['3xs'],
                      opacity: 0.9
                    }}>
                      {getDayName(market.day_of_week)}
                      {market.start_time && market.end_time && ` ${market.start_time} - ${market.end_time}`}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Yellow warning box - only shown when there are closed markets AND open markets */}
      {hasClosedMarkets && hasOpenMarkets && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: radius.md
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: spacing.xs
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
            <p style={{
              margin: 0,
              fontSize: typography.sizes.xs,
              color: '#78350f',
              lineHeight: 1.4
            }}>
              If you missed the cutoff time for pre-orders, please visit the market in person or order this item to be picked up at another location.
            </p>
          </div>
        </div>
      )}

      {/* Different message when ALL markets are closed */}
      {hasClosedMarkets && !hasOpenMarkets && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: radius.md,
          marginTop: spacing.sm
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: spacing.xs
          }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>⏰</span>
            <div>
              <p style={{
                margin: 0,
                fontSize: typography.sizes.xs,
                color: '#78350f',
                lineHeight: 1.4,
                marginBottom: spacing['2xs']
              }}>
                Orders automatically close before market/pickup day to give vendors time to prepare.
              </p>
              <p style={{
                margin: 0,
                fontSize: typography.sizes.xs,
                color: '#78350f',
                lineHeight: 1.4,
                fontStyle: 'italic'
              }}>
                Orders will reopen after the scheduled market/pickup time. Check back soon!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
