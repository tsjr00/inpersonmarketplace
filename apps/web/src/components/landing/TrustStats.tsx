import { Package, Users, Store } from 'lucide-react'
import { colors, spacing, typography, containers } from '@/lib/design-tokens'
import { TrustStatsTagline } from './TrustStatsTagline'

interface TrustStatsProps {
  stats: {
    listingCount: number
    vendorCount: number
    marketCount: number
  }
}

export function TrustStats({ stats }: TrustStatsProps) {
  const statItems = [
    { icon: Package, value: stats.listingCount, label: 'Products' },
    { icon: Users, value: stats.vendorCount, label: 'Vendors' },
    { icon: Store, value: stats.marketCount, label: 'Markets' },
  ]

  return (
    <section
      className="flex justify-center"
      style={{
        backgroundColor: colors.accentMuted,
        padding: `${spacing.xl} 0`,
      }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: containers.lg,
          paddingLeft: 'clamp(20px, 5vw, 60px)',
          paddingRight: 'clamp(20px, 5vw, 60px)',
        }}
      >
        <div
          className="grid grid-cols-3"
          style={{ gap: spacing.md, marginBottom: spacing.md }}
        >
          {statItems.map((stat, index) => {
            const Icon = stat.icon
            return (
              <div key={index} className="text-center">
                <div
                  className="inline-flex items-center justify-center rounded-full"
                  style={{
                    width: 44,
                    height: 44,
                    backgroundColor: colors.surfaceElevated,
                    marginBottom: spacing.xs,
                  }}
                >
                  <Icon style={{ width: 22, height: 22, color: colors.primaryDark }} />
                </div>
                <div
                  style={{
                    fontSize: typography.sizes['3xl'],
                    fontWeight: typography.weights.bold,
                    color: colors.primaryDark,
                    lineHeight: 1,
                    marginBottom: spacing['3xs'],
                  }}
                >
                  {stat.value.toLocaleString()}+
                </div>
                <div
                  style={{
                    fontSize: typography.sizes.xs,
                    color: colors.textPrimary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: typography.weights.medium,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            )
          })}
        </div>

        <TrustStatsTagline defaultText="Supporting local producers and artisans in your community" />
      </div>
    </section>
  )
}
