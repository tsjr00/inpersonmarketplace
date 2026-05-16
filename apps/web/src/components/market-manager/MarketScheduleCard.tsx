import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Read-only schedule view on manager dashboard. Phase D.2 (2026-05-16).
 * Renders the market_schedules rows for this market — day of week +
 * start/end times. Editing happens elsewhere (admin path / vertical
 * admin); this card is purely informational so the manager can
 * confirm their schedule at a glance.
 */
interface MarketScheduleCardProps {
  schedules: Array<{
    day_of_week: number
    start_time: string | null
    end_time: string | null
    active: boolean | null
  }>
}

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

function formatTime(t: string | null): string {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
}

export default function MarketScheduleCard({ schedules }: MarketScheduleCardProps) {
  const active = schedules.filter((s) => s.active !== false)
    .sort((a, b) => a.day_of_week - b.day_of_week)

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
        Market schedule
      </h2>
      <p style={{
        margin: 0,
        marginBottom: spacing.sm,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        lineHeight: 1.5,
      }}>
        Your published schedule. To make changes contact platform admin —
        a manager-editable schedule is coming.
      </p>
      {active.length === 0 ? (
        <p style={{
          margin: 0,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          fontStyle: 'italic',
        }}>
          No active schedule entries.
        </p>
      ) : (
        <ul style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: spacing['2xs'],
          fontSize: typography.sizes.sm,
        }}>
          {active.map((s, i) => {
            const dayName = DAYS[s.day_of_week] ?? `Day ${s.day_of_week}`
            const start = formatTime(s.start_time)
            const end = formatTime(s.end_time)
            const timeRange = start && end ? `${start} – ${end}` : start || end || '(time TBD)'
            return (
              <li key={i} style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: spacing.sm,
                padding: `${spacing['2xs']} 0`,
                borderBottom: i === active.length - 1 ? 'none' : `1px solid ${colors.border}`,
              }}>
                <span style={{
                  minWidth: 100,
                  fontWeight: typography.weights.semibold,
                  color: colors.textPrimary,
                }}>{dayName}</span>
                <span style={{ color: colors.textPrimary }}>{timeRange}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
