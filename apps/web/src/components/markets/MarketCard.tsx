'use client'

import Link from 'next/link'
import ScheduleDisplay from './ScheduleDisplay'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface Schedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

interface MarketCardProps {
  market: {
    id: string
    name: string
    market_type: 'traditional' | 'private_pickup'
    description?: string
    address?: string
    city?: string
    state?: string
    zip?: string
    active: boolean
    schedule_count?: number
    vendor_count?: number
    schedules?: Schedule[]
    distance_miles?: number
    season_start?: string | null
    season_end?: string | null
  }
  vertical: string
}

// Format season date (e.g., "2026-03-15" -> "Mar 15")
function formatSeasonDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function MarketCard({ market, vertical }: MarketCardProps) {
  // Build full address: address, city, state
  const addressParts = [market.address, market.city, market.state].filter(Boolean)
  const fullAddress = addressParts.join(', ')
  // Fallback to just city, state if no street address
  const displayAddress = fullAddress || [market.city, market.state].filter(Boolean).join(', ')

  return (
    <Link
      href={`/${vertical}/markets/${market.id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}
    >
      <div
        style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          border: `1px solid ${colors.border}`,
          boxShadow: shadows.sm,
          padding: spacing.md,
          transition: 'box-shadow 0.2s, transform 0.2s',
          cursor: 'pointer',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = shadows.md
          e.currentTarget.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = shadows.sm
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        {/* Header - Market name */}
        <h3 style={{
          margin: `0 0 ${spacing['2xs']} 0`,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary
        }}>
          {market.name}
        </h3>

        {/* Description - Right below title */}
        {market.description && (
          <p style={{
            margin: `0 0 ${spacing.xs} 0`,
            fontSize: typography.sizes.sm,
            color: colors.textSecondary,
            lineHeight: typography.leading.relaxed,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical'
          }}>
            {market.description}
          </p>
        )}

        {/* Address */}
        {displayAddress && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: spacing['2xs'],
            marginBottom: spacing['2xs']
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span style={{
              fontSize: typography.sizes.sm,
              color: colors.textMuted,
              flex: 1
            }}>
              {displayAddress}
            </span>
            {market.distance_miles !== undefined && (
              <span style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                color: colors.textMuted,
                fontWeight: typography.weights.medium,
                flexShrink: 0
              }}>
                {market.distance_miles.toFixed(1)} mi
              </span>
            )}
          </div>
        )}

        {/* Schedule - Plain text, no icon */}
        {market.schedules && market.schedules.length > 0 && (
          <div style={{
            fontSize: typography.sizes.sm,
            color: colors.textSecondary,
            marginBottom: spacing['2xs']
          }}>
            <ScheduleDisplay schedules={market.schedules} compact />
          </div>
        )}

        {/* Season dates */}
        {(market.season_start || market.season_end) && (
          <div style={{
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            marginBottom: spacing.xs,
            flex: 1
          }}>
            {market.season_start && market.season_end ? (
              <>Season: {formatSeasonDate(market.season_start)} – {formatSeasonDate(market.season_end)}</>
            ) : market.season_start ? (
              <>Opens {formatSeasonDate(market.season_start)}</>
            ) : (
              <>Closes {formatSeasonDate(market.season_end!)}</>
            )}
          </div>
        )}

        {/* Footer stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: spacing.xs,
          borderTop: `1px solid ${colors.borderMuted}`,
          marginTop: 'auto'
        }}>
          <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
            👥 {market.vendor_count || 0} vendor{(market.vendor_count || 0) !== 1 ? 's' : ''}
          </span>
          {!market.active && (
            <span style={{
              padding: `${spacing['3xs']} ${spacing.xs}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              backgroundColor: '#fee2e2',
              color: '#991b1b',
            }}>
              Inactive
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
