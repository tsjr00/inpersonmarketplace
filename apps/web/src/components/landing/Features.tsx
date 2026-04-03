'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  Smartphone,
  MapPin,
  Bell,
  CheckCircle,
  Clock,
} from 'lucide-react'
import Image from 'next/image'
import { spacing, typography, radius, getVerticalColors, getVerticalShadows } from '@/lib/design-tokens'
import { getContent } from '@/lib/vertical'
import { DottedSeparator } from './DottedSeparator'

interface FeaturesProps {
  vertical: string
  locale?: string
}

/**
 * Features Section
 * FM: 2-column card grid with standalone icons
 * FT: Single-column horizontal list (icon-left, text-right) with dotted separators
 */
export function Features({ vertical, locale }: FeaturesProps) {
  const colors = getVerticalColors(vertical)
  const shadows = getVerticalShadows(vertical)
  const { features: f, platform } = getContent(vertical, locale)
  const isFT = vertical === 'food_trucks'

  // PWA install prompt (FT only)
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null)
  const [showInstallHint, setShowInstallHint] = useState(false)

  useEffect(() => {
    if (!isFT) return
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [isFT])

  const handleInstallClick = useCallback(async () => {
    if (installPrompt && 'prompt' in installPrompt) {
      (installPrompt as { prompt: () => Promise<void> }).prompt()
      setInstallPrompt(null)
    } else {
      // No install prompt available — show hint
      setShowInstallHint(true)
      setTimeout(() => setShowInstallHint(false), 4000)
    }
  }, [installPrompt])

  const features = [
    { icon: Clock, ...f.schedule },
    { icon: Bell, ...f.updates },
    { icon: CheckCircle, ...f.no_soldout },
    { icon: MapPin, ...f.local },
    { icon: Shield, ...f.verified },
    { icon: Smartphone, ...f.mobile },
  ]

  // FT: Horizontal list layout matching mockup
  if (isFT) {
    return (
      <section
        className="landing-section"
        style={{ backgroundColor: colors.surfaceElevated }}
      >
        <div className="landing-container">
          {/* Feature list */}
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <div key={index}>
                  {/* Dotted separator above each item (including first) */}
                  <DottedSeparator />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.md,
                      padding: `${spacing.md} 0`,
                    }}
                  >
                    {/* Icon in red circle — vertically centered */}
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded-full"
                      style={{
                        width: 52,
                        height: 52,
                        backgroundColor: colors.primary,
                      }}
                    >
                      <Icon style={{ width: 26, height: 26, color: '#ffffff' }} />
                    </div>
                    {/* Text content */}
                    <div>
                      <h3
                        style={{
                          fontSize: typography.sizes.lg,
                          fontWeight: typography.weights.bold,
                          color: colors.textPrimary,
                          marginBottom: spacing['3xs'],
                        }}
                      >
                        {feature.title}
                      </h3>
                      <p
                        style={{
                          fontSize: typography.sizes.sm,
                          color: colors.textSecondary,
                          lineHeight: typography.leading.relaxed,
                          margin: 0,
                        }}
                      >
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
            {/* Final dotted separator after last item */}
            <DottedSeparator />
          </div>

          {/* Simplified phone mockup + app icon (PWA install button) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: spacing.lg,
              marginTop: spacing.xl,
              marginBottom: spacing.md,
              position: 'relative',
            }}
          >
            {/* Simple phone outline */}
            <div style={{
              width: 140,
              height: 260,
              border: '2px solid #d1d5db',
              borderRadius: 24,
              position: 'relative',
              backgroundColor: '#ffffff',
            }}>
              {/* Notch */}
              <div style={{
                position: 'absolute',
                top: 8,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 40,
                height: 4,
                backgroundColor: '#d1d5db',
                borderRadius: 2,
              }} />
            </div>
            {/* App icon — clickable PWA install button */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={handleInstallClick}
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 20,
                  overflow: 'hidden',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  display: 'block',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)'
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                }}
                aria-label="Add to Home Screen"
                title="Add to Home Screen"
              >
                <Image
                  src="/logos/food-truckn-logo.png"
                  alt="Food Truck'n App"
                  width={100}
                  height={100}
                  style={{ objectFit: 'cover', display: 'block' }}
                />
              </button>
              {/* Install hint tooltip */}
              {showInstallHint && (
                <div style={{
                  position: 'absolute',
                  top: '110%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: '#1a1a1a',
                  color: '#ffffff',
                  padding: `${spacing['2xs']} ${spacing.sm}`,
                  borderRadius: radius.md,
                  fontSize: typography.sizes.xs,
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                }}>
                  Use your browser&apos;s &quot;Add to Home Screen&quot; option
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  // FM: Stacked list with green icons, watermelon headers, dark green descriptions
  const FM_WATERMELON = '#FF6B6B'
  const FM_GREEN = '#4CAF50'
  const FM_GREEN_DARK = '#2d5016'

  if (vertical === 'farmers_market') {
    return (
      <section
        className="landing-section"
        style={{ backgroundColor: '#ffffff' }}
      >
        <div className="landing-container">
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <div key={index}>
                  {/* Green dotted separator above each item */}
                  <DottedSeparator color="#4CAF50" />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.md,
                      padding: `${spacing.md} 0`,
                    }}
                  >
                    {/* Green circle icon — vertically centered */}
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded-full"
                      style={{
                        width: 48,
                        height: 48,
                        backgroundColor: FM_GREEN,
                      }}
                    >
                      <Icon style={{ width: 24, height: 24, color: '#ffffff' }} />
                    </div>
                    {/* Text */}
                    <div>
                      <h3
                        style={{
                          fontSize: typography.sizes.lg,
                          fontWeight: typography.weights.bold,
                          color: FM_WATERMELON,
                          marginBottom: spacing['3xs'],
                        }}
                      >
                        {feature.title}
                      </h3>
                      <p
                        style={{
                          fontSize: typography.sizes.sm,
                          color: FM_GREEN_DARK,
                          lineHeight: typography.leading.relaxed,
                          margin: 0,
                        }}
                      >
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
            {/* Final dotted separator after last item */}
            <DottedSeparator color="#4CAF50" />
          </div>
        </div>
      </section>
    )
  }

  // Other verticals (non-FT, non-FM): Original 2-column card grid layout
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
