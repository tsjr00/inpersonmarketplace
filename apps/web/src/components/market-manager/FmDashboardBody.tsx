import type { ComponentProps, ReactNode } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import ManagerCard, { MANAGER_NAV_OFFSET } from './ManagerCard'
import CollapsibleSection from './CollapsibleSection'
import TabbedCard from './TabbedCard'
import OnboardingChecklist from './OnboardingChecklist'
import MarketVisibilityCard from './MarketVisibilityCard'
import VerificationDocumentsCard from './VerificationDocumentsCard'
import ManagerActionSummary from './ManagerActionSummary'
import ManagerEarningsCard from './ManagerEarningsCard'
import MarketTransactionsCard from './MarketTransactionsCard'
import WeeklyBookingsCard from './WeeklyBookingsCard'
import MarketStripeConnectCard from './MarketStripeConnectCard'
import MarketBrandingCard from './MarketBrandingCard'
import BoothInventoryManager from './BoothInventoryManager'
import MarketMapCard from './MarketMapCard'
import BoothOccupancyGrid from './BoothOccupancyGrid'
import BoothPlaceholderManager from './BoothPlaceholderManager'
import VendorBoothList from './VendorBoothList'
import InviteVendorLink from './InviteVendorLink'
import InviteVendorBrowser from './InviteVendorBrowser'
import OptinManager from './OptinManager'
import MarketScheduleCard from './MarketScheduleCard'
import MarketCancelDateCard from './MarketCancelDateCard'
import MarketSeasonCard from './MarketSeasonCard'
import MarketSeasonSettlementCard from './MarketSeasonSettlementCard'
import MarketBroadcastCard from './MarketBroadcastCard'
import MarketAttendanceCard from './MarketAttendanceCard'
import SurveyResultsCard from './SurveyResultsCard'
import ManagerSupportCard from './ManagerSupportCard'
import type { OnboardingProgress } from '@/lib/markets/onboarding-progress'
import type { ManagerDashboardStats, ManagerEarningsAggregates } from '@/lib/markets/manager-dashboard-stats'

/**
 * FM (farmers-market) manager dashboard body — the FM-only card arrangement,
 * grouped by how a market manager works instead of one flat card per table:
 *   ① What's on your plate · ② Setup (collapsible; first, onboarding-style —
 *   collapsed once onboarding is complete) · ③ Booths & this week · ④ Your
 *   vendors (tabbed) · ⑤ Money & insights · ⑥ Communicate.
 *   (Phase 4a moved Setup ahead of the operational groups.)
 *
 * FT parks use FtParkDashboardBody. Cards are reused with the SAME props they
 * had inline — presentation-only regroup, no logic touched. Booth inventory +
 * occupancy + off-platform placeholders are kept together (id="booths").
 */
interface FmDashboardBodyProps {
  vertical: string
  marketId: string
  market: Record<string, unknown>
  onboardingProgress: OnboardingProgress
  dashboardStats: ManagerDashboardStats
  earningsAggregates: ManagerEarningsAggregates
  transactionsAggregates: ComponentProps<typeof MarketTransactionsCard>['aggregates']
  schedules: Array<{ day_of_week: number; start_time: string | null; end_time: string | null; active: boolean | null }>
  visibilityStatus: ComponentProps<typeof MarketVisibilityCard>['status'] | null
}

function GroupHeading({ id, title, subtitle }: { id?: string; title: string; subtitle?: string }) {
  return (
    <div id={id} style={{ scrollMarginTop: MANAGER_NAV_OFFSET, marginTop: spacing.md, marginBottom: spacing.xs, display: 'flex', alignItems: 'baseline', gap: spacing.xs, flexWrap: 'wrap', borderLeft: `4px solid ${colors.primary}`, paddingLeft: spacing.sm, paddingBottom: spacing.xs, borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary }}>{title}</span>
      {subtitle && <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>{subtitle}</span>}
    </div>
  )
}

export default function FmDashboardBody({
  vertical,
  marketId,
  market,
  onboardingProgress,
  dashboardStats,
  earningsAggregates,
  transactionsAggregates,
  schedules,
  visibilityStatus,
}: FmDashboardBodyProps) {
  const marketName = market.name as string
  const onboardingComplete = onboardingProgress.required_complete === onboardingProgress.required_total

  const rosterTab: ReactNode = (
    <ManagerCard
      title={`${term(vertical, 'vendors')} at this ${term(vertical, 'market').toLowerCase()}`}
      description={`Assign ${term(vertical, 'booth').toLowerCase()} numbers to ${term(vertical, 'vendors').toLowerCase()} who are on the platform and at this ${term(vertical, 'market').toLowerCase()}.`}
      headerAccessory={dashboardStats.activeVendorsNeedingBooth > 0 ? (
        <span style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: '#92400e', backgroundColor: '#fef3c7', padding: `${spacing['3xs']} ${spacing.xs}`, borderRadius: radius.sm }}>
          {dashboardStats.activeVendorsNeedingBooth} need{dashboardStats.activeVendorsNeedingBooth === 1 ? 's' : ''} {term(vertical, 'booth').toLowerCase()} #
        </span>
      ) : undefined}
    >
      <VendorBoothList marketId={marketId} vertical={vertical} />
    </ManagerCard>
  )

  const inviteTab: ReactNode = (
    <>
      <ManagerCard
        title={`Invite a ${term(vertical, 'vendor').toLowerCase()}`}
        description={`Share this link with a ${term(vertical, 'vendor').toLowerCase()} you'd like to bring to your ${term(vertical, 'market').toLowerCase()}. They'll see a banner identifying your ${term(vertical, 'market').toLowerCase()} on the standard signup page.`}
      >
        <InviteVendorLink vertical={vertical} marketId={marketId} marketName={marketName} onboardingComplete={onboardingComplete} />
      </ManagerCard>
      {onboardingComplete && (
        <InviteVendorBrowser
          marketId={marketId}
          marketName={marketName}
          marketLat={(market.latitude as number | null) ?? null}
          marketLng={(market.longitude as number | null) ?? null}
          vertical={vertical}
        />
      )}
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      {/* Tester finding F9 (2026-07-24): new managers had no signal their market
          was submitted for review (markets.status='pending' until admin
          approves). Surface it so the pending state doesn't read as broken. */}
      {market.status === 'pending' && (
        <div style={{
          padding: spacing.md,
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: radius.md,
          fontSize: typography.sizes.sm,
          color: '#1e3a5f',
          lineHeight: 1.5,
        }}>
          <strong>📋 Submitted for review.</strong> Your market and its schedule are in our review queue —
          we usually activate new markets within one business day. Until then it stays hidden from the public.
          Keep setting up in the meantime; you&apos;ll be able to connect Stripe once it&apos;s approved.
        </div>
      )}
      {/* ① Triage */}
      <ManagerActionSummary vertical={vertical} marketId={marketId} progress={onboardingProgress} stats={dashboardStats} />

      {/* ② SETUP — first, onboarding-style (Phase 4a). A new manager configures
          the market before the operational groups below. Collapsed by default
          only once onboarding is complete (Q5 — saves space post-setup). */}
      <CollapsibleSection id="setup" title="Setup" subtitle="Onboarding, payments, schedule, seasons, agreements, branding" defaultCollapsed={onboardingComplete}>
        <OnboardingChecklist vertical={vertical} marketId={marketId} progress={onboardingProgress} />
        <MarketStripeConnectCard marketId={marketId} marketStatus={(market.status as string | null) ?? null} vertical={vertical} />
        <div id="schedule" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
          <MarketScheduleCard
            marketId={marketId}
            vertical={vertical}
            initialSchedules={schedules}
            initialSeasonStart={(market.season_start as string | null) ?? null}
            initialSeasonEnd={(market.season_end as string | null) ?? null}
            hasScheduleChangeRecipients={dashboardStats.hasScheduleChangeRecipients}
          />
        </div>
        <div id="seasons" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
          <MarketSeasonCard
            marketId={marketId}
            adminSeasonStart={(market.season_start as string | null) ?? null}
            adminSeasonEnd={(market.season_end as string | null) ?? null}
            stripeChargesEnabled={(market.stripe_charges_enabled as boolean | null) ?? false}
          />
          <MarketSeasonSettlementCard marketId={marketId} />
        </div>
        <ManagerCard
          title={`${term(vertical, 'vendor')} agreement statements`}
          description={`Select which opt-in statements ${term(vertical, 'vendors').toLowerCase()} must accept when they sign up to your ${term(vertical, 'market').toLowerCase()}. Statements with placeholders (in curly braces) let you fill in values specific to your ${term(vertical, 'market').toLowerCase()}.`}
        >
          <OptinManager marketId={marketId} />
        </ManagerCard>
        <MarketBrandingCard
          marketId={marketId}
          vertical={vertical}
          initialLogoUrl={(market.logo_url as string | null) ?? null}
          initialDescription={(market.description as string | null) ?? null}
        />
        <VerificationDocumentsCard marketId={marketId} vertical={vertical} />
        {visibilityStatus && <MarketVisibilityCard status={visibilityStatus} />}
      </CollapsibleSection>

      {/* ③ BOOTHS & THIS WEEK — inventory + occupancy + off-platform + weekly bookings + day-of ops */}
      <GroupHeading id="booths" title={`${term(vertical, 'booths')} & this week`} subtitle="Inventory, occupancy, bookings, attendance" />
      <ManagerCard
        title={`${term(vertical, 'booth')} inventory`}
        description={`Configure the ${term(vertical, 'booth').toLowerCase()} size tiers at your ${term(vertical, 'market').toLowerCase()} — how many of each size you have and the weekly rental price. This is the foundation for the weekly ${term(vertical, 'vendor').toLowerCase()} booking flow.`}
      >
        <BoothInventoryManager marketId={marketId} vertical={vertical} />
      </ManagerCard>
      <MarketMapCard marketId={marketId} vertical={vertical} initialBoothMapUrl={(market.booth_map_url as string | null) ?? null} />
      <BoothOccupancyGrid marketId={marketId} marketTimezone={(market.timezone as string | null) ?? null} vertical={vertical} />
      <ManagerCard
        title={`Off-platform ${term(vertical, 'booth').toLowerCase()} placeholders`}
        description={`Track ${term(vertical, 'booths').toLowerCase()} occupied by ${term(vertical, 'vendors').toLowerCase()} who are not on the platform. No ${term(vertical, 'vendor').toLowerCase()} identity is captured — just the ${term(vertical, 'booth').toLowerCase()} number and (optionally) which size tier it counts against.`}
      >
        <BoothPlaceholderManager marketId={marketId} vertical={vertical} />
      </ManagerCard>
      <div id="weekly-bookings" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
        <WeeklyBookingsCard marketId={marketId} marketTimezone={(market.timezone as string | null) ?? null} vertical={vertical} />
      </div>
      <MarketAttendanceCard marketId={marketId} vertical={vertical} />
      <MarketCancelDateCard marketId={marketId} vertical={vertical} />

      {/* ④ YOUR VENDORS — roster + invite (tabbed) */}
      <TabbedCard
        id="vendors"
        title={`${term(vertical, 'vendors')}`}
        tabs={[
          { id: 'roster', label: 'At this market', content: rosterTab },
          { id: 'invite', label: 'Invite', content: inviteTab },
        ]}
      />

      {/* ⑤ MONEY & INSIGHTS */}
      <GroupHeading id="money" title="Money & insights" />
      <ManagerEarningsCard aggregates={earningsAggregates} vertical={vertical} />
      <MarketTransactionsCard aggregates={transactionsAggregates} vertical={vertical} />
      <div id="surveys" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
        <SurveyResultsCard marketId={marketId} vertical={vertical} />
      </div>

      {/* ⑥ COMMUNICATE */}
      <GroupHeading title="Communicate & learn" />
      <div id="announce" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
        <MarketBroadcastCard marketId={marketId} vertical={vertical} />
      </div>
      <ManagerSupportCard vertical={vertical} />
    </div>
  )
}
