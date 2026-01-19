'use client'

import { Check, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface VendorPitchProps {
  vertical: string
}

/**
 * Vendor Pitch Section
 * Industry standard: Dark background for contrast/emphasis section
 * Uses inverse text colors, lighter accent for icons
 */
export function VendorPitch({ vertical }: VendorPitchProps) {
  const isFarmersMarket = vertical === 'farmers_market'

  // Benefits organized by theme pairs (displayed in 2-column grid):
  // Row 1: Market Preparation
  // Row 2: Operations & Payments
  // Row 3: Customer Growth
  const benefits = isFarmersMarket
    ? [
        'Pre-sell products before market day',
        'Know what to bring, reduce waste',
        'Manage orders and inventory easily',
        'Credit card fees already built in',
        'Build a loyal VIP customer base',
        'Get discovered by local shoppers',
      ]
    : [
        'Reach more local customers online',
        'Accept secure online payments',
        'Manage inventory and orders easily',
        'Build customer relationships',
        'Track sales and analytics',
        'Grow your business with less hassle',
      ]

  return (
    <section
      className="landing-section"
      style={{ backgroundColor: colors.primaryDark }}
    >
      <div className="landing-container">
        {/* Header */}
        <div
          className="text-center"
          style={{ marginBottom: spacing.lg }}
        >
          <h2
            style={{
              fontSize: typography.sizes['3xl'],
              fontWeight: typography.weights.bold,
              color: colors.textInverse,
              marginBottom: spacing.sm,
            }}
          >
            Grow Your Business
          </h2>
          <p
            style={{
              fontSize: typography.sizes.lg,
              color: colors.textInverseMuted,
              maxWidth: '540px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            {isFarmersMarket
              ? 'Join local farmers, bakers, and artisans already selling through our platform.'
              : 'Join our marketplace and connect with buyers in your area.'
            }
          </p>
        </div>

        {/* Benefits Grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 mx-auto"
          style={{
            gap: `${spacing.sm} ${spacing.xl}`,
            maxWidth: '700px',
            marginBottom: spacing.lg,
          }}
        >
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="flex items-start"
              style={{ gap: spacing.xs }}
            >
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 24,
                  height: 24,
                  backgroundColor: colors.primary,
                  marginTop: 2,
                }}
              >
                <Check
                  style={{
                    width: 14,
                    height: 14,
                    color: colors.textInverse,
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.medium,
                  color: colors.textInverse,
                }}
              >
                {benefit}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href={`/${vertical}/vendor-signup`}
            className="inline-flex items-center justify-center transition-all"
            style={{
              backgroundColor: colors.surfaceElevated,
              color: colors.primaryDark,
              padding: `${spacing.sm} ${spacing.xl}`,
              borderRadius: radius.full,
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.semibold,
              minWidth: '220px',
              gap: spacing['2xs'],
              boxShadow: shadows.lg,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.surfaceSubtle
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = colors.surfaceElevated
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            Become a Vendor
            <ArrowRight style={{ width: 20, height: 20 }} />
          </Link>

        </div>
      </div>
    </section>
  )
}
