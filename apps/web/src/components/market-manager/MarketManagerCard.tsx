import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import type { ManagedMarket } from '@/lib/markets/manager-queries'

interface MarketManagerCardProps {
  vertical: string
  markets: ManagedMarket[]
}

/**
 * Buyer dashboard card — shown only to users who are assigned managers
 * of one or more markets. Renders nothing when the user manages zero
 * markets, so it's safe to drop into the buyer dashboard grid for
 * everyone.
 *
 * Each market row links to the manager dashboard at
 * /[vertical]/market-manager/[marketId]/dashboard.
 *
 * Visual treatment matches the existing buyer dashboard cards
 * (Browse Products, My Orders, etc.): same surface, border, padding.
 * No special highlight — manager role is auxiliary, not a notification.
 */
export default function MarketManagerCard({ vertical, markets }: MarketManagerCardProps) {
  if (markets.length === 0) return null

  return (
    <div
      style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        color: colors.textPrimary,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
      }}
    >
      <h3
        style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
        }}
      >
        🌾 My Markets
      </h3>
      <p
        style={{
          margin: 0,
          marginBottom: spacing.xs,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
        }}
      >
        {markets.length === 1
          ? 'You manage 1 market on the platform.'
          : `You manage ${markets.length} markets on the platform.`}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
        {markets.map((m) => (
          <Link
            key={m.id}
            href={`/${vertical}/market-manager/${m.id}/dashboard`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: `${spacing.xs} ${spacing.sm}`,
              backgroundColor: colors.surfaceBase,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              textDecoration: 'none',
              color: colors.textPrimary,
              fontSize: typography.sizes.sm,
            }}
          >
            <span style={{ fontWeight: typography.weights.medium }}>
              {m.name}
              {(m.city || m.state) && (
                <span style={{ color: colors.textMuted, fontWeight: typography.weights.normal, marginLeft: spacing['2xs'] }}>
                  · {[m.city, m.state].filter(Boolean).join(', ')}
                </span>
              )}
            </span>
            <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Manage →</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
