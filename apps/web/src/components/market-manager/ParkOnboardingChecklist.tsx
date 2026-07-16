import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import type { ParkOnboardingProgress } from '@/lib/markets/onboarding-progress'

/**
 * Park setup checklist — tester finding P1 (2026-07-15).
 *
 * New park managers landed on the dashboard with no prompt to set the park
 * up or where to find setup. This renders at the TOP of the FT park
 * dashboard until the four required steps are done (the FM dashboard has an
 * equivalent booth-shaped checklist). Rows deep-link to the section anchors
 * inside the Setup group.
 *
 * Server component — progress is computed by getParkOnboardingProgress()
 * on the dashboard page and passed in.
 */
interface ParkOnboardingChecklistProps {
  progress: ParkOnboardingProgress
}

interface StepRow {
  done: boolean
  label: string
  detail: string
  href: string
}

export default function ParkOnboardingChecklist({ progress }: ParkOnboardingChecklistProps) {
  const complete = progress.required_complete === progress.required_total
  if (complete) return null

  const steps: StepRow[] = [
    {
      done: progress.payments_done,
      label: 'Set up payments',
      detail: 'Connect Stripe so trucks can pay for spots.',
      href: '#setup',
    },
    {
      done: progress.spots_done,
      label: 'Add your spots',
      detail: 'Create at least one bookable spot with a price.',
      href: '#booths',
    },
    {
      done: progress.schedule_done,
      label: 'Set your schedule',
      detail: 'The days and hours your park operates.',
      href: '#schedule',
    },
    {
      done: progress.optin_done,
      label: 'Pick agreement statements',
      detail: 'What trucks must accept when they book here.',
      href: '#setup',
    },
  ]

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: statusColors.warningLight,
      border: `1px solid ${statusColors.warningBorder}`,
      borderRadius: radius.md,
    }}>
      <div style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
        Set up your park ({progress.required_complete} of {progress.required_total} done)
      </div>
      <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: spacing['3xs'], marginBottom: spacing.sm }}>
        Finish these steps so food trucks can find and book your park. Everything lives in the
        {' '}<a href="#setup" style={{ color: colors.primary, textDecoration: 'underline' }}>Park setup</a> section below.
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {steps.map((s) => (
          <li key={s.label} style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.xs }}>
            <span aria-hidden style={{
              fontSize: typography.sizes.sm,
              color: s.done ? statusColors.success : colors.textMuted,
              marginTop: 1,
            }}>
              {s.done ? '✅' : '⬜'}
            </span>
            <span style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>
              {s.done ? (
                <span style={{ textDecoration: 'line-through', color: colors.textMuted }}>{s.label}</span>
              ) : (
                <a href={s.href} style={{ color: colors.primary, textDecoration: 'underline', fontWeight: typography.weights.semibold }}>
                  {s.label}
                </a>
              )}
              {' '}
              <span style={{ color: colors.textMuted }}>— {s.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {!progress.season_set && (
        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing.sm }}>
          Optional: set your <a href="#schedule" style={{ color: colors.primary, textDecoration: 'underline' }}>season window</a>
          {' '}(open/close dates) in the schedule card — bookings are only offered inside it.
        </div>
      )}
    </div>
  )
}
