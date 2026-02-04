'use client'

import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import type { ProcessedMarket } from '@/lib/utils/listing-availability'

interface PickupLocationsCardProps {
  markets: ProcessedMarket[]
  primaryColor?: string
}

export default function PickupLocationsCard({
  markets,
  primaryColor = '#16a34a'
}: PickupLocationsCardProps) {
  if (!markets || markets.length === 0) {
    return null
  }

  // Calculate hours until cutoff for display
  const getHoursUntilCutoff = (cutoffAt: string | null): number | null => {
    if (!cutoffAt) return null
    return (new Date(cutoffAt).getTime() - Date.now()) / (1000 * 60 * 60)
  }

  // Check if closing soon (less than 24 hours until cutoff)
  const isClosingSoon = (market: ProcessedMarket): boolean => {
    const hours = getHoursUntilCutoff(market.cutoff_at)
    return !!(market.is_accepting && hours !== null && hours < 24 && hours > 0)
  }

  // Sort: open locations first, then closing soon, then closed
  const sortedMarkets = [...markets].sort((a, b) => {
    const getOrder = (m: ProcessedMarket) => {
      if (!m.is_accepting) return 2
      if (isClosingSoon(m)) return 1
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
  const hasClosedOrClosingSoon = sortedMarkets.some(m => !m.is_accepting || isClosingSoon(m))

  // Determine card background and text colors based on status
  const getCardStyles = (market: ProcessedMarket) => {
    const hoursUntilCutoff = getHoursUntilCutoff(market.cutoff_at)
    const closingSoon = isClosingSoon(market)

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
    if (closingSoon && hoursUntilCutoff !== null) {
      // Closing soon - yellow
      return {
        backgroundColor: '#fef3c7',
        borderColor: '#fde68a',
        statusColor: '#92400e',
        textColor: '#78350f',
        icon: '⏰',
        statusText: `Orders close in ${formatTimeRemaining(hoursUntilCutoff)}`
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
      </div>
    </div>
  )
}
