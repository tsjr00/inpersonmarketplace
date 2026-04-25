'use client'

import { calculateDisplayPrice, formatPrice } from '@/lib/constants'
import { colors, statusColors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import type { CheckoutItem } from './types'

interface CheckoutMarketBoxItemProps {
  item: CheckoutItem
  onRemove: (offeringId: string) => void
}

export function CheckoutMarketBoxItem({ item, onRemove }: CheckoutMarketBoxItemProps) {
  const locale = getClientLocale()
  const termParam = String(item.termWeeks === 8 ? 8 : 4)
  const displayPrice = calculateDisplayPrice(item.termPriceCents || item.price_cents || 0)

  return (
    <div
      style={{
        padding: spacing.sm,
        backgroundColor: statusColors.neutral50,
        borderRadius: radius.md,
        border: `1px solid ${statusColors.infoBorder}`,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], marginBottom: spacing['3xs'], flexWrap: 'wrap' }}>
            <span style={{ fontSize: typography.sizes.sm }}>📦</span>
            <h3 style={{
              margin: 0,
              fontSize: typography.sizes.base,
              color: colors.textPrimary,
            }}>
              {item.offeringName || item.title}
            </h3>
            {item.pickupFrequency === 'biweekly' && (
              <span style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: '#fce7f3',
                color: '#9d174d',
                borderRadius: radius.full,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
              }}>
                {t('mbd.cadence_biweekly', locale)}
              </span>
            )}
          </div>
          <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, margin: `0 0 ${spacing['2xs']} 0` }}>
            {item.vendor_name} · {t('cart.subscription', locale, { term: termParam })}
          </p>

          {/* Pickup schedule */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing['2xs'],
            padding: `${spacing['2xs']} ${spacing.xs}`,
            backgroundColor: statusColors.infoLight,
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
            color: statusColors.infoDark,
          }}>
            <span>📅</span>
            <span>
              <strong>{t('cart.pickup', locale)}</strong>{' '}
              {item.pickupDayOfWeek != null ? t('day.' + item.pickupDayOfWeek, locale) + 's' : 'TBD'}
              {item.pickup_display?.time_formatted && ` · ${item.pickup_display.time_formatted}`}
              {item.market_name && (
                <span style={{ display: 'block', marginTop: 2, color: colors.textMuted }}>
                  @ {item.market_name}
                  {item.market_city && ` - ${item.market_city}, ${item.market_state}`}
                </span>
              )}
              {item.startDate && (
                <span style={{ display: 'block', marginTop: 2, color: colors.textMuted }}>
                  {t('cart.starting', locale, { date: new Date(item.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })}
                </span>
              )}
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, margin: `0 0 ${spacing['3xs']} 0`, color: colors.textPrimary }}>
            {formatPrice(displayPrice)}
          </p>
          <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: `0 0 ${spacing['2xs']} 0` }}>
            {t('cart.week_total', locale, { term: termParam })}
          </p>
          <button
            onClick={() => item.offeringId && onRemove(item.offeringId)}
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
