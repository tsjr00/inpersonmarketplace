'use client'

import { useState } from 'react'
import Link from 'next/link'
import { spacing, typography, radius, containers, getVerticalColors } from '@/lib/design-tokens'
import { term, getContent } from '@/lib/vertical'
import { LocationEntry } from './LocationEntry'

interface HeroProps {
  vertical: string
  initialCity?: string | null
}

export function Hero({ vertical, initialCity }: HeroProps) {
  const colors = getVerticalColors(vertical)
  const { hero } = getContent(vertical)
  const [userZipCode, setUserZipCode] = useState<string | null>(null)

  // Build URLs with location if available
  const browseUrl = userZipCode
    ? `/${vertical}/browse?zip=${userZipCode}`
    : `/${vertical}/browse`

  const marketsUrl = userZipCode
    ? `/${vertical}/markets?zip=${userZipCode}`
    : `/${vertical}/markets`

  const vendorsUrl = userZipCode
    ? `/${vertical}/vendors?zip=${userZipCode}`
    : `/${vertical}/vendors`

  return (
    <section
      className="relative min-h-[650px] flex items-center justify-center"
      style={{
        background: vertical === 'food_trucks'
          ? `linear-gradient(180deg, ${colors.surfaceElevated} 0%, ${colors.surfaceMuted} 100%)`
          : `linear-gradient(180deg, ${colors.surfaceSubtle} 0%, ${colors.surfaceBase} 100%)`,
        paddingTop: 'clamp(100px, 15vh, 140px)',
        paddingBottom: spacing['2xl'],
      }}
    >
      <div
        className="w-full mx-auto"
        style={{
          maxWidth: containers.lg,
          paddingLeft: 'clamp(20px, 5vw, 60px)',
          paddingRight: 'clamp(20px, 5vw, 60px)',
        }}
      >
        <div
          className="mx-auto text-center"
          style={{ maxWidth: '650px' }}
        >
          {/* Location Entry - Above everything */}
          <LocationEntry
            vertical={vertical}
            initialCity={initialCity}
            onLocationSet={setUserZipCode}
          />

          {/* Headline */}
          <h1
            style={{
              fontSize: typography.sizes['4xl'],
              fontWeight: typography.weights.bold,
              lineHeight: typography.leading.tight,
              color: colors.textPrimary,
              marginBottom: spacing.sm,
              letterSpacing: '-0.02em',
            }}
          >
            <>
              {hero.headline_line1}
              <br />
              <span style={{ color: colors.primaryDark }}>{hero.headline_line2}</span>
            </>
          </h1>

          {/* Subheadline */}
          <p
            style={{
              fontSize: typography.sizes.lg,
              lineHeight: typography.leading.relaxed,
              color: colors.textSecondary,
              marginBottom: spacing.lg,
              maxWidth: '540px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            {hero.subtitle}
          </p>

          {/* CTAs — 3 outlined buttons, same style */}
          <div
            className="flex flex-col sm:flex-row justify-center items-center"
            style={{ gap: spacing.xs, marginBottom: spacing.xl }}
          >
            {[
              { label: term(vertical, 'browse_products_cta'), href: browseUrl },
              { label: term(vertical, 'find_markets_cta'), href: marketsUrl },
              { label: term(vertical, 'find_vendors_cta'), href: vendorsUrl },
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

          {/* Trust indicators */}
          <div
            className="flex flex-wrap items-center justify-center"
            style={{
              gap: spacing.md,
              color: colors.textMuted,
              fontSize: typography.sizes.sm,
            }}
          >
            {[
              term(vertical, 'trust_vendors'),
              term(vertical, 'trust_pickup'),
              term(vertical, 'trust_payments'),
            ].map((label) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="rounded-full"
                  style={{ width: 8, height: 8, backgroundColor: colors.primary }}
                />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
