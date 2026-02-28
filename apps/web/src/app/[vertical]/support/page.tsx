import Link from 'next/link'
import { SupportForm } from '@/components/support/SupportForm'
import { statusColors, spacing, typography, radius } from '@/lib/design-tokens'

interface SupportPageProps {
  params: Promise<{ vertical: string }>
}

export default async function SupportPage({ params }: SupportPageProps) {
  const { vertical } = await params

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: spacing.lg }}>
        <Link
          href={`/${vertical}/help`}
          style={{
            color: statusColors.neutral500,
            textDecoration: 'none',
            fontSize: typography.sizes.sm,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          ← Help & FAQ
        </Link>
        <h1
          style={{
            color: statusColors.neutral900,
            marginBottom: spacing['2xs'],
            marginTop: spacing.xs,
            fontSize: typography.sizes['2xl'],
          }}
        >
          Contact Support
        </h1>
        <p
          style={{
            color: statusColors.neutral500,
            margin: 0,
            fontSize: typography.sizes.sm,
            lineHeight: 1.5,
          }}
        >
          Have a question or running into an issue? Fill out the form below and
          we&apos;ll get back to you within 24-48 hours.
        </p>
      </div>

      {/* Quick links */}
      <div
        style={{
          marginBottom: spacing.lg,
          padding: spacing.sm,
          backgroundColor: statusColors.neutral50,
          border: `1px solid ${statusColors.neutral200}`,
          borderRadius: radius.md,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: typography.sizes.sm,
            color: statusColors.neutral600,
          }}
        >
          Looking for quick answers? Check our{' '}
          <Link
            href={`/${vertical}/help`}
            style={{ color: statusColors.infoDark, fontWeight: 600 }}
          >
            Help & FAQ
          </Link>{' '}
          page first — it covers common questions about ordering, pickups, and
          account management.
        </p>
      </div>

      {/* Support form */}
      <SupportForm vertical={vertical} />
    </div>
  )
}
