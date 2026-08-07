import { createServiceClient } from '@/lib/supabase/server'
import { ensurePendingVendorSurveys } from '@/lib/surveys/lazy-generate'
import DashboardTile, { TileBadge } from '@/components/dashboard/DashboardTile'

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

  // COMM-4 part 2: lazily surface any survey this vendor is due for the moment
  // they land here — no waiting for the daily generation cron, no email (the
  // cron skips emailing anyone already surfaced this way). Best-effort.
  await ensurePendingVendorSurveys(serviceClient, vendorProfileId, vertical)

  const { count } = await serviceClient
    .from('market_surveys')
    .select('id', { head: true, count: 'exact' })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('kind', 'vendor')
    .is('submitted_at', null)
    .gt('expires_at', new Date().toISOString())

  const pendingCount = count ?? 0

  return (
    /* A TILE: the whole surface navigates to /vendor/surveys.
       `attention` when surveys are pending — a survey is a task only this vendor
       can complete, which is exactly what that state means. ⚠ It is the loudest
       state in the system, so if a survey nudge ends up competing with genuinely
       time-critical things (an unconfirmed order), this is the call to revisit. */
    <DashboardTile
      href={`/${vertical}/vendor/surveys`}
      icon="listings"
      title="My Market Surveys"
      state={pendingCount > 0 ? 'attention' : 'neutral'}
      badge={pendingCount > 0 ? <TileBadge>{pendingCount}</TileBadge> : undefined}
    >
      {pendingCount > 0 ? (
        <>
          You have <strong>{pendingCount} pending survey{pendingCount === 1 ? '' : 's'}</strong> from recent market day{pendingCount === 1 ? '' : 's'}. Each takes under a minute — your ratings help the manager + funders.
        </>
      ) : (
        <>No pending surveys right now. After each market day you attend, we&apos;ll send a short rating form to help the manager improve.</>
      )}
    </DashboardTile>
  )
}
