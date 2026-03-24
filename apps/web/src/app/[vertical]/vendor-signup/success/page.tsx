'use client'

import { use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getVerticalColors, getVerticalCSSVars } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { statusColors } from '@/lib/design-tokens'

function getTaxNotice(vertical: string, vendorType: string): { title: string; message: string } | null {
  if (vertical === 'food_trucks') {
    return {
      title: 'Sales Tax Reminder',
      message: 'Prepared food sold for immediate consumption is subject to Texas sales tax. Sales tax will be automatically applied to your listings. Please ensure you have a Texas sales tax permit and are prepared to collect and remit sales tax in accordance with Texas Comptroller guidelines.',
    }
  }
  if (vertical !== 'farmers_market' || !vendorType) return null

  const type = vendorType.toLowerCase()
  if (type.includes('produce') || type.includes('dairy')) {
    return {
      title: 'Sales Tax Information',
      message: 'Fresh produce, dairy, and eggs sold for home consumption are generally exempt from Texas sales tax. However, if you also sell prepared foods, baked goods for immediate consumption, or non-food items, those may be subject to sales tax. You will set the tax status per item when creating listings. Please make sure you understand the tax rules that apply to your products and are prepared to comply with all applicable Texas tax laws.',
    }
  }
  if (type.includes('meat')) {
    return {
      title: 'Sales Tax Information',
      message: 'Raw and frozen meats sold for home consumption are generally exempt from Texas sales tax. However, cooked or ready-to-eat meat products (e.g., smoked brisket plates, rotisserie chicken) are taxable as prepared food. You will set the tax status per item when creating listings. Please ensure you understand which of your products are taxable and are prepared to comply with all applicable Texas tax laws.',
    }
  }
  if (type.includes('baked')) {
    return {
      title: 'Sales Tax Information',
      message: 'Baked goods sold for home consumption (loaves of bread, bags of cookies, whole pies) are generally exempt from Texas sales tax. However, items sold as individual servings for immediate consumption (a slice of pie with a fork, a cupcake with a napkin) are taxable. You will set the tax status per item when creating listings. Please ensure you understand the distinction and are prepared to comply with all applicable Texas tax laws.',
    }
  }
  if (type.includes('prepared')) {
    return {
      title: 'Sales Tax Reminder',
      message: 'Prepared foods sold for immediate consumption are subject to Texas sales tax. This includes hot foods, foods served with utensils, and foods sold at booths with seating. Sales tax will be automatically applied to your listings in this category. Please ensure you have a Texas sales tax permit and are prepared to collect and remit sales tax in accordance with Texas Comptroller guidelines.',
    }
  }
  // "Other" or unrecognized
  return {
    title: 'Sales Tax Information',
    message: 'Texas sales tax rules vary by product type. Food items sold for home consumption are generally exempt, while prepared foods, plants, crafts, and non-food items are typically taxable. You will set the tax status per item when creating your listings. Please make sure you understand the tax rules that apply to your specific products and are prepared to comply with all applicable Texas tax laws.',
  }
}

export default function VendorSignupSuccess({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = use(params)
  const searchParams = useSearchParams()
  const vendorType = searchParams.get('type') || ''
  const verticalColors = getVerticalColors(vertical)
  const cssVars = getVerticalCSSVars(vertical)
  const taxNotice = getTaxNotice(vertical, vendorType)

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

        {/* Tax notice — based on vendor type selected during signup */}
        {taxNotice && (
          <div style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: radius.md,
            padding: spacing.sm,
            marginBottom: spacing.xl,
            textAlign: 'left',
          }}>
            <p style={{
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.bold,
              color: '#92400e',
              margin: `0 0 ${spacing['2xs']} 0`,
            }}>
              {taxNotice.title}
            </p>
            <p style={{
              fontSize: typography.sizes.sm,
              color: '#78350f',
              margin: 0,
              lineHeight: typography.leading.relaxed,
            }}>
              {taxNotice.message}
            </p>
          </div>
        )}

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
