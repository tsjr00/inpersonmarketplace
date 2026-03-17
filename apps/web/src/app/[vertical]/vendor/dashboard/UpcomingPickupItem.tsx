'use client'

import Link from 'next/link'
import { formatPickupDate } from '@/types/pickup'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface UpcomingPickupItemProps {
  vertical: string
  pickup_date: string
  market_id: string
  market_name: string
  item_count: number
}

export default function UpcomingPickupItem({ vertical, pickup_date, market_id, market_name, item_count }: UpcomingPickupItemProps) {
  const dateLabel = formatPickupDate(pickup_date)
  const isToday = dateLabel === 'Today'

  if (isToday) {
    // TODAY: Prominent prep workflow card
    // Flow: See items → Prep/pack → Mark ready → Pickup Mode handoff
    return (
      <div
        style={{
          padding: spacing.xs,
          backgroundColor: colors.primaryLight,
          borderRadius: radius.md,
          border: `2px solid ${colors.primary}`,
        }}
      >
        {/* Location + item count */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing['2xs'],
        }}>
          <Link
            href={`/${vertical}/vendor/orders?pickup_date=${pickup_date}`}
            style={{
              textDecoration: 'none',
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.bold,
              color: colors.primaryDark,
            }}
          >
            📍 {market_name}
          </Link>
          <span style={{
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.bold,
            color: colors.primaryDark,
            backgroundColor: 'white',
            padding: `2px ${spacing.xs}`,
            borderRadius: radius.full,
          }}>
            {item_count} item{item_count !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Prep action row */}
        <div style={{
          display: 'flex',
          gap: spacing['2xs'],
        }}>
          <Link
            href={`/${vertical}/vendor/markets/${market_id}/prep`}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing['2xs'],
              padding: `${spacing['2xs']} ${spacing.xs}`,
              backgroundColor: 'white',
              color: colors.primaryDark,
              borderRadius: radius.sm,
              border: `1px solid ${colors.primary}`,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              textDecoration: 'none',
            }}
          >
            📋 Prep List
          </Link>
          <Link
            href={`/${vertical}/vendor/orders?pickup_date=${pickup_date}`}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing['2xs'],
              padding: `${spacing['2xs']} ${spacing.xs}`,
              backgroundColor: 'white',
              color: colors.primaryDark,
              borderRadius: radius.sm,
              border: `1px solid ${colors.primary}`,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              textDecoration: 'none',
            }}
          >
            🧾 Orders
          </Link>
        </div>
      </div>
    )
  }

  // FUTURE DATES: Compact row with prep link
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: `${spacing['2xs']} ${spacing.xs}`,
        backgroundColor: 'white',
        borderRadius: radius.sm,
        border: `1px solid ${colors.borderMuted}`,
      }}
    >
      <Link
        href={`/${vertical}/vendor/orders?pickup_date=${pickup_date}`}
        style={{ textDecoration: 'none', flex: 1 }}
      >
        <span style={{
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.medium,
          color: colors.textPrimary
        }}>
          {dateLabel}
        </span>
        <span style={{
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          marginLeft: spacing['2xs']
        }}>
          · {market_name}
        </span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
        <Link
          href={`/${vertical}/vendor/markets/${market_id}/prep`}
          style={{
            fontSize: typography.sizes.xs,
            color: colors.primary,
            textDecoration: 'none',
            padding: `2px ${spacing['2xs']}`,
          }}
          title="Prep Sheet"
        >
          📋
        </Link>
        <span style={{
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          color: colors.primary,
          backgroundColor: colors.primaryLight,
          padding: `2px ${spacing.xs}`,
          borderRadius: radius.full
        }}>
          {item_count} item{item_count !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
