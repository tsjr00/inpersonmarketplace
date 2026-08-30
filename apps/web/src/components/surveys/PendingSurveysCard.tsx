import { createServiceClient } from '@/lib/supabase/server'
import { ensurePendingVendorSurveys } from '@/lib/surveys/lazy-generate'
import DashboardTile, { TileBadge } from '@/components/dashboard/DashboardTile'
import { term } from '@/lib/vertical'

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
       `active`, NOT `attention` — survey intensity is a property of WHO IS
       LOOKING, not of the feature (owner, 2026-08-07). A survey serves whoever
       reads it more than whoever fills it, so the nudge is tuned per audience:
         · BUYER  (RateOrderCard)       → `attention`. Most reluctant audience,
                                          least direct reward, but their ratings
                                          are what vendors need. Loudest nudge.
         · VENDOR (this card)           → `active`. Filling a post-market survey
                                          mainly helps the MARKET MANAGER (tuning
                                          + grant applications), so the vendor's
                                          benefit is real but indirect. Visible,
                                          not alarming.
         · MANAGER                      → no nudge. They consume the results.
       Keeping this below `attention` is what stops "you have a task" from
       flattening into one undifferentiated volume across the dashboard. */
    <DashboardTile
      href={`/${vertical}/vendor/surveys`}
      icon="listings"
      title={`My ${term(vertical, 'market')} Surveys`}
      state={pendingCount > 0 ? 'active' : 'neutral'}
      badge={pendingCount > 0 ? <TileBadge>{pendingCount}</TileBadge> : undefined}
    >
      {pendingCount > 0 ? (
        <>
          You have <strong>{pendingCount} pending survey{pendingCount === 1 ? '' : 's'}</strong> — one per place you sold at this week. Each takes under a minute — tell the {term(vertical, 'manager').toLowerCase()} what worked for you and what didn&apos;t.
        </>
      ) : (
        <>No pending surveys right now. Once a week we&apos;ll ask for a quick rating of each {term(vertical, 'market').toLowerCase()} you sold at that week — traffic, sales, layout, site access.</>
      )}
    </DashboardTile>
  )
}
