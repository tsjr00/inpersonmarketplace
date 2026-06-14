import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import type { MarketTransactionsAggregates } from '@/lib/markets/manager-dashboard-stats'

/**
 * Aggregate transactions card on the manager dashboard. Phase D.1
 * (2026-05-16). Shows gross sales activity at this market over three
 * time windows: 7d, 30d, and "season" (markets.season_start/end if set,
 * else last 90 days).
 *
 * The manager doesn't EARN this revenue (vendors do) — this card
 * surfaces market-level activity as a signal. Phase C will add a
 * separate booth-rental income card for what the manager actually
 * collects.
 *
 * Renders nothing if all three windows are empty — keeps the dashboard
 * quiet for brand-new markets with no order history.
 */
interface MarketTransactionsCardProps {
  aggregates: MarketTransactionsAggregates
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function MarketTransactionsCard({ aggregates }: MarketTransactionsCardProps) {
  const allEmpty =
    aggregates.last_7_days.order_count === 0 &&
    aggregates.last_30_days.order_count === 0 &&
    aggregates.season.order_count === 0
  if (allEmpty) return null

  const windows: Array<{ key: string; label: string; data: { order_count: number; total_cents: number; vendor_count: number }; subLabel?: string }> = [
    {
      key: '7d',
      label: 'Last 7 days',
      data: aggregates.last_7_days,
    },
    {
      key: '30d',
      label: 'Last 30 days',
      data: aggregates.last_30_days,
    },
    {
      key: 'season',
      label: 'Season',
      subLabel: aggregates.season.range_label,
      data: aggregates.season,
    },
  ]

  return (
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
        Market activity
      </h2>
      <p style={{
        margin: 0,
        marginBottom: spacing.md,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        lineHeight: 1.5,
      }}>
        Gross sales placed at your market through the platform. The
        platform takes its fee from vendors and buyers — these numbers
        reflect activity, not your earnings.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: spacing.md,
      }}>
        {windows.map((w) => (
          <div key={w.key} style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceBase,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
          }}>
            <div style={{
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: spacing['3xs'],
            }}>
              {w.label}
            </div>
            {w.subLabel && (
              <div style={{
                fontSize: typography.sizes.xs,
                color: colors.textMuted,
                marginBottom: spacing['2xs'],
              }}>
                {w.subLabel}
              </div>
            )}
            <div style={{
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.bold,
              color: colors.textPrimary,
              lineHeight: 1.2,
              marginBottom: spacing['3xs'],
            }}>
              {formatCents(w.data.total_cents)}
            </div>
            <div style={{
              fontSize: typography.sizes.sm,
              color: colors.textMuted,
              lineHeight: 1.4,
            }}>
              {w.data.order_count} order{w.data.order_count === 1 ? '' : 's'} ·{' '}
              {w.data.vendor_count} vendor{w.data.vendor_count === 1 ? '' : 's'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
