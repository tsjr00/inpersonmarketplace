import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import type { OnboardingProgress } from '@/lib/markets/onboarding-progress'
import type { ManagerDashboardStats } from '@/lib/markets/manager-dashboard-stats'

interface ManagerActionSummaryProps {
  vertical: string
  marketId: string
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
  marketId,
  progress,
  stats,
}: ManagerActionSummaryProps) {
  // If onboarding isn't complete, defer to OnboardingChecklist. Don't
  // render a competing prompt during the setup flow.
  const setupIncomplete = !progress.inventory_done || !progress.optin_done
  if (setupIncomplete) return null

  const hasPendingApproval = stats.pendingApprovalCount > 0
  const hasNeedsBooth = stats.activeVendorsNeedingBooth > 0
  const hasNextMarket = stats.nextMarketDate !== null

  // Nothing to surface — keep the dashboard quiet.
  if (!hasPendingApproval && !hasNeedsBooth && !hasNextMarket) return null

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: colors.surfaceBase,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    }}>
      <h2 style={{
        marginTop: 0,
        marginBottom: spacing.sm,
        fontSize: typography.sizes.base,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        What&apos;s on your plate
      </h2>
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
              <strong>{stats.pendingApprovalCount}</strong> vendor{stats.pendingApprovalCount === 1 ? '' : 's'} pending your approval.
            </span>
            <Link
              href={`/${vertical}/market-manager/${marketId}/dashboard#vendors-at-market`}
              style={{
                color: colors.primary,
                textDecoration: 'underline',
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.xs,
              }}
            >
              Review →
            </Link>
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
              <strong>{stats.activeVendorsNeedingBooth}</strong> active vendor{stats.activeVendorsNeedingBooth === 1 ? ' needs' : 's need'} a booth number assigned.
            </span>
            <Link
              href={`/${vertical}/market-manager/${marketId}/dashboard#vendors-at-market`}
              style={{
                color: colors.primary,
                textDecoration: 'underline',
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.xs,
              }}
            >
              Assign now →
            </Link>
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
              Next market day:{' '}
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
    </div>
  )
}
