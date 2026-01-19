'use client'

import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

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

        <p
          style={{
            fontSize: typography.sizes.lg,
            color: colors.textSecondary,
            lineHeight: typography.leading.relaxed,
            maxWidth: '580px',
            marginLeft: 'auto',
            marginRight: 'auto',
            marginBottom: spacing.lg,
          }}
        >
          Browse farmers markets near you and discover fresh products from local vendors.
          Pre-order online and pick up at your neighborhood market.
        </p>

        <Link
          href={`/${vertical}/markets`}
          className="inline-flex items-center justify-center transition-all"
          style={{
            backgroundColor: colors.primary,
            color: colors.textInverse,
            padding: `${spacing.sm} ${spacing.xl}`,
            borderRadius: radius.full,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            minWidth: '200px',
            boxShadow: shadows.primary,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.primaryDark
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = colors.primary
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          Find Markets Near You
        </Link>
      </div>
    </section>
  )
}
