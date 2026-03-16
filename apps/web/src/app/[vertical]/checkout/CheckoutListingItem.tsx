'use client'

import { calculateDisplayPrice, formatPrice } from '@/lib/constants'
import { colors, statusColors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import { formatPickupDate, getPickupDateColor } from '@/types/pickup'
import type { CheckoutItem } from './types'

interface CheckoutListingItemProps {
  item: CheckoutItem
  updatingItemId: string | null
  onQuantityChange: (listingId: string, newQuantity: number) => Promise<void>
  onRemove: (listingId: string) => void
  /** When true, hides vendor name and pickup info (shown in group header instead) */
  grouped?: boolean
}

export function CheckoutListingItem({ item, updatingItemId, onQuantityChange, onRemove, grouped = false }: CheckoutListingItemProps) {
  const locale = getClientLocale()
  const isUpdating = updatingItemId === item.listingId

  // Grouped mode: compact row inside a group box (no outer box, no vendor/pickup)
  if (grouped) {
    return (
      <div>
        {!item.available && (
          <div style={{
            padding: `${spacing['2xs']} ${spacing.xs}`,
            backgroundColor: statusColors.dangerLight,
            color: statusColors.dangerDark,
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
            marginBottom: spacing['2xs'],
          }}>
            {item.available_quantity === 0
              ? t('checkout.sold_out', locale)
              : t('checkout.only_available', locale, { count: String(item.available_quantity) })
            }
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: spacing.xs,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              margin: `0 0 ${spacing['3xs']} 0`,
              fontSize: typography.sizes.base,
              color: colors.textPrimary,
            }}>
              {item.title}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
              <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>{t('checkout.qty', locale)}</span>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={() => item.listingId && onQuantityChange(item.listingId, item.quantity - 1)}
                  disabled={isUpdating}
                  style={{
                    width: 32,
                    height: 32,
                    border: `1px solid ${colors.border}`,
                    borderRadius: `${radius.sm} 0 0 ${radius.sm}`,
                    backgroundColor: colors.surfaceElevated,
                    cursor: isUpdating ? 'default' : 'pointer',
                    fontSize: typography.sizes.base,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: colors.textPrimary,
                    opacity: isUpdating ? 0.5 : 1,
                  }}
                >
                  −
                </button>
                <span style={{
                  width: 36,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderTop: `1px solid ${colors.border}`,
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: typography.sizes.sm,
                  color: colors.textPrimary,
                }}>
                  {item.quantity}
                </span>
                <button
                  onClick={() => item.listingId && onQuantityChange(item.listingId, item.quantity + 1)}
                  disabled={isUpdating || (item.available_quantity !== null && item.quantity >= item.available_quantity)}
                  style={{
                    width: 32,
                    height: 32,
                    border: `1px solid ${colors.border}`,
                    borderRadius: `0 ${radius.sm} ${radius.sm} 0`,
                    backgroundColor: colors.surfaceElevated,
                    cursor: (isUpdating || (item.available_quantity !== null && item.quantity >= item.available_quantity)) ? 'not-allowed' : 'pointer',
                    fontSize: typography.sizes.base,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: (isUpdating || (item.available_quantity !== null && item.quantity >= item.available_quantity)) ? 0.5 : 1,
                    color: colors.textPrimary,
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.bold, margin: `0 0 ${spacing['3xs']} 0`, color: colors.textPrimary }}>
              {formatPrice(calculateDisplayPrice(item.price_cents) * item.quantity)}
            </p>
            <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: `0 0 ${spacing['2xs']} 0` }}>
              {formatPrice(calculateDisplayPrice(item.price_cents))} {t('cart.each', locale)}
            </p>
            <button
              onClick={() => item.listingId && onRemove(item.listingId)}
              style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: colors.surfaceElevated,
                color: statusColors.danger,
                border: `1px solid ${statusColors.danger}`,
                borderRadius: radius.sm,
                cursor: 'pointer',
                fontSize: typography.sizes.xs,
                minHeight: 32,
              }}
            >
              {t('checkout.remove', locale)}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Standalone mode: full box with vendor name + pickup info (used for ungrouped single items)
  return (
    <div
      style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.md,
        border: item.available ? `1px solid ${colors.border}` : `2px solid ${statusColors.danger}`,
        boxShadow: shadows.sm,
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: spacing.xs,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{
            margin: `0 0 ${spacing['3xs']} 0`,
            fontSize: typography.sizes.base,
            color: colors.textPrimary,
          }}>
            {item.title}
          </h3>
          <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, margin: `0 0 ${spacing['2xs']} 0` }}>
            {item.vendor_name}
          </p>

          {/* Pickup Location and Date */}
          {item.market_name && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing['2xs'],
              padding: `${spacing['2xs']} ${spacing.xs}`,
              backgroundColor: colors.primaryLight,
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              marginBottom: spacing['2xs'],
              color: colors.textSecondary,
            }}>
              <span>{item.market_type === 'event' ? '🎪' : item.market_type === 'traditional' ? '🏪' : '📦'}</span>
              <span>
                <strong>{t('cart.pickup', locale)}</strong> {item.market_name}
                {item.market_city && ` - ${item.market_city}, ${item.market_state}`}
                {item.pickup_date && (
                  <>
                    {' · '}
                    <span style={{
                      fontWeight: 600,
                      borderBottom: `2px solid ${getPickupDateColor(0)}`,
                      paddingBottom: 1
                    }}>
                      {formatPickupDate(item.pickup_date)}
                    </span>
                    {item.pickup_display?.time_formatted && (
                      <span style={{ fontWeight: 500 }}>
                        {' @ '}{item.pickup_display.time_formatted}
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
          )}

          {!item.available && (
            <div style={{
              padding: `${spacing['2xs']} ${spacing.xs}`,
              backgroundColor: statusColors.dangerLight,
              color: statusColors.dangerDark,
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              marginBottom: spacing['2xs'],
            }}>
              {item.available_quantity === 0
                ? t('checkout.sold_out', locale)
                : t('checkout.only_available', locale, { count: String(item.available_quantity) })
              }
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
            <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>{t('checkout.qty', locale)}</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => item.listingId && onQuantityChange(item.listingId, item.quantity - 1)}
                disabled={isUpdating}
                style={{
                  width: 36,
                  height: 36,
                  border: `1px solid ${colors.border}`,
                  borderRadius: `${radius.sm} 0 0 ${radius.sm}`,
                  backgroundColor: colors.surfaceElevated,
                  cursor: isUpdating ? 'default' : 'pointer',
                  fontSize: typography.sizes.lg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: colors.textPrimary,
                  opacity: isUpdating ? 0.5 : 1,
                }}
              >
                −
              </button>
              <span style={{
                width: 40,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderTop: `1px solid ${colors.border}`,
                borderBottom: `1px solid ${colors.border}`,
                fontSize: typography.sizes.sm,
                color: colors.textPrimary,
              }}>
                {item.quantity}
              </span>
              <button
                onClick={() => item.listingId && onQuantityChange(item.listingId, item.quantity + 1)}
                disabled={isUpdating || (item.available_quantity !== null && item.quantity >= item.available_quantity)}
                style={{
                  width: 36,
                  height: 36,
                  border: `1px solid ${colors.border}`,
                  borderRadius: `0 ${radius.sm} ${radius.sm} 0`,
                  backgroundColor: colors.surfaceElevated,
                  cursor: (isUpdating || (item.available_quantity !== null && item.quantity >= item.available_quantity)) ? 'not-allowed' : 'pointer',
                  fontSize: typography.sizes.lg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: (isUpdating || (item.available_quantity !== null && item.quantity >= item.available_quantity)) ? 0.5 : 1,
                  color: colors.textPrimary,
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, margin: `0 0 ${spacing['3xs']} 0`, color: colors.textPrimary }}>
            {formatPrice(calculateDisplayPrice(item.price_cents) * item.quantity)}
          </p>
          <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: `0 0 ${spacing['2xs']} 0` }}>
            {formatPrice(calculateDisplayPrice(item.price_cents))} {t('cart.each', locale)}
          </p>
          <button
            onClick={() => item.listingId && onRemove(item.listingId)}
            style={{
              padding: `${spacing['3xs']} ${spacing.xs}`,
              backgroundColor: colors.surfaceElevated,
              color: statusColors.danger,
              border: `1px solid ${statusColors.danger}`,
              borderRadius: radius.sm,
              cursor: 'pointer',
              fontSize: typography.sizes.xs,
              minHeight: 36,
            }}
          >
            {t('checkout.remove', locale)}
          </button>
        </div>
      </div>
    </div>
  )
}
