'use client'

import { Search, ShoppingCart, Package, Users } from 'lucide-react'
import Link from 'next/link'
import { spacing, typography, radius, containers, getVerticalColors, getVerticalShadows } from '@/lib/design-tokens'
import { getContent } from '@/lib/vertical'

interface HowItWorksProps {
  vertical: string
}

export function HowItWorks({ vertical }: HowItWorksProps) {
  const colors = getVerticalColors(vertical)
  const shadows = getVerticalShadows(vertical)
  const { how_it_works } = getContent(vertical)

  const steps = [
    {
      icon: Search,
      title: how_it_works.step1_title,
      description: how_it_works.step1_text,
    },
    {
      icon: ShoppingCart,
      title: how_it_works.step2_title,
      description: how_it_works.step2_text,
    },
    {
      icon: Package,
      title: how_it_works.step3_title,
      description: how_it_works.step3_text,
    },
    {
      icon: Users,
      title: how_it_works.step4_title,
      description: how_it_works.step4_text,
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

        {/* Stacked Circle CTA — centered vertically between cards and next section */}
        <div className="text-center" style={{ paddingTop: spacing.lg, paddingBottom: spacing.lg }}>
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

          <div style={{ marginTop: spacing.md }}>
            <Link
              href={`/${vertical}/help`}
              style={{
                fontSize: typography.sizes.sm,
                color: colors.textSecondary,
                textDecoration: 'none',
                fontStyle: 'italic',
                borderBottom: `1px solid ${colors.textMuted}`,
                paddingBottom: 2,
              }}
            >
              Want a more detailed walkthrough? Visit our Help Center
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
