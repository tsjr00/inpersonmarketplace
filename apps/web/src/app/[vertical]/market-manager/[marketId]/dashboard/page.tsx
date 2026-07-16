import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { getOnboardingProgress, getParkOnboardingProgress } from '@/lib/markets/onboarding-progress'
import { colors, spacing, typography, containers } from '@/lib/design-tokens'
import ManagerJumpNav from '@/components/market-manager/ManagerJumpNav'
import FtParkDashboardBody from '@/components/market-manager/FtParkDashboardBody'
import FmDashboardBody from '@/components/market-manager/FmDashboardBody'
import { getManagerDashboardStats, getMarketTransactionsAggregates, getManagerEarningsAggregates, getParkManagerEarningsAggregates } from '@/lib/markets/manager-dashboard-stats'
import { getParkWeekSchedule } from '@/lib/markets/park-week-schedule'
import { getMarketVisibilityStatus } from '@/lib/markets/market-visibility'

interface PageProps {
  params: Promise<{ vertical: string; marketId: string }>
}

/**
 * Market Manager dashboard — skeleton page for v1.
 *
 * Auth: redirects to /[vertical]/dashboard if the current user is not the
 * assigned manager of this market (per isMarketManager dual-key check).
 *
 * Content: placeholder. Real surfaces (vendor list, weekly bookings,
 * surveys, share tools, etc.) ship in Phase 2+ per market_manager_v2_plan.md.
 *
 * Vertical scope: FM only for v1. The card on the buyer dashboard already
 * filters to FM, so a non-FM user shouldn't reach this page through normal
 * navigation. The auth check still works for any vertical (it just looks
 * up the row by id), but rendering FM-flavored copy is fine since the v1
 * scope is FM.
 */
export default async function MarketManagerDashboardPage({ params }: PageProps) {
  const { vertical, marketId } = await params
  // FT parks use the per-day spot model — hide FM booth/weekly/season-only
  // manager surfaces (P2.5; see ft_park_manager_design.md).
  const isFoodTrucks = vertical === 'food_trucks'
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) {
    redirect(`/${vertical}/dashboard`)
  }

  // Auto-link: admin can assign a manager by email before they've signed up,
  // which leaves markets.manager_user_id NULL — the manager still authenticates
  // via the manager_email branch of isMarketManager, but in-app notifications
  // need a user_id to deliver to (see webhooks.ts manager-paid guard). The FM
  // backfill (buyer dashboard) is farmers_market-only, so FT park managers never
  // got linked. Backfill here on any market-manager dashboard load: idempotent
  // (guarded by manager_user_id IS NULL), email-matched, service-client write.
  if (user.email) {
    await createServiceClient()
      .from('markets')
      .update({ manager_user_id: user.id, manager_accepted_at: new Date().toISOString() })
      .eq('id', marketId)
      .ilike('manager_email', user.email)
      .is('manager_user_id', null)
  }

  // User is the manager — fetch the market row for display.
  // `logo_url` (mig 140) + `description` power the Branding card.
  // `season_start` + `season_end` define the season window for the
  // Market activity card (D.1) — fall back to last 90 days if null.
  const { data: market } = await supabase
    .from('markets')
    .select('id, name, address, city, state, market_type, status, timezone, logo_url, description, season_start, season_end, latitude, longitude, stripe_charges_enabled, park_mode')
    .eq('id', marketId)
    .single()

  if (!market) {
    redirect(`/${vertical}/dashboard`)
  }

  const onboardingProgress = await getOnboardingProgress(marketId)
  const dashboardStats = await getManagerDashboardStats(
    marketId,
    (market.timezone as string | null) ?? null,
    (market.season_start as string | null) ?? null,
    (market.season_end as string | null) ?? null
  )
  const transactionsAggregates = await getMarketTransactionsAggregates(
    marketId,
    (market.timezone as string | null) ?? null,
    (market.season_start as string | null) ?? null,
    (market.season_end as string | null) ?? null,
  )
  // Session 92 A2 — manager-net booth revenue (the money that's actually theirs)
  const earningsAggregates = await getManagerEarningsAggregates(
    marketId,
    (market.timezone as string | null) ?? null,
    (market.season_start as string | null) ?? null,
    (market.season_end as string | null) ?? null,
  )
  // Session 92 A1 — buyer-visibility gate status. Traditional markets only;
  // events are exempt from the visibility rule (different vendor model).
  const visibilityStatus = market.market_type === 'traditional'
    ? await getMarketVisibilityStatus(marketId)
    : null

  // Market schedules for the read-only schedule card (D.2). Service-client
  // not needed — markets is publicly readable; schedules are nested via the
  // existing RLS policy. Manager auth already verified above.
  const { data: schedulesRaw } = await supabase
    .from('market_schedules')
    .select('day_of_week, start_time, end_time, active')
    .eq('market_id', marketId)
  const schedules = (schedulesRaw ?? []).map((s) => ({
    day_of_week: s.day_of_week as number,
    start_time: (s.start_time as string | null) ?? null,
    end_time: (s.end_time as string | null) ?? null,
    active: (s.active as boolean | null) ?? null,
  }))

  // FT parks: day-scoped week schedule (who's booked, which spot, paid?) for
  // the "This week at your park" card. Service client — park tables are
  // service-only (RLS no-policy); manager auth verified above.
  const parkWeek = isFoodTrucks
    ? await getParkWeekSchedule(createServiceClient(), marketId, (market.timezone as string | null) ?? null)
    : null

  // FT parks: operator's spot-rental revenue (NOT food sales). Same net math
  // as FM earnings, over paid park_spot_bookings + operator_keep_pct.
  const parkEarnings = isFoodTrucks
    ? await getParkManagerEarningsAggregates(
        marketId,
        (market.timezone as string | null) ?? null,
        (market.season_start as string | null) ?? null,
        (market.season_end as string | null) ?? null,
      )
    : null

  // FT parks: count of weekly-hold requests awaiting the operator's decision —
  // badges the "Recurring holds" tab so a new request is visible at a glance.
  let pendingHoldRequests = 0
  if (isFoodTrucks) {
    const { count } = await createServiceClient()
      .from('park_standing_reservations')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId)
      .eq('status', 'requested')
    pendingHoldRequests = count ?? 0
  }

  return (
    <div style={{
      maxWidth: containers.lg,
      margin: '0 auto',
      padding: spacing.sm,
    }}>
      <div style={{ marginBottom: spacing.xs }}>
        <Link
          href={`/${vertical}/dashboard`}
          style={{
            color: colors.textMuted,
            fontSize: typography.sizes.sm,
            textDecoration: 'none',
          }}
        >
          ← Back to your dashboard
        </Link>
      </div>

      <h1 style={{
        margin: 0,
        marginBottom: spacing['3xs'],
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.bold,
        color: colors.textPrimary,
      }}>
        {market.name}
      </h1>
      {(market.city || market.state) && (
        <p style={{
          margin: 0,
          marginBottom: spacing.xs,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
        }}>
          {[market.address, market.city, market.state].filter(Boolean).join(' · ')}
        </p>
      )}

      {/* Sticky in-page jump nav (Session 92 design pass) — chips scroll to
          each section group; ids must match the group-leader cards below. */}
      <ManagerJumpNav
        vertical={vertical}
        showMoney={isFoodTrucks ? (parkEarnings?.all_time.booking_count ?? 0) > 0 : true}
      />

      {isFoodTrucks ? (
        <FtParkDashboardBody
          vertical={vertical}
          marketId={marketId}
          market={market as Record<string, unknown>}
          onboardingProgress={onboardingProgress}
          parkOnboarding={await getParkOnboardingProgress(marketId)}
          dashboardStats={dashboardStats}
          parkWeek={parkWeek}
          parkEarnings={parkEarnings}
          pendingHoldRequests={pendingHoldRequests}
          schedules={schedules}
          visibilityStatus={visibilityStatus}
        />
      ) : (
        <FmDashboardBody
          vertical={vertical}
          marketId={marketId}
          market={market as Record<string, unknown>}
          onboardingProgress={onboardingProgress}
          dashboardStats={dashboardStats}
          earningsAggregates={earningsAggregates}
          transactionsAggregates={transactionsAggregates}
          schedules={schedules}
          visibilityStatus={visibilityStatus}
        />
      )}
    </div>
  )
}
