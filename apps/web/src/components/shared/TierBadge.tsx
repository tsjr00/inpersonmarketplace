import { TIER_BADGES, VendorTierType } from '@/lib/constants'

interface TierBadgeProps {
  tier: VendorTierType
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

export default function TierBadge({ tier, size = 'md', showIcon = true }: TierBadgeProps) {
  const badge = TIER_BADGES[tier] || TIER_BADGES.standard

  const sizes = {
    sm: { fontSize: 11, padding: '3px 8px' },
    md: { fontSize: 12, padding: '4px 12px' },
    lg: { fontSize: 14, padding: '6px 16px' }
  }

  const style = sizes[size]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: style.padding,
        fontSize: style.fontSize,
        fontWeight: 600,
        color: badge.color,
        backgroundColor: badge.bgColor,
        border: `1px solid ${badge.borderColor}`,
        borderRadius: 12,
        whiteSpace: 'nowrap'
      }}
    >
      {showIcon && badge.icon && <span>{badge.icon}</span>}
      <span>{badge.label}</span>
    </span>
  )
}
