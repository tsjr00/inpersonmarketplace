import type { ComponentProps, ReactNode } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import ManagerCard, { MANAGER_NAV_OFFSET } from './ManagerCard'
import CollapsibleSection from './CollapsibleSection'
import TabbedCard from './TabbedCard'
import ManagerActionSummary from './ManagerActionSummary'
import ManagerEarningsCard from './ManagerEarningsCard'
import ParkWeekCard from './ParkWeekCard'
import MarketAttendanceCard from './MarketAttendanceCard'
import MarketCancelDateCard from './MarketCancelDateCard'
import VendorBoothList from './VendorBoothList'
import StandingReservationsCard from './StandingReservationsCard'
import InviteVendorLink from './InviteVendorLink'
import InviteVendorBrowser from './InviteVendorBrowser'
import MarketStripeConnectCard from './MarketStripeConnectCard'
import ParkSpotsManager from './ParkSpotsManager'
import MarketMapCard from './MarketMapCard'
import MarketScheduleCard from './MarketScheduleCard'
import OptinManager from './OptinManager'
import MarketBrandingCard from './MarketBrandingCard'
import VerificationDocumentsCard from './VerificationDocumentsCard'
import MarketVisibilityCard from './MarketVisibilityCard'
import MarketBroadcastCard from './MarketBroadcastCard'
import SurveyResultsCard from './SurveyResultsCard'
import ManagerSupportCard from './ManagerSupportCard'
import ParkOnboardingChecklist from './ParkOnboardingChecklist'
import ParkRequiredDocsCard from './ParkRequiredDocsCard'
import type { OnboardingProgress, ParkOnboardingProgress } from '@/lib/markets/onboarding-progress'
import type { ManagerDashboardStats, ManagerEarningsAggregates } from '@/lib/markets/manager-dashboard-stats'
import type { ParkWeekSchedule } from '@/lib/markets/park-week-schedule'

/**
 * FT park-manager dashboard body — the FT-only card arrangement, grouped by
 * how a park operator actually works instead of one flat card per data table:
 *   ① What's on your plate (triage)
 *   ② This week — operations hub (bookings + attendance + cancel a day)
 *   ③ Your trucks — relationships (roster/approvals + recurring holds + invite)
 *   ④ Park setup — collapsible, occasional config (Stripe, spots, schedule, …)
 *   ⑤ Communicate & learn (announce, surveys, support)
 *
 * FM markets do NOT use this component — the shared page keeps its existing
 * flat layout for FM (vaulted, byte-identical). Cards are reused with the
 * same props they had inline.
 */
interface FtParkDashboardBodyProps {
  vertical: string
  marketId: string
  market: Record<string, unknown>
  onboardingProgress: OnboardingProgress
  /** P1 (2026-07-15): park-shaped setup progress — drives the top checklist
   *  and default-opens the Setup group until required steps are done. */
  parkOnboarding: ParkOnboardingProgress
  dashboardStats: ManagerDashboardStats
  parkWeek: ParkWeekSchedule | null
  parkEarnings: ManagerEarningsAggregates | null
  pendingHoldRequests?: number
  schedules: Array<{ day_of_week: number; start_time: string | null; end_time: string | null; active: boolean | null }>
  visibilityStatus: ComponentProps<typeof MarketVisibilityCard>['status'] | null
}

function GroupHeading({ id, title, subtitle, accessory }: { id?: string; title: string; subtitle?: string; accessory?: ReactNode }) {
  return (
    <div id={id} style={{ scrollMarginTop: MANAGER_NAV_OFFSET, marginTop: spacing.md, marginBottom: spacing.xs, display: 'flex', alignItems: 'baseline', gap: spacing.xs, flexWrap: 'wrap', borderLeft: `4px solid ${colors.primary}`, paddingLeft: spacing.sm, paddingBottom: spacing.xs, borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary }}>{title}</span>
      {subtitle && <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>{subtitle}</span>}
      {accessory && <span style={{ marginLeft: 'auto' }}>{accessory}</span>}
    </div>
  )
}

export default function FtParkDashboardBody({
  vertical,
  marketId,
  market,
  onboardingProgress,
  parkOnboarding,
  dashboardStats,
  parkWeek,
  parkEarnings,
  pendingHoldRequests = 0,
  schedules,
  visibilityStatus,
}: FtParkDashboardBodyProps) {
  const marketName = (market.name as string) || 'this park'
  const onboardingComplete = onboardingProgress.required_complete === onboardingProgress.required_total

  const parkSetupComplete = parkOnboarding.required_complete === parkOnboarding.required_total

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      {/* Tester finding F9 (2026-07-24): a new operator saw Stripe blocked and a
          3/4 checklist but nothing said their park was submitted for review —
          it read as broken. Surface the review state (markets.status='pending'
          until admin approves; intake/route.ts). Shows even when the checklist
          is complete. */}
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
          <strong>📋 Submitted for review.</strong> Your park and its schedule are in our review queue —
          we usually activate new parks within one business day. Until then it stays hidden from the public.
          Keep setting up in the meantime; you&apos;ll be able to connect Stripe once it&apos;s approved.
        </div>
      )}
      {/* ⓪ P1 (2026-07-15): setup checklist pinned to the top until done —
          new operators were landing here with no pointer to setup. */}
      <ParkOnboardingChecklist progress={parkOnboarding} />

      {/* ① Triage */}
      <ManagerActionSummary vertical={vertical} marketId={marketId} progress={onboardingProgress} stats={dashboardStats} />

      {/* ② THIS WEEK — operations hub */}
      <GroupHeading id="week-group" title="This week" subtitle="Who's booked, and who showed up" />
      {parkWeek && (
        <ManagerCard
          id="week"
          title="This week at your park"
          description="Who's booked over the next 7 operating days. Tap a day to see the trucks, their spot, and whether they've paid."
          headerAccessory={parkWeek.needingApproval > 0 ? (
            <a href="#vendors" style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.primary, textDecoration: 'underline' }}>
              {parkWeek.needingApproval} truck{parkWeek.needingApproval === 1 ? '' : 's'} need approval →
            </a>
          ) : undefined}
        >
          <ParkWeekCard schedule={parkWeek} marketId={marketId} />
        </ManagerCard>
      )}
      <MarketAttendanceCard marketId={marketId} vertical={vertical} />
      <MarketCancelDateCard marketId={marketId} vertical={vertical} />

      {/* ③ YOUR TRUCKS — relationships (tabbed: roster / recurring / invite) */}
      <TabbedCard
        id="vendors"
        title="Your trucks"
        tabs={[
          {
            id: 'approved',
            label: 'Approved',
            content: (
              <ManagerCard
                title="Your trucks & approvals"
                description="Trucks you've invited or approved for your park, their status, and their agreement docs. Trucks book and pay for a spot in the booking flow — spot assignments show in the week view above."
              >
                <VendorBoothList marketId={marketId} vertical={vertical} />
              </ManagerCard>
            ),
          },
          {
            id: 'recurring',
            label: pendingHoldRequests > 0 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing['3xs'] }}>
                Recurring holds
                <span style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, color: '#92400e', backgroundColor: '#fde68a', borderRadius: radius.sm, padding: `0 ${spacing['2xs']}` }}>
                  {pendingHoldRequests}
                </span>
              </span>
            ) : 'Recurring holds',
            content: <StandingReservationsCard marketId={marketId} />,
          },
          {
            id: 'invite',
            label: 'Invite',
            content: (
              <>
                <ManagerCard
                  title="Invite a food truck"
                  description="Share this link with a food truck you'd like to bring to your park. They'll see a banner identifying your park on the standard signup page."
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
            ),
          },
        ]}
      />

      {/* ⑤ MONEY — spot-rental revenue (operator's cut; NOT food sales).
          Hidden until there's at least one paid booking. */}
      {parkEarnings && parkEarnings.all_time.booking_count > 0 && (
        <>
          <GroupHeading id="money" title="Money" subtitle="Spot Rental Revenue" />
          <ManagerEarningsCard aggregates={parkEarnings} vertical={vertical} />
        </>
      )}

      {/* ④ PARK SETUP — collapsible (occasional config) */}
      {/* P1: keep Setup open until the required steps are done */}
      <CollapsibleSection id="setup" title="Park setup" subtitle="Payments, spots, schedule, agreements, branding" defaultCollapsed={parkSetupComplete}>
        <MarketStripeConnectCard marketId={marketId} marketStatus={(market.status as string | null) ?? null} vertical={vertical} />
        <ManagerCard
          id="booths"
          title="Spot inventory"
          description="Set up the individual truck spots at your park — length, power, water, and the per-day price. Switch the park to paid to let trucks book and pay for spots."
        >
          <ParkSpotsManager marketId={marketId} initialParkMode={(market.park_mode as 'free' | 'paid' | null) ?? 'free'} />
        </ManagerCard>
        <MarketMapCard marketId={marketId} vertical={vertical} initialBoothMapUrl={(market.booth_map_url as string | null) ?? null} />
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
        <ManagerCard
          title="Food truck agreement statements"
          description="Select which opt-in statements trucks must accept when they sign up to your park. Statements with placeholders (in curly braces) let you fill in values specific to your park."
        >
          <OptinManager marketId={marketId} vertical={vertical} />
        </ManagerCard>
        <MarketBrandingCard
          marketId={marketId}
          vertical={vertical}
          initialLogoUrl={(market.logo_url as string | null) ?? null}
          initialDescription={(market.description as string | null) ?? null}
        />
        <VerificationDocumentsCard marketId={marketId} vertical={vertical} />
        {/* P4b (2026-07-15): what documents trucks must carry to book here */}
        <ParkRequiredDocsCard marketId={marketId} />
        {visibilityStatus && <MarketVisibilityCard status={visibilityStatus} />}
      </CollapsibleSection>

      {/* ⑤ COMMUNICATE & LEARN */}
      <GroupHeading title="Communicate & learn" />
      <div id="announce" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
        <MarketBroadcastCard marketId={marketId} vertical={vertical} />
      </div>
      <div id="surveys" style={{ scrollMarginTop: MANAGER_NAV_OFFSET }}>
        <SurveyResultsCard marketId={marketId} vertical={vertical} />
      </div>
      <ManagerSupportCard vertical={vertical} />

      <p style={{ marginTop: spacing.md, fontSize: typography.sizes.xs, color: colors.textMuted, fontStyle: 'italic' }}>
        Have feedback on what would make this dashboard most useful for your park? Reply to your most recent platform email or reach out via the support page.
      </p>
    </div>
  )
}
