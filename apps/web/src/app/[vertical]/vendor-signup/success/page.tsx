'use client'

import { use } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getVerticalColors, getVerticalCSSVars } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { statusColors } from '@/lib/design-tokens'

export default function VendorSignupSuccess({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = use(params)
  const verticalColors = getVerticalColors(vertical)
  const cssVars = getVerticalCSSVars(vertical)

  const steps = [
    {
      number: '1',
      title: 'Application Review',
      description: 'Our team will review your application. This typically takes 1-2 business days.',
      status: 'current' as const,
    },
    {
      number: '2',
      title: 'Upload Required Documents',
      description: `Once approved, you'll upload any required permits or certifications for your product categories.`,
      status: 'upcoming' as const,
    },
    {
      number: '3',
      title: 'Connect Payment',
      description: 'Set up your bank account through Stripe so you can receive payouts for your sales.',
      status: 'upcoming' as const,
    },
    {
      number: '4',
      title: 'Start Selling',
      description: `Create your first ${term(vertical, 'listing')}, join a ${term(vertical, 'market')}, and start accepting orders!`,
      status: 'upcoming' as const,
    },
  ]

  return (
    <div style={{ ...cssVars as React.CSSProperties, minHeight: '100vh', backgroundColor: colors.surfaceBase }}>
      <main style={{
        maxWidth: containers.md,
        margin: '0 auto',
        padding: `${spacing['3xl']} ${spacing.md}`,
        textAlign: 'center',
      }}>
        {/* Celebration icon */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          backgroundColor: statusColors.successLight,
          border: `3px solid ${statusColors.successBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
          fontSize: 36,
        }}>
          <span role="img" aria-label="Celebration">&#10003;</span>
        </div>

        {/* Main heading */}
        <h1 style={{
          fontSize: typography.sizes['3xl'],
          fontWeight: typography.weights.bold,
          color: colors.textPrimary,
          marginTop: spacing.md,
          marginBottom: spacing.xs,
          lineHeight: typography.leading.tight,
        }}>
          Application Submitted!
        </h1>

        <p style={{
          fontSize: typography.sizes.lg,
          color: colors.textSecondary,
          maxWidth: '480px',
          margin: `0 auto ${spacing.xl}`,
          lineHeight: typography.leading.relaxed,
        }}>
          Welcome aboard! Your {term(vertical, 'vendor')} application has been received.
          We&apos;ll review it and get back to you shortly.
        </p>

        {/* What happens next */}
        <div style={{
          backgroundColor: colors.surfaceElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: spacing.lg,
          textAlign: 'left',
          marginBottom: spacing.xl,
          boxShadow: shadows.md,
        }}>
          <h2 style={{
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
            marginTop: 0,
            marginBottom: spacing.md,
          }}>
            What Happens Next
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            {steps.map((step) => (
              <div key={step.number} style={{
                display: 'flex',
                gap: spacing.sm,
                alignItems: 'flex-start',
              }}>
                {/* Step number */}
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: step.status === 'current' ? verticalColors.primary : colors.surfaceMuted,
                  color: step.status === 'current' ? verticalColors.textInverse : colors.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.bold,
                  flexShrink: 0,
                  marginTop: '2px',
                }}>
                  {step.number}
                </div>

                {/* Step content */}
                <div>
                  <h3 style={{
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold,
                    color: step.status === 'current' ? colors.textPrimary : colors.textMuted,
                    margin: 0,
                    lineHeight: typography.leading.snug,
                  }}>
                    {step.title}
                  </h3>
                  <p style={{
                    fontSize: typography.sizes.sm,
                    color: colors.textMuted,
                    margin: `${spacing['3xs']} 0 0`,
                    lineHeight: typography.leading.normal,
                  }}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tip box */}
        <div style={{
          backgroundColor: statusColors.infoLight,
          border: `1px solid ${statusColors.infoBorder}`,
          borderRadius: radius.md,
          padding: spacing.sm,
          marginBottom: spacing.xl,
          textAlign: 'left',
        }}>
          <p style={{
            fontSize: typography.sizes.sm,
            color: statusColors.infoDark,
            margin: 0,
            lineHeight: typography.leading.normal,
          }}>
            <strong>Tip:</strong> You&apos;ll receive an email notification when your application is reviewed.
            You can also check your status anytime on your vendor dashboard.
          </p>
        </div>

        {/* CTA button */}
        <Link
          href={`/${vertical}/vendor/dashboard`}
          style={{
            display: 'inline-block',
            padding: `${spacing.xs} ${spacing.lg}`,
            backgroundColor: verticalColors.primary,
            color: verticalColors.textInverse,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            borderRadius: radius.md,
            textDecoration: 'none',
            boxShadow: shadows.primary,
            transition: 'all 0.2s ease',
          }}
        >
          Go to Vendor Dashboard
        </Link>
      </main>
    </div>
  )
}
