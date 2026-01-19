'use client'

import { Search, ShoppingCart, Package, Users } from 'lucide-react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface HowItWorksProps {
  vertical: string
}

export function HowItWorks({ vertical }: HowItWorksProps) {
  const isFarmersMarket = vertical === 'farmers_market'

  const steps = [
    {
      icon: Search,
      title: 'Discover',
      description: isFarmersMarket
        ? 'Find farmers markets and vendors near you. Browse fresh produce, baked goods, and artisan products.'
        : 'Browse verified vendors and discover quality products from local sellers.'
    },
    {
      icon: ShoppingCart,
      title: 'Shop & Order',
      description: isFarmersMarket
        ? 'Choose your market. Add items to your cart. Complete your order with secure checkout (from one or more vendors).'
        : 'Add items to your cart from multiple vendors. Complete your order with secure checkout.'
    },
    {
      icon: Package,
      title: 'Pick Up Fresh',
      description: isFarmersMarket
        ? 'Visit the market. Collect your pre-order items with guaranteed availability.'
        : 'Collect your items at the designated pickup point. Quick, easy, and convenient.'
    },
    {
      icon: Users,
      title: 'Enjoy the Market',
      description: isFarmersMarket
        ? 'Take your time browsing other vendors, meet friends, and enjoy being part of your local community.'
        : 'Connect with local sellers and discover more products in your area.'
    }
  ]

  return (
    <section
      className="flex justify-center"
      style={{
        backgroundColor: colors.surfaceElevated,
        padding: `${spacing['3xl']} 0`,
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
        {/* Section Header */}
        <div className="text-center" style={{ marginBottom: spacing.xl }}>
          <h2
            style={{
              fontSize: typography.sizes['3xl'],
              fontWeight: typography.weights.bold,
              color: colors.textPrimary,
              marginBottom: spacing.xs,
            }}
          >
            How It Works
          </h2>
          <p
            style={{
              fontSize: typography.sizes.lg,
              color: colors.textSecondary,
              maxWidth: '540px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            {isFarmersMarket
              ? 'From farm to table in four simple steps.'
              : 'A simple, streamlined experience from discovery to pickup.'
            }
          </p>
        </div>

        {/* Steps Grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
          style={{ gap: spacing.md, marginBottom: spacing.xl }}
        >
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div
                key={index}
                className="text-center relative transition-all"
                style={{
                  backgroundColor: colors.surfaceElevated,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.lg,
                  padding: spacing.md,
                  boxShadow: shadows.sm,
                }}
              >
                {/* Step number & icon */}
                <div className="relative inline-block" style={{ marginBottom: spacing.sm }}>
                  <div
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: 56,
                      height: 56,
                      backgroundColor: colors.primaryLight,
                    }}
                  >
                    <Icon style={{ width: 28, height: 28, color: colors.primaryDark }} />
                  </div>
                  <span
                    className="absolute flex items-center justify-center rounded-full"
                    style={{
                      top: -4,
                      right: -4,
                      width: 22,
                      height: 22,
                      backgroundColor: colors.primary,
                      color: colors.textInverse,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.bold,
                    }}
                  >
                    {index + 1}
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: typography.sizes.lg,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary,
                    marginBottom: spacing['2xs'],
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    fontSize: typography.sizes.sm,
                    color: colors.textSecondary,
                    lineHeight: typography.leading.relaxed,
                  }}
                >
                  {step.description}
                </p>
              </div>
            )
          })}
        </div>

        {/* Stacked Circle CTA */}
        <div className="text-center">
          <Link
            href={`/${vertical}/browse`}
            className="inline-flex flex-col items-center justify-center transition-all"
            style={{
              width: 140,
              height: 140,
              backgroundColor: colors.primary,
              color: colors.textInverse,
              borderRadius: '50%',
              boxShadow: shadows.primary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = colors.primaryDark
              e.currentTarget.style.transform = 'scale(1.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = colors.primary
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
              Start
            </span>
            <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
              Shopping
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}
