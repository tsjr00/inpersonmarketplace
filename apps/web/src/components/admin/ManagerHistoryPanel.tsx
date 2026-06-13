import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Read-only audit panel of a market's manager assignment history
 * (Phase 1B). One row per assignment period from market_manager_history,
 * newest first. The active assignment (ended_at IS NULL) is labelled
 * "Current". Suspensions don't create rows here — they toggle
 * markets.manager_status; this panel tracks who managed the market and
 * for what span.
 */
export interface ManagerHistoryRow {
  manager_email_snapshot: string
  assigned_at: string
  ended_at: string | null
  end_reason: string | null
}

interface ManagerHistoryPanelProps {
  history: ManagerHistoryRow[]
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ManagerHistoryPanel({ history }: ManagerHistoryPanelProps) {
  if (!history || history.length === 0) {
    return (
      <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
        No manager history yet.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {history.map((row, idx) => {
        const isCurrent = row.ended_at === null
        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: spacing.xs,
              flexWrap: 'wrap',
              padding: `${spacing['2xs']} ${spacing.sm}`,
              backgroundColor: isCurrent ? '#f0fdf4' : colors.surfaceBase,
              border: `1px solid ${isCurrent ? '#bbf7d0' : colors.border}`,
              borderRadius: radius.sm,
            }}
          >
            <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
              {row.manager_email_snapshot || '(no email)'}
            </span>
            <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
              {fmt(row.assigned_at)} → {isCurrent ? 'Current' : fmt(row.ended_at)}
            </span>
            {isCurrent && (
              <span style={{
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                color: '#166534',
                backgroundColor: '#dcfce7',
                padding: `0 ${spacing['2xs']}`,
                borderRadius: radius.sm,
              }}>
                Current
              </span>
            )}
            {!isCurrent && row.end_reason && (
              <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted, fontStyle: 'italic' }}>
                — {row.end_reason}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
