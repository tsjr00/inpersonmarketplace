'use client'

import Link from 'next/link'
import { colors, spacing, typography, containers } from '@/lib/design-tokens'

interface FeaturedMarketsProps {
  vertical: string
}

export function FeaturedMarkets({ vertical }: FeaturedMarketsProps) {
  return (
    <section
      className="flex justify-center"
      style={{
        backgroundColor: colors.surfaceMuted,
        padding: `${spacing['3xl']} 0`,
      }}
    >
      <div
        className="w-full text-center"
        style={{
          maxWidth: containers.lg,
          paddingLeft: 'clamp(20px, 5vw, 60px)',
          paddingRight: 'clamp(20px, 5vw, 60px)',
        }}
      >
        <h2
          style={{
            fontSize: typography.sizes['3xl'],
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
            marginBottom: spacing.sm,
          }}
        >
          Discover Markets in Your Community
        </h2>

        <div
          style={{
            maxWidth: '640px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <p
            style={{
              fontSize: typography.sizes.base,
              color: colors.textSecondary,
              lineHeight: typography.leading.relaxed,
              marginBottom: spacing.sm,
            }}
          >
            Farmers markets are more than shopping — they&apos;re the heartbeat of local
            communities. For many family farms and small businesses, a weekly market stand
            is essential revenue that keeps their operations alive.
          </p>

          <p
            style={{
              fontSize: typography.sizes.base,
              color: colors.textSecondary,
              lineHeight: typography.leading.relaxed,
              marginBottom: spacing.md,
            }}
          >
            Every dollar spent locally circulates back into your neighborhood, supporting
            the growers, makers, and families who make your community vibrant. We&apos;re here
            to make that connection easier.
          </p>

          <Link
            href={`/${vertical}/markets`}
            style={{
              fontSize: typography.sizes.sm,
              color: colors.textSecondary,
              textDecoration: 'none',
              fontStyle: 'italic',
              borderBottom: `1px solid ${colors.textMuted}`,
              paddingBottom: 2,
            }}
          >
            Find markets near you
          </Link>
        </div>
      </div>
    </section>
  )
}
