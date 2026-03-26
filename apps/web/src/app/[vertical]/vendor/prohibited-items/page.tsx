import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { getProhibitedItems, PROHIBITED_ITEMS_DISCLAIMER } from '@/lib/onboarding/category-requirements'
import Link from 'next/link'

interface Props {
  params: Promise<{ vertical: string }>
}

export default async function ProhibitedItemsPage({ params }: Props) {
  const { vertical } = await params
  const items = getProhibitedItems(vertical)
  const hasStarredItems = items.some(item => item.starred)

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
          The following items are prohibited from being listed or sold on our platform.
          Vendors found in violation of this policy may have their account suspended or permanently removed.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {items.map((item, i) => (
            <div key={i} style={{
              padding: spacing.sm,
              backgroundColor: item.starred ? '#fefce8' : '#fef2f2',
              border: `1px solid ${item.starred ? '#fde68a' : '#fecaca'}`,
              borderRadius: radius.md,
            }}>
              <div style={{
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold,
                color: item.starred ? '#92400e' : '#991b1b',
              }}>
                {item.starred ? '*' : ''}{item.item}
              </div>
              <div style={{
                fontSize: typography.sizes.sm,
                color: item.starred ? '#78350f' : '#7f1d1d',
                marginTop: spacing['3xs'],
                lineHeight: 1.5,
              }}>
                {item.description}
              </div>
            </div>
          ))}
        </div>

        {hasStarredItems && (
          <p style={{
            marginTop: spacing.sm,
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            fontStyle: 'italic',
            lineHeight: 1.6,
          }}>
            *{PROHIBITED_ITEMS_DISCLAIMER}
          </p>
        )}

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
