import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import type { ManagerEarningsAggregates } from '@/lib/markets/manager-dashboard-stats'

/**
 * Manager booth-rental earnings card (Session 92 A2) — the companion the
 * MarketTransactionsCard's doc comment promised. Where the transactions
 * card shows GROSS market activity (the vendors' money), this card shows
 * what the MANAGER actually collects from weekly booth rentals — their
 * net after the platform's percentage, the amount that lands in their
 * Stripe account.
 *
 * Renders nothing until at least one rental has been collected — keeps
 * the dashboard quiet for markets that haven't started booth rentals.
 */
interface ManagerEarningsCardProps {
  aggregates: ManagerEarningsAggregates
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ManagerEarningsCard({ aggregates }: ManagerEarningsCardProps) {
  if (aggregates.all_time.booking_count === 0) return null

  const windows: Array<{
    key: string
    label: string
    subLabel?: string
    data: { booking_count: number; net_cents: number }
  }> = [
    { key: '7d', label: 'Last 7 days', data: aggregates.last_7_days },
    { key: '30d', label: 'Last 30 days', data: aggregates.last_30_days },
    { key: 'season', label: 'Season', subLabel: aggregates.season.range_label, data: aggregates.season },
    { key: 'all', label: 'All time', data: aggregates.all_time },
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
        Your booth revenue
      </h2>
      <p style={{
        margin: 0,
        marginBottom: spacing.md,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        lineHeight: 1.5,
      }}>
        What you collect from weekly booth rentals after the platform&apos;s
        percentage — this is <strong>your</strong> money, paid out through your
        Stripe account. (Market activity below shows your vendors&apos; sales,
        which you don&apos;t collect.)
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
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
              {formatCents(w.data.net_cents)}
            </div>
            <div style={{
              fontSize: typography.sizes.sm,
              color: colors.textMuted,
            }}>
              {w.data.booking_count} booking{w.data.booking_count === 1 ? '' : 's'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
