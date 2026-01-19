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
      return `${minutes}m`
    }
    if (hoursLeft < 24) {
      return `${Math.floor(hoursLeft)}h`
    }
    const days = Math.floor(hoursLeft / 24)
    return `${days}d`
  }

  // Format market date
  const formatMarketDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  // Check if we have mixed status (some open, some closed)
  const openMarkets = availability.markets.filter(m => m.is_accepting)
  const closedMarkets = availability.markets.filter(m => !m.is_accepting)
  const hasMixedStatus = openMarkets.length > 0 && closedMarkets.length > 0

  // All markets closed
  if (!availability.is_accepting_orders) {
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
            fontWeight: typography.weights.semibold,
            color: '#991b1b'
          }}>
            Orders Closed
          </span>
        </div>
        <div style={{
          fontSize: typography.sizes.sm,
          color: '#7f1d1d'
        }}>
          All pickup dates for this listing have passed their order cutoff. Vendors are preparing for market.
        </div>
      </div>
    )
  }

  // Show per-market status when there are multiple markets or closing soon
  const showDetails = availability.markets.length > 1 || availability.closing_soon

  if (!showDetails) {
    return null
  }

  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: hasMixedStatus ? '#fffbeb' : '#f0fdf4',
      border: `1px solid ${hasMixedStatus ? '#fde68a' : '#bbf7d0'}`,
      borderRadius: radius.md,
      marginBottom: spacing.sm
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        marginBottom: spacing.xs
      }}>
        <span style={{ fontSize: 18 }}>{hasMixedStatus ? '⏰' : '📅'}</span>
        <span style={{
          fontWeight: typography.weights.semibold,
          color: hasMixedStatus ? '#92400e' : '#166534',
          fontSize: typography.sizes.sm
        }}>
          {hasMixedStatus ? 'Some pickup dates closing soon' : 'Pickup Availability'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
        {availability.markets.map(market => {
          const isClosingSoon = market.is_accepting && market.cutoff_at &&
            (new Date(market.cutoff_at).getTime() - Date.now()) < 24 * 60 * 60 * 1000

          return (
            <div
              key={market.market_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: market.is_accepting
                  ? (isClosingSoon ? '#fef3c7' : '#dcfce7')
                  : '#fee2e2',
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                <span style={{
                  color: market.is_accepting
                    ? (isClosingSoon ? '#92400e' : '#166534')
                    : '#991b1b',
                  fontWeight: typography.weights.medium
                }}>
                  {market.market_name}
                </span>
                {market.next_market_at && (
                  <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>
                    ({formatMarketDate(market.next_market_at)})
                  </span>
                )}
              </div>
              <span style={{
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.xs,
                color: market.is_accepting
                  ? (isClosingSoon ? '#92400e' : '#166534')
                  : '#991b1b'
              }}>
                {market.is_accepting
                  ? (market.cutoff_at && isClosingSoon
                      ? `Closes in ${formatTimeRemaining(market.cutoff_at)}`
                      : '✓ Open')
                  : '✗ Closed'}
              </span>
            </div>
          )
        })}
      </div>

      {hasMixedStatus && (
        <div style={{
          marginTop: spacing.xs,
          fontSize: typography.sizes.xs,
          color: '#78350f'
        }}>
          Order now to pick up at available markets. Closed markets have passed their cutoff time.
        </div>
      )}
    </div>
  )
}
