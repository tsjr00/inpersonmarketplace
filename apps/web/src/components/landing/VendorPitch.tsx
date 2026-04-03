'use client'

import { Check } from 'lucide-react'
import Link from 'next/link'
import { spacing, typography, radius, getVerticalColors, getVerticalShadows } from '@/lib/design-tokens'
import { getContent } from '@/lib/vertical'
import { DottedSeparator } from './DottedSeparator'

// FM landing page watermelon palette (landing-only)
const FM_WATERMELON = '#FF6B6B'
const FM_GREEN_DARK = '#2d5016'
const FM_GREEN_VIBRANT_BG = '#8BC34A'

interface VendorPitchProps {
  vertical: string
  locale?: string
}

/**
 * Vendor Pitch Section
 * FM: Light green background, dark green text, watermelon CTA button
 * FT: Red background, gold/yellow heading, gold CTA button
 */
export function VendorPitch({ vertical, locale }: VendorPitchProps) {
  const colors = getVerticalColors(vertical)
  const shadows = getVerticalShadows(vertical)
  const { vendor_pitch } = getContent(vertical, locale)
  const isFM = vertical === 'farmers_market'

  const benefits = vendor_pitch.benefits

  // FM: Vibrant green bg for headline area, white bg for benefits
  if (isFM) {
    return (
      <>
        {/* Green section: headline + subtitle + CTA button */}
        <section
          style={{
            backgroundColor: FM_GREEN_VIBRANT_BG,
            paddingTop: spacing.lg,
            paddingBottom: spacing.lg,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div className="landing-container">
            {/* Header */}
            <div
              className="text-center"
              style={{ marginBottom: spacing.md }}
            >
              <h2
                style={{
                  fontSize: typography.sizes['2xl'],
                  fontWeight: typography.weights.bold,
                  color: '#ffffff',
                  marginBottom: spacing.sm,
                  whiteSpace: 'nowrap',
                }}
              >
                {vendor_pitch.headline}
              </h2>
              <p
                style={{
                  fontSize: typography.sizes.sm,
                  color: '#ffffff',
                  maxWidth: '540px',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                {vendor_pitch.subtitle}
              </p>
            </div>

            {/* Watermelon CTA button */}
            <div className="text-center">
              <Link
                href={`/${vertical}/vendor-signup`}
                className="inline-flex items-center justify-center transition-all"
                style={{
                  backgroundColor: FM_WATERMELON,
                  color: '#ffffff',
                  padding: `${spacing['2xs']} ${spacing.xl}`,
                  borderRadius: radius.full,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  minWidth: '220px',
                  border: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#e85d5d'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = FM_WATERMELON
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                {vendor_pitch.cta}
              </Link>
            </div>
          </div>
        </section>

        {/* White section: Benefits list */}
        <section
          style={{
            backgroundColor: '#ffffff',
            paddingTop: spacing.lg,
            paddingBottom: spacing.lg,
          }}
        >
          <div className="landing-container">
          <div
            className="grid grid-cols-1 md:grid-cols-2"
            style={{
              gap: `${spacing.sm} ${spacing.xl}`,
              maxWidth: '600px',
              margin: '0 auto',
            }}
          >
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="flex items-start"
                style={{ gap: spacing.xs }}
              >
                <Check
                  className="flex-shrink-0"
                  style={{
                    width: 16,
                    height: 16,
                    color: FM_GREEN_DARK,
                    marginTop: 3,
                  }}
                />
                <span
                  style={{
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.medium,
                    color: FM_GREEN_DARK,
                  }}
                >
                  {benefit}
                </span>
              </div>
            ))}
          </div>
          </div>
        </section>
      </>
    )
  }

  // FT uses primary red bg
  const sectionBg = colors.primary
  const headingColor = '#fcd34d'
  const ctaBg = '#fcd34d'
  const ctaColor = '#1a1a1a'
  const ctaHoverBg = '#fbbf24'

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

        {/* CTA — placed above benefits for FT */}
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

        {/* FT: Dotted separator at bottom of vendor pitch */}
        <DottedSeparator color="rgba(255,255,255,0.3)" />
      </div>
    </section>
  )
}
