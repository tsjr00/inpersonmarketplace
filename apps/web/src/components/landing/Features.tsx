'use client'

import {
  Shield,
  Smartphone,
  MapPin,
  Bell,
  CheckCircle,
  Clock
} from 'lucide-react'
import { colors, spacing, typography, shadows, radius } from '@/lib/design-tokens'
import { getContent } from '@/lib/vertical'

interface FeaturesProps {
  vertical: string
}

/**
 * Features Section
 * Industry standard: Subtle background, icons use accent color for warmth
 * Card pattern with hover effects
 */
export function Features({ vertical }: FeaturesProps) {
  const { features: f, platform } = getContent(vertical)

  // Cards organized by theme pairs:
  // Row 1: Trust & Community (Verified Vendors + Local Focus)
  // Row 2: Pre-order Benefits (No Sold-Out Items + Your Time, Your Way)
  // Row 3: Technology & Access (Mobile Friendly + Order Updates)
  const features = [
    { icon: Shield, ...f.verified },
    { icon: MapPin, ...f.local },
    { icon: CheckCircle, ...f.no_soldout },
    { icon: Clock, ...f.schedule },
    { icon: Smartphone, ...f.mobile },
    { icon: Bell, ...f.updates },
  ]

  return (
    <section
      className="landing-section"
      style={{ backgroundColor: colors.surfaceSubtle }}
    >
      <div className="landing-container">
        {/* Section Header */}
        <div
          className="text-center"
          style={{ marginBottom: spacing.xl }}
        >
          <h2
            style={{
              fontSize: typography.sizes['3xl'],
              fontWeight: typography.weights.bold,
              color: colors.textPrimary,
              marginBottom: spacing.xs,
            }}
          >
            {platform.why_choose_headline}
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
            {platform.why_choose_subtitle}
          </p>
        </div>

        {/* Features Grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-2"
          style={{ gap: spacing.md }}
        >
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div
                key={index}
                className="landing-card"
                style={{
                  padding: spacing.md,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.lg,
                  boxShadow: shadows.sm,
                }}
              >
                <Icon
                  style={{
                    width: 40,
                    height: 40,
                    color: colors.accentMuted,
                    marginBottom: spacing.sm,
                  }}
                />
                <h3
                  style={{
                    fontSize: typography.sizes.lg,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary,
                    marginBottom: spacing['2xs'],
                  }}
                >
                  {feature.title}
                </h3>
                <p
                  style={{
                    fontSize: typography.sizes.sm,
                    color: colors.textSecondary,
                    lineHeight: typography.leading.relaxed,
                  }}
                >
                  {feature.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
