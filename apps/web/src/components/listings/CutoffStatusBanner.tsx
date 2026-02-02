'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface MarketAvailability {
  market_id: string
  market_name: string
  market_type: string
  is_accepting: boolean
  cutoff_at: string | null
  next_market_at: string | null
  reason: string | null
}

interface AvailabilityResponse {
  is_accepting_orders: boolean
  reason: string | null
  markets: MarketAvailability[]
  closing_soon?: boolean
  hours_until_cutoff?: number | null
}

interface CutoffStatusBannerProps {
  listingId: string
  onStatusChange?: (isAccepting: boolean) => void
}

export default function CutoffStatusBanner({ listingId, onStatusChange }: CutoffStatusBannerProps) {
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAvailability() {
      try {
        const response = await fetch(`/api/listings/${listingId}/availability`)
        if (response.ok) {
          const data = await response.json()
          setAvailability(data)
          onStatusChange?.(data.is_accepting_orders)
        }
      } catch (error) {
        console.error('Failed to fetch availability:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAvailability()

    // Refresh every minute to keep cutoff status accurate
    const interval = setInterval(fetchAvailability, 60 * 1000)
    return () => clearInterval(interval)
  }, [listingId, onStatusChange])

  if (loading || !availability || availability.markets.length === 0) {
    return null
  }

  // Format time until cutoff
  const formatTimeRemaining = (cutoffAt: string): string => {
    const hoursLeft = (new Date(cutoffAt).getTime() - Date.now()) / (1000 * 60 * 60)
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

  // Format market date with day, date, and time
  const formatMarketDateTime = (dateStr: string, timeStr?: string): string => {
    const date = new Date(dateStr)
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
    const dateFormatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (timeStr) {
      return `${dayName}, ${dateFormatted} at ${timeStr}`
    }
    return `${dayName}, ${dateFormatted}`
  }

  // Format cutoff date/time
  const formatCutoffDateTime = (cutoffAt: string): string => {
    const date = new Date(cutoffAt)
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
    const dateFormatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const timeFormatted = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${dayName}, ${dateFormatted} at ${timeFormatted}`
  }

  // Check if we have mixed status (some open, some closed)
  const openMarkets = availability.markets.filter(m => m.is_accepting)
  const closedMarkets = availability.markets.filter(m => !m.is_accepting)
  const hasMixedStatus = openMarkets.length > 0 && closedMarkets.length > 0

  // Check if any market is closing soon (within 24 hours)
  const closingSoonMarkets = availability.markets.filter(m => {
    if (!m.is_accepting || !m.cutoff_at) return false
    const hoursUntilCutoff = (new Date(m.cutoff_at).getTime() - Date.now()) / (1000 * 60 * 60)
    return hoursUntilCutoff < 24
  })

  // All markets closed - show "Orders Closed" with helpful explanation
  if (!availability.is_accepting_orders) {
    // Find the next market time to show when it's happening
    const nextMarket = closedMarkets.find(m => m.next_market_at)
    const marketTime = nextMarket?.next_market_at
      ? formatMarketDateTime(nextMarket.next_market_at)
      : null

    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: radius.md,
        marginBottom: spacing.sm
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          marginBottom: spacing.xs
        }}>
          <span style={{ fontSize: 18 }}>🚫</span>
          <span style={{
            fontWeight: typography.weights.bold,
            color: '#991b1b',
            fontSize: typography.sizes.base
          }}>
            Orders Closed for This Week
          </span>
        </div>

        {/* Why it's closed */}
        <div style={{
          fontSize: typography.sizes.sm,
          color: '#7f1d1d',
          marginBottom: spacing.xs
        }}>
          The order cutoff has passed. The vendor is now harvesting, packing, and preparing for pickup.
        </div>

        {/* Market timing info */}
        {marketTime && (
          <div style={{
            padding: spacing.xs,
            backgroundColor: '#fee2e2',
            borderRadius: radius.sm,
            marginBottom: spacing.xs
          }}>
            <div style={{ fontSize: typography.sizes.sm, color: '#991b1b', fontWeight: typography.weights.semibold }}>
              Pickup: {marketTime}
            </div>
            <div style={{ fontSize: typography.sizes.xs, color: '#7f1d1d', marginTop: spacing['3xs'] }}>
              at {closedMarkets.map(m => m.market_name).join(', ')}
            </div>
          </div>
        )}

        {/* When orders reopen */}
        <div style={{
          fontSize: typography.sizes.xs,
          color: '#991b1b',
          fontStyle: 'italic'
        }}>
          Orders will reopen after this pickup. Check back soon!
        </div>
      </div>
    )
  }

  // ONLY show banner if closing soon or mixed status - don't show when everything is open
  const shouldShow = closingSoonMarkets.length > 0 || hasMixedStatus

  if (!shouldShow) {
    return null
  }

  // Closing soon - yellow warning with restructured layout
  if (closingSoonMarkets.length > 0 && !hasMixedStatus) {
    const market = closingSoonMarkets[0]
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#fef3c7',
        border: '1px solid #fde68a',
        borderRadius: radius.md,
        marginBottom: spacing.sm
      }}>
        {/* Row 1: Listing closes in X hours */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          marginBottom: spacing.xs
        }}>
          <span style={{ fontSize: 18 }}>⏰</span>
          <span style={{
            fontWeight: typography.weights.bold,
            color: '#92400e',
            fontSize: typography.sizes.base
          }}>
            Listing closes in {formatTimeRemaining(market.cutoff_at!)}
          </span>
        </div>
        {/* Row 2: Day, date, and time */}
        <div style={{
          fontSize: typography.sizes.sm,
          color: '#78350f',
          paddingLeft: '30px'
        }}>
          {formatCutoffDateTime(market.cutoff_at!)}
        </div>
        {/* Row 3: Pickup location */}
        <div style={{
          fontSize: typography.sizes.xs,
          color: '#92400e',
          paddingLeft: '30px',
          marginTop: spacing['3xs']
        }}>
          Pickup at: {market.market_name}
        </div>
      </div>
    )
  }

  // Mixed status - some open, some closed
  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: '#fffbeb',
      border: '1px solid #fde68a',
      borderRadius: radius.md,
      marginBottom: spacing.sm
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        marginBottom: spacing.xs
      }}>
        <span style={{ fontSize: 18 }}>⏰</span>
        <span style={{
          fontWeight: typography.weights.semibold,
          color: '#92400e',
          fontSize: typography.sizes.sm
        }}>
          Pickup Availability
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
        {availability.markets.map(market => {
          const isClosingSoon = market.is_accepting && market.cutoff_at &&
            (new Date(market.cutoff_at).getTime() - Date.now()) < 24 * 60 * 60 * 1000

          // Closed market row
          if (!market.is_accepting) {
            return (
              <div
                key={market.market_id}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: '#fee2e2',
                  borderRadius: radius.sm,
                }}
              >
                <div style={{
                  fontWeight: typography.weights.bold,
                  color: '#991b1b',
                  fontSize: typography.sizes.sm,
                  marginBottom: spacing['3xs']
                }}>
                  Listing Closed
                </div>
                <div style={{
                  fontSize: typography.sizes.xs,
                  color: '#991b1b'
                }}>
                  Pickup at: {market.market_name}
                </div>
              </div>
            )
          }

          // Closing soon market row
          if (isClosingSoon && market.cutoff_at) {
            return (
              <div
                key={market.market_id}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: '#fef3c7',
                  borderRadius: radius.sm,
                }}
              >
                <div style={{
                  fontWeight: typography.weights.bold,
                  color: '#92400e',
                  fontSize: typography.sizes.sm,
                  marginBottom: spacing['3xs']
                }}>
                  Listing closes in {formatTimeRemaining(market.cutoff_at)}
                </div>
                <div style={{
                  fontSize: typography.sizes.xs,
                  color: '#78350f'
                }}>
                  {formatCutoffDateTime(market.cutoff_at)}
                </div>
                <div style={{
                  fontSize: typography.sizes.xs,
                  color: '#92400e',
                  marginTop: spacing['3xs']
                }}>
                  Pickup at: {market.market_name}
                </div>
              </div>
            )
          }

          // Open market (not closing soon) - skip showing these
          return null
        })}
      </div>

      {closedMarkets.length > 0 && openMarkets.length > 0 && (
        <div style={{
          marginTop: spacing.xs,
          fontSize: typography.sizes.xs,
          color: '#78350f'
        }}>
          Order now for available pickup locations. Some locations have passed their cutoff time.
        </div>
      )}
    </div>
  )
}
