'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface FinalCTAProps {
  vertical: string
}

/**
 * Final CTA Section
 * Industry standard: Light gradient background, strong call to action
 * Matches hero for visual bookending
 */
export function FinalCTA({ vertical }: FinalCTAProps) {
  const isFarmersMarket = vertical === 'farmers_market'

  return (
    <section
      className="landing-section"
      style={{
        background: `linear-gradient(180deg, ${colors.primaryLight} 0%, ${colors.surfaceBase} 100%)`,
      }}
    >
      <div
        className="landing-container text-center"
        style={{ maxWidth: '700px' }}
      >
        <h2
          style={{
            fontSize: typography.sizes['3xl'],
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
            marginBottom: spacing.xs,
          }}
        >
          Ready to Get Started?
        </h2>

        <p
          style={{
            fontSize: typography.sizes.lg,
            color: colors.textSecondary,
            marginBottom: spacing.lg,
          }}
        >
          {isFarmersMarket
            ? 'Join our growing community of local food lovers and support farmers in your neighborhood.'
            : 'Connect with local buyers and sellers in your area today.'
          }
        </p>

        <div
          className="flex flex-col sm:flex-row justify-center items-center"
          style={{ gap: spacing.xs }}
        >
          {/* Primary CTA */}
          <Link
            href={`/${vertical}/browse`}
            className="inline-flex items-center justify-center gap-2 transition-all"
            style={{
              backgroundColor: colors.primary,
              color: colors.textInverse,
              padding: `${spacing.sm} ${spacing.lg}`,
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
            Browse Products
            <ArrowRight style={{ width: 20, height: 20 }} />
          </Link>

          {/* Secondary CTA */}
          <Link
            href={`/${vertical}/vendor-signup`}
            className="inline-flex items-center justify-center transition-all"
            style={{
              backgroundColor: 'transparent',
              color: colors.primaryDark,
              padding: `${spacing.sm} ${spacing.lg}`,
              borderRadius: radius.full,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              minWidth: '200px',
              border: `2px solid ${colors.primary}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.primaryLight
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            Become a Vendor
          </Link>
        </div>
      </div>
    </section>
  )
}
