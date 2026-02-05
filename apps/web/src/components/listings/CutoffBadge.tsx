import { colors, spacing, typography, radius } from '@/lib/design-tokens'

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
        title="Orders closed for vendor prep time"
      >
        <span>Closed</span>
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
        title={`Orders close in ${hoursLeft ? formatTime(hoursLeft) : 'soon'}`}
      >
        <span>Closes {hoursLeft ? formatTime(hoursLeft) : 'soon'}</span>
      </span>
    )
  }

  return null
}
