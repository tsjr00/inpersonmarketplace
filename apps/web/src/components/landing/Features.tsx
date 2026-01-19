'use client'

import {
  Shield,
  Smartphone,
  MapPin,
  Bell,
  RefreshCw,
  Heart
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

  const features = [
    {
      icon: Shield,
      title: 'Verified Vendors',
      description: 'Every vendor is verified before joining. Shop with confidence knowing you\'re buying from legitimate local sellers.'
    },
    {
      icon: Smartphone,
      title: 'Mobile Friendly',
      description: 'Browse, order, and manage pickups from any device. Our platform works seamlessly on phones, tablets, and desktops.'
    },
    {
      icon: MapPin,
      title: 'Local Focus',
      description: isFarmersMarket
        ? 'Find markets and vendors within 25 miles of your location. Support businesses in your own community.'
        : 'Discover sellers near you. All transactions happen locally for easy pickup.'
    },
    {
      icon: Bell,
      title: 'Order Updates',
      description: 'Get notified when your order is confirmed, ready for pickup, and when new products are available.'
    },
    {
      icon: RefreshCw,
      title: 'Easy Returns',
      description: 'Issues with your order? Our vendor policies ensure fair resolution. Customer satisfaction is our priority.'
    },
    {
      icon: Heart,
      title: 'Support Local',
      description: isFarmersMarket
        ? 'Your purchases directly support local farmers, bakers, and artisans. Keep money in your community.'
        : 'Every purchase supports a local business. Build connections in your community.'
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
            Built for buyers and vendors who value quality, convenience, and community
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
