'use client'

import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import {
  type MarketPickupDates,
  type PickupDateOption,
  formatPickupDate,
  formatPickupTime,
  formatCutoffRemaining,
  getPickupDateColor
} from '@/types/pickup'

/*
 * PICKUP SCHEDULING CONTEXT
 *
 * This component displays available pickup dates grouped by market.
 * Updated to show per-date availability (not just per-market).
 *
 * See: docs/Build_Instructions/Pickup_Scheduling_Comprehensive_Plan.md
 */

interface PickupLocationsCardProps {
  marketPickupDates: MarketPickupDates[]
  primaryColor?: string
}

export default function PickupLocationsCard({
  marketPickupDates,
  primaryColor = '#16a34a'
}: PickupLocationsCardProps) {
  if (!marketPickupDates || marketPickupDates.length === 0) {
    return null
  }

  // Check if any market has accepting dates
  const hasAnyAccepting = marketPickupDates.some(m => m.dates.some(d => d.is_accepting))
  const hasAnyClosed = marketPickupDates.some(m => m.dates.some(d => !d.is_accepting))

  // Get style for a date based on its status
  const getDateStyles = (date: PickupDateOption) => {
    // Use market's actual cutoff_hours policy (default 18 for traditional, 10 for private)
    const cutoffThreshold = date.cutoff_hours || 18
    const isClosingSoon = date.is_accepting &&
      date.hours_until_cutoff !== null &&
      date.hours_until_cutoff < cutoffThreshold &&
      date.hours_until_cutoff > 0

    if (!date.is_accepting) {
      // Closed - red
      return {
        backgroundColor: '#fee2e2',
        borderColor: '#fecaca',
        statusColor: '#991b1b',
        textColor: '#7f1d1d',
        icon: '✗',
        statusText: 'Closed'
      }
    }
    if (isClosingSoon) {
      // Closing soon - yellow
      return {
        backgroundColor: '#fef3c7',
        borderColor: '#fde68a',
        statusColor: '#92400e',
        textColor: '#78350f',
        icon: '⏰',
        statusText: formatCutoffRemaining(date.hours_until_cutoff)
      }
    }
    // Open - green
    return {
      backgroundColor: '#dcfce7',
      borderColor: '#bbf7d0',
      statusColor: '#166534',
      textColor: '#15803d',
      icon: '✓',
      statusText: 'Open'
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
            Pickup Options
          </span>
        </div>
      </div>

      {/* Markets and their dates */}
      <div style={{
        padding: spacing['2xs'],
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
        backgroundColor: colors.surfaceElevated
      }}>
        {marketPickupDates.map((market, marketIndex) => (
          <div key={market.market_id}>
            {/* Market name */}
            <div style={{
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary,
              marginBottom: spacing['3xs'],
              display: 'flex',
              alignItems: 'center',
              gap: spacing['3xs']
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: market.market_type === 'private_pickup' ? '#8b5cf6' : '#3b82f6',
                flexShrink: 0
              }} />
              {market.market_name}
            </div>

            {/* Dates for this market */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: spacing['3xs'],
              paddingLeft: spacing.sm
            }}>
              {market.dates.map((date, dateIndex) => {
                const styles = getDateStyles(date)
                const dateColor = getPickupDateColor(dateIndex)

                return (
                  <div
                    key={`${date.schedule_id}-${date.pickup_date}`}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: styles.backgroundColor,
                      border: `1px solid ${styles.borderColor}`,
                      borderRadius: radius.sm,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: spacing.xs
                    }}
                  >
                    {/* Date and time */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing['2xs']
                    }}>
                      <span style={{
                        fontWeight: typography.weights.medium,
                        color: styles.textColor,
                        fontSize: typography.sizes.xs,
                        borderBottom: `2px solid ${dateColor}`
                      }}>
                        {formatPickupDate(date.pickup_date)}
                      </span>
                      <span style={{
                        color: styles.textColor,
                        fontSize: 10
                      }}>
                        {formatPickupTime(date.start_time)}
                      </span>
                    </div>

                    {/* Status */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing['3xs']
                    }}>
                      <span style={{
                        fontWeight: typography.weights.bold,
                        color: styles.statusColor,
                        fontSize: typography.sizes.xs
                      }}>
                        {styles.icon}
                      </span>
                      <span style={{
                        fontWeight: typography.weights.medium,
                        color: styles.statusColor,
                        fontSize: 10
                      }}>
                        {styles.statusText}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Explanatory footer - only when there are closed dates */}
        {hasAnyClosed && (
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
                Orders close before each pickup to give vendors time to prepare.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
