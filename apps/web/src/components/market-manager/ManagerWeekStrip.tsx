import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import type { ManagerStripDay } from '@/lib/markets/manager-week-strip'

/**
 * "Your next two weeks" for the market manager (owner 2026-09-19, OB-029
 * part D) — sits under the market name, above the jump nav, like the vendor
 * and shopper dashboards' schedule strips. Server component; data from
 * lib/markets/manager-week-strip.ts (market-timezone dates).
 *
 * Each operating date: declared vendors · paid booth weeks (+ unpaid) ·
 * orders scheduled. A cancelled day is struck with its make-up date.
 * Awareness only — anything the manager must DO is in Action Items.
 */
interface ManagerWeekStripProps {
  vertical: string
  days: ManagerStripDay[]
  /** Market-local today, YYYY-MM-DD — for the "Today ·" label. */
  today: string
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':')
  const hour = parseInt(h!)
  const ampm = hour >= 12 ? 'p' : 'a'
  const display = hour % 12 || 12
  return m === '00' ? `${display}${ampm}` : `${display}:${m}${ampm}`
}

function dayLabel(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  const label = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return date === today ? `Today · ${label}` : label
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export default function ManagerWeekStrip({ vertical, days, today }: ManagerWeekStripProps) {
  const vendorOne = term(vertical, 'vendor').toLowerCase()
  const vendorMany = term(vertical, 'vendors').toLowerCase()
  const booth = term(vertical, 'booth').toLowerCase()

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`,
      padding: spacing.md,
      marginBottom: spacing.sm,
    }}>
      <h2 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, margin: `0 0 ${spacing['3xs']} 0` }}>
        📅 Your next two weeks
      </h2>
      <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: `0 0 ${spacing.xs} 0` }}>
        Every {term(vertical, 'market').toLowerCase()} day coming up — who has committed, who has paid, what buyers have ordered.
      </p>
      {days.length === 0 ? (
        <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, fontStyle: 'italic', margin: 0 }}>
          No {term(vertical, 'market').toLowerCase()} days in the next 14 days — check the schedule and season in Setup.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
          {days.map((d) => {
            const struck = d.status === 'cancelled'
            return (
              <div key={d.date} style={{ display: 'flex', gap: spacing.sm, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{
                  flexShrink: 0,
                  width: 120,
                  fontSize: typography.sizes.sm,
                  fontWeight: d.date === today ? typography.weights.bold : typography.weights.semibold,
                  color: struck ? colors.textMuted : d.date === today ? colors.primary : colors.textSecondary,
                  textDecoration: struck ? 'line-through' : 'none',
                }}>
                  {dayLabel(d.date, today)}
                </span>
                <span style={{ fontSize: typography.sizes.sm, color: struck ? colors.textMuted : colors.textPrimary, textDecoration: struck ? 'line-through' : 'none', minWidth: 0 }}>
                  {d.startTime && d.endTime && (
                    <span style={{ color: colors.textMuted }}>{fmtTime(d.startTime)}–{fmtTime(d.endTime)} · </span>
                  )}
                  {plural(d.declaredVendors, `${vendorOne} declared`, `${vendorMany} declared`)}
                  {' · '}
                  {plural(d.paidBoothWeeks, `paid ${booth} week`, `paid ${booth} weeks`)}
                  {d.unpaidBoothWeeks > 0 && (
                    <span style={{ color: '#92400e' }}> ({d.unpaidBoothWeeks} booked, unpaid)</span>
                  )}
                  {' · '}
                  {plural(d.ordersScheduled, 'order scheduled', 'orders scheduled')}
                </span>
                {d.note && (
                  <span style={{ fontSize: typography.sizes.xs, color: struck ? '#991b1b' : colors.textMuted }}>{d.note}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
