import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface PendingSurveysCardProps {
  vendorProfileId: string
  vertical: string
}

/**
 * Dashboard card placed in the vendor section of /[vertical]/dashboard.
 * Shows pending survey count + link to the full list (Phase E Stage 3).
 *
 * Server component — single HEAD-count query for pending vendor
 * surveys (not yet submitted, not yet expired). Always renders the
 * card; when 0 pending the body is a quiet "you're all caught up"
 * line to keep the section's card grid stable.
 */
export default async function PendingSurveysCard({
  vendorProfileId,
  vertical,
}: PendingSurveysCardProps) {
  const serviceClient = createServiceClient()
  const { count } = await serviceClient
    .from('market_surveys')
    .select('id', { head: true, count: 'exact' })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('kind', 'vendor')
    .is('submitted_at', null)
    .gt('expires_at', new Date().toISOString())

  const pendingCount = count ?? 0

  return (
    <Link
      href={`/${vertical}/vendor/surveys`}
      style={{
        display: 'block',
        padding: spacing.md,
        backgroundColor: pendingCount > 0 ? '#fff7e6' : colors.surfaceElevated,
        color: colors.textPrimary,
        border: `1px solid ${pendingCount > 0 ? '#ffd57a' : colors.border}`,
        borderRadius: radius.md,
        textDecoration: 'none',
      }}
    >
      <h3 style={{
        marginTop: 0,
        marginBottom: spacing['2xs'],
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
      }}>
        📋 Market surveys
      </h3>
      {pendingCount > 0 ? (
        <p style={{
          margin: 0,
          color: '#664d03',
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          You have <strong>{pendingCount} pending survey{pendingCount === 1 ? '' : 's'}</strong> from recent market day{pendingCount === 1 ? '' : 's'}. Each takes under a minute — your ratings help the manager + funders.
        </p>
      ) : (
        <p style={{
          margin: 0,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          No pending surveys right now. After each market day you attend, we&apos;ll send a short rating form to help the manager improve.
        </p>
      )}
    </Link>
  )
}
