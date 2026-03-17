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

  return (
    <div
      key={`${pickup_date}-${market_id}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: `${spacing['2xs']} ${spacing.xs}`,
        backgroundColor: isToday ? colors.primaryLight : 'white',
        borderRadius: radius.sm,
        border: isToday ? `1px solid ${colors.primary}` : `1px solid ${colors.borderMuted}`,
      }}
    >
      <Link
        href={`/${vertical}/vendor/orders?pickup_date=${pickup_date}`}
        style={{ textDecoration: 'none', flex: 1 }}
      >
        <span style={{
          fontSize: typography.sizes.sm,
          fontWeight: isToday ? typography.weights.bold : typography.weights.medium,
          color: isToday ? colors.primaryDark : colors.textPrimary
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
            color: colors.textMuted,
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
          color: isToday ? colors.primaryDark : colors.primary,
          backgroundColor: isToday ? colors.primaryLight : colors.primaryLight,
          padding: `2px ${spacing.xs}`,
          borderRadius: radius.full
        }}>
          {item_count} item{item_count !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
