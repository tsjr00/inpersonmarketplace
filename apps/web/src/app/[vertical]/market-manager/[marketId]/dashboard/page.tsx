import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { getOnboardingProgress } from '@/lib/markets/onboarding-progress'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import VendorBoothList from '@/components/market-manager/VendorBoothList'
import BoothInventoryManager from '@/components/market-manager/BoothInventoryManager'
import BoothPlaceholderManager from '@/components/market-manager/BoothPlaceholderManager'
import BoothOccupancyGrid from '@/components/market-manager/BoothOccupancyGrid'
import SurveyResultsCard from '@/components/market-manager/SurveyResultsCard'
import OptinManager from '@/components/market-manager/OptinManager'
import OnboardingChecklist from '@/components/market-manager/OnboardingChecklist'
import VerificationDocumentsCard from '@/components/market-manager/VerificationDocumentsCard'
import MarketBrandingCard from '@/components/market-manager/MarketBrandingCard'
import MarketTransactionsCard from '@/components/market-manager/MarketTransactionsCard'
import WeeklyBookingsCard from '@/components/market-manager/WeeklyBookingsCard'
import MarketStripeConnectCard from '@/components/market-manager/MarketStripeConnectCard'
import MarketScheduleCard from '@/components/market-manager/MarketScheduleCard'
import MarketCancelDateCard from '@/components/market-manager/MarketCancelDateCard'
import MarketSeasonCard from '@/components/market-manager/MarketSeasonCard'
import MarketSeasonSettlementCard from '@/components/market-manager/MarketSeasonSettlementCard'
import ManagerSupportCard from '@/components/market-manager/ManagerSupportCard'
import MarketBroadcastCard from '@/components/market-manager/MarketBroadcastCard'
import MarketAttendanceCard from '@/components/market-manager/MarketAttendanceCard'
import ManagerCard, { MANAGER_NAV_OFFSET } from '@/components/market-manager/ManagerCard'
import ManagerJumpNav from '@/components/market-manager/ManagerJumpNav'
import InviteVendorLink from '@/components/market-manager/InviteVendorLink'
import InviteVendorBrowser from '@/components/market-manager/InviteVendorBrowser'
import ManagerActionSummary from '@/components/market-manager/ManagerActionSummary'
import MarketVisibilityCard from '@/components/market-manager/MarketVisibilityCard'
import ManagerEarningsCard from '@/components/market-manager/ManagerEarningsCard'
import { getManagerDashboardStats, getMarketTransactionsAggregates, getManagerEarningsAggregates } from '@/lib/markets/manager-dashboard-stats'
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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) {
    redirect(`/${vertical}/dashboard`)
  }

  // User is the manager — fetch the market row for display.
  // `logo_url` (mig 140) + `description` power the Branding card.
  // `season_start` + `season_end` define the season window for the
  // Market activity card (D.1) — fall back to last 90 days if null.
  const { data: market } = await supabase
    .from('markets')
    .select('id, name, address, city, state, market_type, status, timezone, logo_url, description, season_start, season_end, latitude, longitude, stripe_charges_enabled')
    .eq('id', marketId)
    .single()

  if (!market) {
    redirect(`/${vertical}/dashboard`)
  }

  const onboardingProgress = await getOnboardingProgress(marketId)
  const dashboardStats = await getManagerDashboardStats(marketId, (market.timezone as string | null) ?? null)
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
      <ManagerJumpNav />

      {/* Setup checklist — links into the onboarding wizard if anything
          is incomplete; collapses to a thin "Setup complete" line once
          required steps are done */}
      <div id="setup" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
        <OnboardingChecklist vertical={vertical} marketId={marketId} progress={onboardingProgress} />
      </div>

      {/* Buyer-visibility gate status (Session 92 A1) — names the
          listing+schedule rule and shows the live per-vendor breakdown
          so a new manager knows exactly why their market isn't in the
          public directory yet and what activates it. */}
      {visibilityStatus && <MarketVisibilityCard status={visibilityStatus} />}

      {/* Verification documents (NEW-7, mig 148) — manager uploads
          ownership/COI/venue-proof docs that the platform admin reviews
          during the status=pending → active approval workflow. Placed
          immediately below the onboarding checklist so it's high-visibility
          for managers who just signed up. Files are private; signed-URL
          access only. */}
      <VerificationDocumentsCard marketId={marketId} />

      {/* Action summary — surfaces "needs booth #" count + next market
          day stat. Renders nothing during onboarding (defers to checklist)
          or when there's nothing actionable. */}
      <ManagerActionSummary
        vertical={vertical}
        marketId={marketId}
        progress={onboardingProgress}
        stats={dashboardStats}
      />

      {/* Manager booth-rental earnings (Session 92 A2) — the manager's
          OWN money, net of platform fees. Renders nothing until the
          first rental is collected. Placed before the gross-GMV card so
          "your money" reads before "your vendors' money". Anchors the
          "Money" jump-nav group. */}
      <div id="money" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
        <ManagerEarningsCard aggregates={earningsAggregates} />
      </div>

      {/* Aggregate transactions — gross sales activity across 3 windows.
          Phase D.1 (2026-05-16). Renders nothing if all windows are empty. */}
      <MarketTransactionsCard aggregates={transactionsAggregates} />

      {/* Weekly booth rental bookings (Phase C Stage 1, 2026-05-16).
          Renders nothing when no bookings exist. Read-only display in
          this stage — booth-number editor + payment ship in next stages.
          Wrapped with id="weekly-bookings" + scrollMarginTop so the
          booth_rental_paid_manager notification's anchor link scrolls
          here cleanly (2026-05-19). */}
      <div id="weekly-bookings" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
        <WeeklyBookingsCard marketId={marketId} marketTimezone={(market.timezone as string | null) ?? null} />
      </div>

      {/* Stripe Connect onboarding (Phase C Stage 2, 2026-05-17). Sits
          right after bookings so the "you have bookings → here's how to
          get paid" narrative flow is clear. Self-fetches status; renders
          start/continue/under-review/active depending on Stripe state. */}
      <MarketStripeConnectCard marketId={marketId} marketStatus={(market.status as string | null) ?? null} />

      {/* Branding — upload logo for public market profile + invite landing
          (mig 140, Phase B 2026-05-16). Optional; no setup gating. */}
      <MarketBrandingCard
        marketId={marketId}
        initialLogoUrl={(market.logo_url as string | null) ?? null}
        initialDescription={(market.description as string | null) ?? null}
      />

      {/* Booth inventory — manage size tiers + per-week prices. Anchors
          the "Booths" jump-nav group. */}
      <ManagerCard
        id="booths"
        title="Booth inventory"
        description="Configure the booth size tiers at your market — how many of each size you have and the weekly rental price. This is the foundation for the weekly vendor booking flow."
      >
        <BoothInventoryManager marketId={marketId} />
      </ManagerCard>

      {/* Booth occupancy grid — current week, per tier. Combines
          off-platform placeholders, on-platform vendors with a tier,
          and paid weekly_booth_rentals for the current week. Rendered
          after inventory because it depends on tier definitions. */}
      <BoothOccupancyGrid
        marketId={marketId}
        marketTimezone={(market.timezone as string | null) ?? null}
      />

      {/* Off-platform vendor booth placeholders — track occupancy without
          on-platform vendor identity */}
      <ManagerCard
        title="Off-platform booth placeholders"
        description="Track booths occupied by vendors who are not on the platform. No vendor identity is captured — just the booth number and (optionally) which size tier it counts against. Useful when you have existing vendors who haven't onboarded yet."
      >
        <BoothPlaceholderManager marketId={marketId} />
      </ManagerCard>

      {/* Vendors at this market — assign / edit booth numbers. Anchors the
          "Vendors" jump-nav group. */}
      <ManagerCard
        id="vendors"
        title="Vendors at this market"
        description="Assign booth numbers to vendors who are on the platform and at this market. Off-platform vendor placeholders ship in a later update."
        headerAccessory={dashboardStats.activeVendorsNeedingBooth > 0 ? (
          <span style={{
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
            color: '#92400e',
            backgroundColor: '#fef3c7',
            padding: `${spacing['3xs']} ${spacing.xs}`,
            borderRadius: radius.sm,
          }}>
            {dashboardStats.activeVendorsNeedingBooth} need{dashboardStats.activeVendorsNeedingBooth === 1 ? 's' : ''} booth #
          </span>
        ) : undefined}
      >
        <VendorBoothList marketId={marketId} vertical={vertical} />
      </ManagerCard>

      {/* Invite a vendor — copy-able co-branded signup link */}
      <ManagerCard
        title="Invite a vendor"
        description="Share this link with a vendor you'd like to bring to your market. They'll see a banner identifying your market on the standard signup page."
      >
        <InviteVendorLink
          vertical={vertical}
          marketId={marketId}
          marketName={market.name as string}
          onboardingComplete={onboardingProgress.required_complete === onboardingProgress.required_total}
        />
      </ManagerCard>

      {/* NEW-8: bulk-invite browser for on-platform vendors near this
          market. Same onboarding gate as InviteVendorLink — invite landing
          would render an incomplete agreement otherwise. Component handles
          the "no coordinates yet" empty state internally. */}
      {onboardingProgress.required_complete === onboardingProgress.required_total && (
        <InviteVendorBrowser
          marketId={marketId}
          marketName={market.name as string}
          marketLat={(market.latitude as number | null) ?? null}
          marketLng={(market.longitude as number | null) ?? null}
          vertical={vertical}
        />
      )}

      {/* Opt-in vendor agreement statements — manager picks which ones
          apply to their market */}
      <ManagerCard
        title="Vendor agreement statements"
        description="Select which opt-in statements vendors must accept when they sign up to your market. Statements with placeholders (in curly braces) let you fill in values specific to your market — these get substituted into the vendor-facing text at signup."
      >
        <OptinManager marketId={marketId} />
      </ManagerCard>

      {/* Manager-editable schedule (D.2 2026-05-16; editable since 2026-05-19).
          Manager edits day/time/active + season start/end. Saving requires
          acknowledgment of vendor-refund responsibility + fires a
          market_schedule_changed notification to every approved vendor. */}
      <div id="schedule" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
        <MarketScheduleCard
          marketId={marketId}
          initialSchedules={schedules}
          initialSeasonStart={(market.season_start as string | null) ?? null}
          initialSeasonEnd={(market.season_end as string | null) ?? null}
          hasScheduleChangeRecipients={dashboardStats.hasScheduleChangeRecipients}
        />
      </div>

      {/* Cancel-a-market-day (Phase C) — close a single upcoming date; refunds
          buyers + credits/reschedules booth renters + credits market-box
          pickups server-side. ManagerCard sets its own id="cancel-date" +
          scroll offset (mirrors MarketAttendanceCard). */}
      <MarketCancelDateCard marketId={marketId} />

      {/* Season pre-sales (Phase E) — create a season + open a pre-sale window;
          vendors prepay a whole season (or a partial set of weeks) in one
          checkout. ManagerCard sets its own id="seasons" + scroll offset. */}
      <MarketSeasonCard
        marketId={marketId}
        adminSeasonStart={(market.season_start as string | null) ?? null}
        adminSeasonEnd={(market.season_end as string | null) ?? null}
        stripeChargesEnabled={(market.stripe_charges_enabled as boolean | null) ?? false}
      />

      {/* Season settlement (Phase E) — resolve cancelled-day shortfalls for ended
          seasons via booth credit or off-platform. ManagerCard sets id="settlement". */}
      <MarketSeasonSettlementCard marketId={marketId} />

      {/* Manager broadcast (Session 92 Phase B) — one-way announcement to
          vendors (approved + paid upcoming renters). Send-only; server
          rate-limits to 2 per 7 days. Placed after the schedule card since
          both are manager→vendor communication surfaces. Anchors "Announce". */}
      <div id="announce" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
        <MarketBroadcastCard marketId={marketId} />
      </div>

      {/* Vendor attendance (Phase D) — read-only check-in/out for this market,
          date-selectable for weekly monitoring. Anchors "attendance". */}
      <MarketAttendanceCard marketId={marketId} />

      {/* Survey results card (Phase E Stage 5) — empty state until
          cron Stage 2 starts populating market_surveys rows. Anchors "Surveys". */}
      <div id="surveys" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
        <SurveyResultsCard marketId={marketId} />
      </div>

      {/* Static support card (D.3 2026-05-16) */}
      <ManagerSupportCard vertical={vertical} />

      {/* What's still coming */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceBase,
        border: `1px dashed ${colors.border}`,
        borderRadius: radius.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: colors.textMuted,
        }}>
          Coming soon
        </h2>
        <ul style={{
          margin: 0,
          paddingLeft: spacing.md,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.6,
        }}>
          <li>Post-market vendor + buyer surveys</li>
          <li>Share tools for market-day social promotion</li>
        </ul>
      </div>

      <p style={{
        marginTop: spacing.md,
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        fontStyle: 'italic',
      }}>
        Have feedback on what would make this dashboard most useful for
        your market? Reply to your most recent platform email or reach
        out via the support page.
      </p>
    </div>
  )
}
