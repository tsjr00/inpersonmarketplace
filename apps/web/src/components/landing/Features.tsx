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

interface FeaturesProps {
  vertical: string
}

/**
 * Features Section
 * Industry standard: Subtle background, icons use accent color for warmth
 * Card pattern with hover effects
 */
export function Features({ vertical }: FeaturesProps) {
  const isFarmersMarket = vertical === 'farmers_market'

  // Cards organized by theme pairs:
  // Row 1: Trust & Community (Verified Vendors + Local Focus)
  // Row 2: Pre-order Benefits (No Sold-Out Items + Your Time, Your Way)
  // Row 3: Technology & Access (Mobile Friendly + Order Updates)
  const features = [
    {
      icon: Shield,
      title: 'Verified Vendors',
      description: 'Every vendor is verified before joining. Shop with confidence knowing you\'re buying from legitimate local sellers.'
    },
    {
      icon: MapPin,
      title: 'Local Focus',
      description: isFarmersMarket
        ? 'Search from 10 to 100 miles to find what\'s nearest to you. Built to serve both urban neighborhoods and rural communities — always focused on your most local vendors first.'
        : 'Discover sellers near you. All transactions happen locally for easy pickup.'
    },
    {
      icon: CheckCircle,
      title: 'No Sold-Out Items',
      description: isFarmersMarket
        ? 'Pre-order your favorites with confirmed availability from the vendor. Sleep in on market day and still get everything you want.'
        : 'Reserve products ahead of time. Confirmed availability means no disappointment.'
    },
    {
      icon: Clock,
      title: 'Your Time, Your Way',
      description: isFarmersMarket
        ? 'Pre-order and pick up on your schedule. Enjoy the market experience without the early morning rush.'
        : 'Order ahead and pick up when it\'s convenient for you. No more rushing.'
    },
    {
      icon: Smartphone,
      title: 'Mobile Friendly',
      description: 'Shop from any device, whether you\'re on the go or browsing from home. No laptop needed — everything works beautifully from your phone.'
    },
    {
      icon: Bell,
      title: 'Order Updates',
      description: 'Stay informed with in-app, SMS, and email notifications. Opt into what you prefer and never miss an update.'
    }
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
            Why Choose Our Platform
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
            Built for shoppers and vendors who value quality, convenience, and community
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
