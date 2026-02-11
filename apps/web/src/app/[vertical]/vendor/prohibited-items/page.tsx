import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { PROHIBITED_ITEMS } from '@/lib/onboarding/category-requirements'
import Link from 'next/link'

interface Props {
  params: Promise<{ vertical: string }>
}

export default async function ProhibitedItemsPage({ params }: Props) {
  const { vertical } = await params

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      color: colors.textPrimary,
    }}>
      <div style={{
        maxWidth: containers.md,
        margin: '0 auto',
        padding: `${spacing.md} ${spacing.sm}`,
      }}>
        <Link
          href={`/${vertical}/vendor/dashboard`}
          style={{
            color: colors.primary,
            textDecoration: 'none',
            fontSize: typography.sizes.sm,
            display: 'inline-block',
            marginBottom: spacing.sm,
          }}
        >
          &larr; Back to Dashboard
        </Link>

        <h1 style={{
          margin: `0 0 ${spacing.xs} 0`,
          color: colors.textPrimary,
          fontSize: typography.sizes['2xl'],
          fontWeight: typography.weights.bold,
        }}>
          Prohibited Items Policy
        </h1>

        <p style={{
          margin: `0 0 ${spacing.md} 0`,
          fontSize: typography.sizes.base,
          color: colors.textSecondary,
          lineHeight: 1.6,
        }}>
          The following items are strictly prohibited from being listed or sold on our platform.
          Vendors found in violation of this policy may have their account suspended or permanently removed.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {PROHIBITED_ITEMS.map((item, i) => (
            <div key={i} style={{
              padding: spacing.sm,
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: radius.md,
            }}>
              <div style={{
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold,
                color: '#991b1b',
              }}>
                {i + 1}. {item.item}
              </div>
              <div style={{
                fontSize: typography.sizes.sm,
                color: '#7f1d1d',
                marginTop: spacing['3xs'],
                lineHeight: 1.5,
              }}>
                {item.description}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: spacing.lg,
          padding: spacing.sm,
          backgroundColor: colors.surfaceSubtle,
          borderRadius: radius.md,
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
          lineHeight: 1.6,
        }}>
          <strong>Questions?</strong> If you are unsure whether a product is allowed, please contact our support team before listing it.
          We are happy to help clarify our policies.
        </div>
      </div>
    </div>
  )
}
