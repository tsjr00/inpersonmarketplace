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
import OptinManager from '@/components/market-manager/OptinManager'
import OnboardingChecklist from '@/components/market-manager/OnboardingChecklist'
import MarketBrandingCard from '@/components/market-manager/MarketBrandingCard'
import MarketTransactionsCard from '@/components/market-manager/MarketTransactionsCard'
import WeeklyBookingsCard from '@/components/market-manager/WeeklyBookingsCard'
import MarketStripeConnectCard from '@/components/market-manager/MarketStripeConnectCard'
import MarketScheduleCard from '@/components/market-manager/MarketScheduleCard'
import ManagerSupportCard from '@/components/market-manager/ManagerSupportCard'
import InviteVendorLink from '@/components/market-manager/InviteVendorLink'
import ManagerActionSummary from '@/components/market-manager/ManagerActionSummary'
import { getManagerDashboardStats, getMarketTransactionsAggregates } from '@/lib/markets/manager-dashboard-stats'

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
    .select('id, name, address, city, state, market_type, status, timezone, logo_url, description, season_start, season_end')
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
      padding: spacing.md,
    }}>
      <div style={{ marginBottom: spacing.md }}>
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
        marginBottom: spacing['2xs'],
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        color: colors.textPrimary,
      }}>
        {market.name}
      </h1>
      {(market.city || market.state) && (
        <p style={{
          margin: 0,
          marginBottom: spacing.lg,
          color: colors.textMuted,
          fontSize: typography.sizes.base,
        }}>
          {[market.address, market.city, market.state].filter(Boolean).join(' · ')}
        </p>
      )}

      {/* Setup checklist — links into the onboarding wizard if anything
          is incomplete; collapses to a thin "Setup complete" line once
          required steps are done */}
      <OnboardingChecklist vertical={vertical} marketId={marketId} progress={onboardingProgress} />

      {/* Action summary — surfaces "needs booth #" count + next market
          day stat. Renders nothing during onboarding (defers to checklist)
          or when there's nothing actionable. */}
      <ManagerActionSummary
        vertical={vertical}
        marketId={marketId}
        progress={onboardingProgress}
        stats={dashboardStats}
      />

      {/* Aggregate transactions — gross sales activity across 3 windows.
          Phase D.1 (2026-05-16). Renders nothing if all windows are empty. */}
      <MarketTransactionsCard aggregates={transactionsAggregates} />

      {/* Weekly booth rental bookings (Phase C Stage 1, 2026-05-16).
          Renders nothing when no bookings exist. Read-only display in
          this stage — booth-number editor + payment ship in next stages.
          Wrapped with id="weekly-bookings" + scrollMarginTop so the
          booth_rental_paid_manager notification's anchor link scrolls
          here cleanly (2026-05-19). */}
      <div id="weekly-bookings" style={{ scrollMarginTop: spacing.md }}>
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

      {/* Booth inventory — manage size tiers + per-week prices */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Booth inventory
        </h2>
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          Configure the booth size tiers at your market — how many of each size
          you have and the weekly rental price. This is the foundation for the
          weekly vendor booking flow.
        </p>
        <BoothInventoryManager marketId={marketId} />
      </div>

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
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Off-platform booth placeholders
        </h2>
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          Track booths occupied by vendors who are not on the platform. No
          vendor identity is captured — just the booth number and (optionally)
          which size tier it counts against. Useful when you have existing
          vendors who haven&apos;t onboarded yet.
        </p>
        <BoothPlaceholderManager marketId={marketId} />
      </div>

      {/* Vendors at this market — assign / edit booth numbers */}
      <div id="vendors-at-market" style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
        scrollMarginTop: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
          display: 'flex',
          alignItems: 'baseline',
          gap: spacing.xs,
          flexWrap: 'wrap',
        }}>
          <span>Vendors at this market</span>
          {dashboardStats.activeVendorsNeedingBooth > 0 && (
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
          )}
        </h2>
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          Assign booth numbers to vendors who are on the platform and at this
          market. Off-platform vendor placeholders ship in a later update.
        </p>
        <VendorBoothList marketId={marketId} vertical={vertical} />
      </div>

      {/* Invite a vendor — copy-able co-branded signup link */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Invite a vendor
        </h2>
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          Share this link with a vendor you&apos;d like to bring to your market. They&apos;ll see a banner identifying your market on the standard signup page.
        </p>
        <InviteVendorLink
          vertical={vertical}
          marketId={marketId}
          marketName={market.name as string}
          onboardingComplete={onboardingProgress.required_complete === onboardingProgress.required_total}
        />
      </div>

      {/* Opt-in vendor agreement statements — manager picks which ones
          apply to their market */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Vendor agreement statements
        </h2>
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          Select which opt-in statements vendors must accept when they sign
          up to your market. Statements with placeholders (in curly braces)
          let you fill in values specific to your market — these get
          substituted into the vendor-facing text at signup.
        </p>
        <OptinManager marketId={marketId} />
      </div>

      {/* Manager-editable schedule (D.2 2026-05-16; editable since 2026-05-19).
          Manager edits day/time/active + season start/end. Saving requires
          acknowledgment of vendor-refund responsibility + fires a
          market_schedule_changed notification to every approved vendor. */}
      <MarketScheduleCard
        marketId={marketId}
        initialSchedules={schedules}
        initialSeasonStart={(market.season_start as string | null) ?? null}
        initialSeasonEnd={(market.season_end as string | null) ?? null}
        hasScheduleChangeRecipients={dashboardStats.hasScheduleChangeRecipients}
      />

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
