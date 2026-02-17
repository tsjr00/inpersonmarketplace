import { Package, Users, Store } from 'lucide-react'
import { spacing, typography, containers, getVerticalColors } from '@/lib/design-tokens'
import { getContent } from '@/lib/vertical'
import { TrustStatsTagline } from './TrustStatsTagline'

interface TrustStatsProps {
  vertical: string
  stats: {
    listingCount: number
    vendorCount: number
    marketCount: number
  }
}

export function TrustStats({ vertical, stats }: TrustStatsProps) {
  const colors = getVerticalColors(vertical)
  const { trust_stats } = getContent(vertical)

  const statItems = [
    { icon: Package, value: stats.listingCount, label: trust_stats.products_label },
    { icon: Users, value: stats.vendorCount, label: trust_stats.vendors_label },
    { icon: Store, value: stats.marketCount, label: trust_stats.markets_label },
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

        <TrustStatsTagline vertical={vertical} />
      </div>
    </section>
  )
}
