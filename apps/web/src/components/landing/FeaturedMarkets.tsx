'use client'

import Link from 'next/link'
import { spacing, typography, containers, getVerticalColors } from '@/lib/design-tokens'
import { getContent } from '@/lib/vertical'

interface FeaturedMarketsProps {
  vertical: string
}

export function FeaturedMarkets({ vertical }: FeaturedMarketsProps) {
  const colors = getVerticalColors(vertical)
  const { featured_section } = getContent(vertical)

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
          {featured_section.headline}
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
            {featured_section.paragraph1}
          </p>

          <p
            style={{
              fontSize: typography.sizes.base,
              color: colors.textSecondary,
              lineHeight: typography.leading.relaxed,
              marginBottom: spacing.md,
            }}
          >
            {featured_section.paragraph2}
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
            {featured_section.link_text}
          </Link>
        </div>
      </div>
    </section>
  )
}
