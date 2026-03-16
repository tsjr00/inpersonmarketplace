import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface CutoffBadgeProps {
  /** Pre-calculated status from server-side. If provided, skips client-side fetch. */
  preCalculatedStatus?: 'open' | 'closing-soon' | 'closed'
  /** Hours until cutoff (for closing-soon status) */
  hoursUntilCutoff?: number | null
  style?: React.CSSProperties
}

/**
 * Lightweight badge to show cutoff status on listing cards.
 * Accepts pre-calculated status from server-side for efficiency.
 */
export default function CutoffBadge({
  preCalculatedStatus,
  hoursUntilCutoff,
  style
}: CutoffBadgeProps) {
  const locale = getClientLocale()
  const status = preCalculatedStatus || 'open'
  const hoursLeft = hoursUntilCutoff ?? null

  // Don't show anything if orders are open (no urgency)
  if (status === 'open') {
    return null
  }

  // Format time remaining
  const formatTime = (hours: number): string => {
    if (hours < 1) {
      const minutes = Math.max(1, Math.round(hours * 60))
      return `${minutes}m`
    }
    return `${Math.floor(hours)}h`
  }

  // Closed badge
  if (status === 'closed') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing['3xs'],
          padding: `${spacing['3xs']} ${spacing.xs}`,
          backgroundColor: '#fef2f2',
          color: '#991b1b',
          borderRadius: radius.lg,
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.semibold,
          ...style
        }}
        title={t('listing.badge_closed_title', locale)}
      >
        <span>{t('listing.badge_closed', locale)}</span>
      </span>
    )
  }

  // Closing soon badge
  if (status === 'closing-soon') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing['3xs'],
          padding: `${spacing['3xs']} ${spacing.xs}`,
          backgroundColor: '#fef3c7',
          color: '#92400e',
          borderRadius: radius.lg,
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.semibold,
          ...style
        }}
        title={t('listing.badge_closes_title', locale, { time: hoursLeft ? formatTime(hoursLeft) : t('listing.badge_closes_soon', locale) })}
      >
        <span>{t('listing.badge_closes', locale, { time: hoursLeft ? formatTime(hoursLeft) : t('listing.badge_closes_soon', locale) })}</span>
      </span>
    )
  }

  return null
}
