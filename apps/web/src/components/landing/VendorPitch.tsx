'use client'

import { Check } from 'lucide-react'
import Link from 'next/link'
import { spacing, typography, radius, getVerticalColors, getVerticalShadows } from '@/lib/design-tokens'
import { getContent } from '@/lib/vertical'
import { DottedSeparator } from './DottedSeparator'

interface VendorPitchProps {
  vertical: string
}

/**
 * Vendor Pitch Section
 * FM: Dark green background, white text, white CTA button
 * FT: Red background, gold/yellow heading, gold CTA button
 */
export function VendorPitch({ vertical }: VendorPitchProps) {
  const colors = getVerticalColors(vertical)
  const shadows = getVerticalShadows(vertical)
  const { vendor_pitch } = getContent(vertical)
  const isFT = vertical === 'food_trucks'

  const benefits = vendor_pitch.benefits

  // FT uses primary red bg; FM uses primaryDark
  const sectionBg = isFT ? colors.primary : colors.primaryDark
  // FT heading is gold; FM heading is white
  const headingColor = isFT ? '#fcd34d' : colors.textInverse
  // FT CTA is gold bg with dark text; FM CTA is white bg with brand text
  const ctaBg = isFT ? '#fcd34d' : colors.surfaceElevated
  const ctaColor = isFT ? '#1a1a1a' : colors.primaryDark
  const ctaHoverBg = isFT ? '#fbbf24' : colors.surfaceSubtle

  return (
    <section
      className="landing-section"
      style={{ backgroundColor: sectionBg }}
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
              color: headingColor,
              marginBottom: spacing.sm,
              fontStyle: 'normal',
            }}
          >
            {vendor_pitch.headline}
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
            {vendor_pitch.subtitle}
          </p>
        </div>

        {/* CTA — placed above benefits for FT (matching mockup), below for FM */}
        {isFT && (
          <div className="text-center" style={{ marginBottom: spacing.lg }}>
            <Link
              href={`/${vertical}/vendor-signup`}
              className="inline-flex items-center justify-center transition-all"
              style={{
                backgroundColor: ctaBg,
                color: ctaColor,
                padding: `${spacing.sm} ${spacing.xl}`,
                borderRadius: radius.full,
                fontSize: typography.sizes.lg,
                fontWeight: typography.weights.semibold,
                minWidth: '220px',
                gap: spacing['2xs'],
                boxShadow: shadows.lg,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = ctaHoverBg
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = ctaBg
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {vendor_pitch.cta}
            </Link>
          </div>
        )}

        {/* Benefits Grid — FM only (FT mockup doesn't show checkmark benefits) */}
        {!isFT && (
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
        )}

        {/* CTA — FM position (below benefits) */}
        {!isFT && (
          <div className="text-center">
            <Link
              href={`/${vertical}/vendor-signup`}
              className="inline-flex items-center justify-center transition-all"
              style={{
                backgroundColor: ctaBg,
                color: ctaColor,
                padding: `${spacing.sm} ${spacing.xl}`,
                borderRadius: radius.full,
                fontSize: typography.sizes.lg,
                fontWeight: typography.weights.semibold,
                minWidth: '220px',
                gap: spacing['2xs'],
                boxShadow: shadows.lg,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = ctaHoverBg
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = ctaBg
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {vendor_pitch.cta}
            </Link>

            <p
              style={{
                marginTop: spacing.md,
                fontSize: typography.sizes.sm,
                color: colors.textInverseMuted,
                maxWidth: '480px',
                marginLeft: 'auto',
                marginRight: 'auto',
                lineHeight: typography.leading.relaxed,
              }}
            >
              {vendor_pitch.description}
            </p>
          </div>
        )}

        {/* FT: Dotted separator at bottom of vendor pitch */}
        {isFT && <DottedSeparator color="rgba(255,255,255,0.3)" />}
      </div>
    </section>
  )
}
