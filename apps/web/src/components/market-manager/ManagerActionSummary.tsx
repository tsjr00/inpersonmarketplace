import { colors, spacing, typography } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import DashboardCard from '@/components/dashboard/DashboardCard'
import type { OnboardingProgress } from '@/lib/markets/onboarding-progress'
import type { ManagerDashboardStats } from '@/lib/markets/manager-dashboard-stats'

interface ManagerActionSummaryProps {
  vertical: string
  progress: OnboardingProgress
  stats: ManagerDashboardStats
}

/**
 * "What needs your attention" card on the manager dashboard. Sits BELOW
 * the OnboardingChecklist (which handles required-setup nudges) and
 * surfaces actionable items the manager can act on right now:
 *
 *  - Active vendors needing a booth number assigned
 *  - Next market day stat (date + scheduled order count)
 *
 * Renders nothing if there are zero actionable items AND no upcoming
 * market day data — keeps the dashboard quiet when there's nothing to do.
 *
 * NOT a replacement for OnboardingChecklist — they show different things.
 * Onboarding checklist = "you haven't finished setup yet."
 * Action summary    = "setup is done; here's what's next on your plate."
 */
export default function ManagerActionSummary({
  vertical,
  progress,
  stats,
}: ManagerActionSummaryProps) {
  // If onboarding isn't complete, defer to OnboardingChecklist. Don't
  // render a competing prompt during the setup flow.
  const setupIncomplete = !progress.inventory_done || !progress.optin_done
  if (setupIncomplete) return null

  const hasPendingApproval = stats.pendingApprovalCount > 0
  // FT parks have no booth-number model — a truck's spot lives in
  // park_spot_bookings, so activeVendorsNeedingBooth (booth_number IS NULL)
  // counts every truck. Suppress the "needs a spot number assigned" nag for FT.
  const hasNeedsBooth = vertical !== 'food_trucks' && stats.activeVendorsNeedingBooth > 0
  const hasNextMarket = stats.nextMarketDate !== null

  // Collapses rather than disappearing (owner, 2026-08-08). "Nothing on your
  // plate" is genuinely useful information for a manager — it is the difference
  // between "I'm caught up" and "I wonder if this page is broken".
  //
  // ⚠ NOTE the early return above is NOT converted. `setupIncomplete` is not an
  // empty state — OnboardingChecklist owns that moment, and rendering a second
  // prompt beside it is the competing-prompt problem that return exists to
  // avoid. Only the genuinely-nothing-to-do case collapses.
  const nothingToDo = !hasPendingApproval && !hasNeedsBooth && !hasNextMarket

  return (
    <DashboardCard
      title="What's on your plate"
      {...(nothingToDo ? {
        empty: {
          kind: 'waiting' as const,
          message: `Nothing needs you right now — pending ${term(vertical, 'vendor').toLowerCase()} approvals, ${term(vertical, 'booth').toLowerCase()} assignments and your next ${term(vertical, 'market').toLowerCase()} day all show up here.`,
        },
      } : {})}
    >
      <ul style={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
      }}>
        {hasPendingApproval && (
          <li style={{
            fontSize: typography.sizes.sm,
            color: colors.textPrimary,
            display: 'flex',
            alignItems: 'baseline',
            gap: spacing['2xs'],
            flexWrap: 'wrap',
          }}>
            <span>📥</span>
            <span>
              <strong>{stats.pendingApprovalCount}</strong> {stats.pendingApprovalCount === 1 ? term(vertical, 'vendor').toLowerCase() : term(vertical, 'vendors').toLowerCase()} pending your approval.
            </span>
            {/* Plain anchor, NOT next/link. This card is always on the same page
                as #vendors, and a <Link> to a full path + hash silently stops
                working after the first click: once the URL already ends in
                #vendors the router sees no change, fires no navigation, and
                nothing scrolls. A native same-page anchor re-scrolls every time.
                Matches ManagerJumpNav, which uses plain anchors for this reason. */}
            <a
              href="#vendors"
              style={{
                color: colors.primary,
                textDecoration: 'underline',
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.xs,
              }}
            >
              Review →
            </a>
          </li>
        )}
        {hasNeedsBooth && (
          <li style={{
            fontSize: typography.sizes.sm,
            color: colors.textPrimary,
            display: 'flex',
            alignItems: 'baseline',
            gap: spacing['2xs'],
            flexWrap: 'wrap',
          }}>
            <span>📋</span>
            <span>
              <strong>{stats.activeVendorsNeedingBooth}</strong> active {stats.activeVendorsNeedingBooth === 1 ? `${term(vertical, 'vendor').toLowerCase()} needs` : `${term(vertical, 'vendors').toLowerCase()} need`} a {term(vertical, 'booth').toLowerCase()} number assigned.
            </span>
            <a
              href="#vendors"
              style={{
                color: colors.primary,
                textDecoration: 'underline',
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.xs,
              }}
            >
              Assign now →
            </a>
          </li>
        )}
        {hasNextMarket && stats.nextMarketDate && (
          <li style={{
            fontSize: typography.sizes.sm,
            color: colors.textPrimary,
            display: 'flex',
            alignItems: 'baseline',
            gap: spacing['2xs'],
            flexWrap: 'wrap',
          }}>
            <span>📅</span>
            <span>
              Next {term(vertical, 'market').toLowerCase()} day:{' '}
              <strong>
                {stats.nextMarketDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </strong>
              {' · '}
              {stats.nextMarketDayOrderCount === 0
                ? 'no orders scheduled yet'
                : (
                  <>
                    <strong>{stats.nextMarketDayOrderCount}</strong> order{stats.nextMarketDayOrderCount === 1 ? '' : 's'} scheduled
                  </>
                )}
            </span>
          </li>
        )}
      </ul>
    </DashboardCard>
  )
}
