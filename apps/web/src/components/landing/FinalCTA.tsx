'use client'

import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

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
            ? 'Join our growing community connecting local producers, artisans, and the neighbors who support them.'
            : 'Connect with local buyers and sellers in your area today.'
          }
        </p>

        <div
          className="flex flex-col sm:flex-row justify-center items-center"
          style={{ gap: spacing.xs }}
        >
          {[
            { label: 'Browse Products', href: `/${vertical}/browse` },
            { label: isFarmersMarket ? 'Find Markets' : 'Find Locations', href: `/${vertical}/markets` },
            { label: 'Find Vendors', href: `/${vertical}/vendors` },
          ].map((cta) => (
            <Link
              key={cta.label}
              href={cta.href}
              className="inline-flex items-center justify-center transition-all"
              style={{
                backgroundColor: 'transparent',
                color: colors.primaryDark,
                padding: `${spacing.sm} ${spacing.lg}`,
                borderRadius: radius.full,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold,
                minWidth: '180px',
                border: `2px solid ${colors.primary}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.primaryLight
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              {cta.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
