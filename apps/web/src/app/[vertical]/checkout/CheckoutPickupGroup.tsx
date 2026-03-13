'use client'

import { colors, statusColors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { formatPickupDate, getPickupDateColor } from '@/types/pickup'
import { CheckoutListingItem } from './CheckoutListingItem'
import type { CheckoutItem } from './types'

interface CheckoutPickupGroupProps {
  items: CheckoutItem[]
  updatingItemId: string | null
  onQuantityChange: (listingId: string, newQuantity: number) => Promise<void>
  onRemove: (listingId: string) => void
}

/**
 * Groups multiple checkout items from the same vendor + pickup location + date
 * into a single outlined box with a shared header.
 */
export function CheckoutPickupGroup({ items, updatingItemId, onQuantityChange, onRemove }: CheckoutPickupGroupProps) {
  // Use first item for group header info (all items share vendor/market/date)
  const first = items[0]
  const hasUnavailable = items.some(i => !i.available)

  return (
    <div style={{
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      border: hasUnavailable ? `2px solid ${statusColors.danger}` : `1px solid ${colors.border}`,
      boxShadow: shadows.sm,
      overflow: 'hidden',
    }}>
      {/* Group header: vendor name + pickup info */}
      <div style={{
        padding: `${spacing.xs} ${spacing.sm}`,
        backgroundColor: colors.surfaceSubtle,
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <p style={{
          margin: 0,
          fontWeight: typography.weights.semibold,
          fontSize: typography.sizes.sm,
          color: colors.textPrimary,
        }}>
          {first.vendor_name}
        </p>

        {first.market_name && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing['2xs'],
            marginTop: spacing['3xs'],
            fontSize: typography.sizes.xs,
            color: colors.textSecondary,
          }}>
            <span>{first.market_type === 'event' ? '🎪' : first.market_type === 'traditional' ? '🏪' : '📦'}</span>
            <span>
              {first.market_name}
              {first.market_city && ` - ${first.market_city}, ${first.market_state}`}
              {first.pickup_date && (
                <>
                  {' · '}
                  <span style={{
                    fontWeight: 600,
                    borderBottom: `2px solid ${getPickupDateColor(0)}`,
                    paddingBottom: 1,
                  }}>
                    {formatPickupDate(first.pickup_date)}
                  </span>
                  {first.pickup_display?.time_formatted && (
                    <span style={{ fontWeight: 500 }}>
                      {' @ '}{first.pickup_display.time_formatted}
                    </span>
                  )}
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Items in this group */}
      {items.map((item, idx) => (
        <div key={item.listingId} style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          borderTop: idx > 0 ? `1px dashed ${colors.borderMuted}` : undefined,
        }}>
          <CheckoutListingItem
            item={item}
            updatingItemId={updatingItemId}
            onQuantityChange={onQuantityChange}
            onRemove={onRemove}
            grouped
          />
        </div>
      ))}
    </div>
  )
}
