'use client'

import Link from 'next/link'
import { MapPin, ArrowRight } from 'lucide-react'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface HeroProps {
  vertical: string
  listingCount: number
  marketCount: number
}

export function Hero({ vertical, listingCount, marketCount }: HeroProps) {
  const isFarmersMarket = vertical === 'farmers_market'

  return (
    <section
      className="relative min-h-[600px] flex items-center justify-center"
      style={{
        background: `linear-gradient(180deg, ${colors.surfaceSubtle} 0%, ${colors.surfaceBase} 100%)`,
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
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 rounded-full"
            style={{
              padding: `${spacing['2xs']} ${spacing.sm}`,
              marginBottom: spacing.lg,
              backgroundColor: colors.primaryLight,
              color: colors.primaryDark,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
            }}
          >
            <MapPin style={{ width: 16, height: 16 }} />
            <span>
              {marketCount} {isFarmersMarket ? 'Markets' : 'Locations'} &bull; {listingCount}+ Products
            </span>
          </div>

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
            {isFarmersMarket ? (
              <>
                Fresh, Local Food
                <br />
                <span style={{ color: colors.primaryDark }}>From Your Community</span>
              </>
            ) : (
              <>
                Your Local Marketplace
                <br />
                <span style={{ color: colors.primaryDark }}>Shop With Confidence</span>
              </>
            )}
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
            {isFarmersMarket
              ? 'Browse products from local farmers and artisans. Pre-order online and pick up at your neighborhood market.'
              : 'Discover quality products from verified local vendors. Shop securely and pick up at convenient locations near you.'
            }
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row justify-center items-center"
            style={{ gap: spacing.xs, marginBottom: spacing.xl }}
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
              href={`/${vertical}/markets`}
              className="inline-flex items-center justify-center gap-2 transition-all"
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
              Find {isFarmersMarket ? 'Markets' : 'Locations'}
            </Link>
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
            <div className="flex items-center gap-2">
              <span
                className="rounded-full"
                style={{ width: 8, height: 8, backgroundColor: colors.primary }}
              />
              Verified Vendors
            </div>
            <div className="flex items-center gap-2">
              <span
                className="rounded-full"
                style={{ width: 8, height: 8, backgroundColor: colors.primary }}
              />
              Secure Payments
            </div>
            <div className="flex items-center gap-2">
              <span
                className="rounded-full"
                style={{ width: 8, height: 8, backgroundColor: colors.primary }}
              />
              Local Pickup
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
