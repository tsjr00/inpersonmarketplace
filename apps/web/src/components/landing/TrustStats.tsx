import { Package, Users, Store, UtensilsCrossed, Truck, MapPin } from 'lucide-react'
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
  locale?: string
}

export function TrustStats({ vertical, stats, locale }: TrustStatsProps) {
  const colors = getVerticalColors(vertical)
  const { trust_stats } = getContent(vertical, locale)
  const isFT = vertical === 'food_trucks'

  // Don't show stats section if platform has no real data yet
  const hasData = stats.listingCount > 0 || stats.vendorCount > 0 || stats.marketCount > 0
  if (!hasData) return null

  // FT uses food-themed icons; FM uses generic icons
  const statItems = isFT ? [
    { icon: UtensilsCrossed, value: stats.listingCount, label: trust_stats.products_label },
    { icon: Truck, value: stats.vendorCount, label: trust_stats.vendors_label },
    { icon: MapPin, value: stats.marketCount, label: trust_stats.markets_label },
  ].filter(s => s.value > 0) : [
    { icon: Package, value: stats.listingCount, label: trust_stats.products_label },
    { icon: Users, value: stats.vendorCount, label: trust_stats.vendors_label },
    { icon: Store, value: stats.marketCount, label: trust_stats.markets_label },
  ].filter(s => s.value > 0)

  return (
    <section
      className="flex justify-center"
      style={{
        backgroundColor: isFT ? '#6b6b6b' : colors.accentMuted,
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
        {/* FT: Section header above stats */}
        {isFT && (
          <p
            className="text-center"
            style={{
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              color: '#ffffff',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: spacing.md,
            }}
          >
            Connecting You With Local Food Trucks In Your Area
          </p>
        )}

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
                    width: isFT ? 56 : 44,
                    height: isFT ? 56 : 44,
                    backgroundColor: isFT ? colors.primary : colors.surfaceElevated,
                    marginBottom: spacing.xs,
                  }}
                >
                  <Icon style={{
                    width: isFT ? 28 : 22,
                    height: isFT ? 28 : 22,
                    color: isFT ? '#ffffff' : colors.primaryDark,
                  }} />
                </div>
                <div
                  style={{
                    fontSize: typography.sizes['3xl'],
                    fontWeight: typography.weights.bold,
                    color: isFT ? '#ffffff' : colors.primaryDark,
                    lineHeight: 1,
                    marginBottom: spacing['3xs'],
                  }}
                >
                  {stat.value.toLocaleString()}+
                </div>
                <div
                  style={{
                    fontSize: typography.sizes.xs,
                    color: isFT ? 'rgba(255,255,255,0.9)' : colors.textPrimary,
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

        {!isFT && <TrustStatsTagline vertical={vertical} />}
      </div>
    </section>
  )
}
