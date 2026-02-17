'use client'

import Link from 'next/link'
import { spacing, typography, radius, getVerticalColors } from '@/lib/design-tokens'
import { term, getContent } from '@/lib/vertical'

interface FinalCTAProps {
  vertical: string
}

/**
 * Final CTA Section
 * Industry standard: Light gradient background, strong call to action
 * Matches hero for visual bookending
 */
export function FinalCTA({ vertical }: FinalCTAProps) {
  const colors = getVerticalColors(vertical)
  const { final_cta } = getContent(vertical)

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
          {final_cta.subtitle}
        </p>

        <div
          className="flex flex-col sm:flex-row justify-center items-center"
          style={{ gap: spacing.xs }}
        >
          {[
            { label: term(vertical, 'browse_products_cta'), href: `/${vertical}/browse` },
            { label: term(vertical, 'find_markets_cta'), href: `/${vertical}/markets` },
            { label: term(vertical, 'find_vendors_cta'), href: `/${vertical}/vendors` },
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
