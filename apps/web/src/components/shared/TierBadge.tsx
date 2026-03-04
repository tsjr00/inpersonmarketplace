import { TIER_BADGES, VendorTierType } from '@/lib/constants'
import { spacing, typography, radius } from '@/lib/design-tokens'

interface TierBadgeProps {
  tier: VendorTierType
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

export default function TierBadge({ tier, size = 'md', showIcon = true }: TierBadgeProps) {
  const badge = TIER_BADGES[tier] || TIER_BADGES.standard

  const sizes = {
    sm: { fontSize: typography.sizes.xs, padding: `3px ${spacing['2xs']}` },
    md: { fontSize: typography.sizes.xs, padding: `${spacing['3xs']} ${spacing.xs}` },
    lg: { fontSize: typography.sizes.sm, padding: `6px ${spacing.sm}` }
  }

  const style = sizes[size]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing['3xs'],
        padding: style.padding,
        fontSize: style.fontSize,
        fontWeight: typography.weights.semibold,
        color: badge.color,
        backgroundColor: badge.bgColor,
        border: `1px solid ${badge.borderColor}`,
        borderRadius: radius.lg,
        whiteSpace: 'nowrap'
      }}
    >
      {showIcon && badge.icon && <span>{badge.icon}</span>}
      <span>{badge.label}</span>
    </span>
  )
}
