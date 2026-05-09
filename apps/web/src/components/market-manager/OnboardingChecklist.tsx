import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import type { OnboardingProgress } from '@/lib/markets/onboarding-progress'

interface OnboardingChecklistProps {
  vertical: string
  marketId: string
  progress: OnboardingProgress
}

/**
 * Dashboard card showing the manager's setup checklist progress + entry
 * point into the guided wizard.
 *
 * Renders as a short summary when both required steps are complete; as
 * a fuller "Continue setup" prompt when anything required is missing.
 *
 * Required steps: booth inventory + opt-in statements (each needs at
 * least one row). Off-platform placeholders are optional — reported in
 * the list with their count but they don't gate the "Setup complete"
 * state.
 */
export default function OnboardingChecklist({
  vertical,
  marketId,
  progress,
}: OnboardingChecklistProps) {
  const allRequiredDone = progress.inventory_done && progress.optin_done

  // When everything required is in place, render a low-key "review setup"
  // line. Mention placeholder count if there are any.
  if (allRequiredDone) {
    const placeholderSuffix =
      progress.placeholders_count > 0
        ? ` (plus ${progress.placeholders_count} off-platform placeholder${progress.placeholders_count === 1 ? '' : 's'})`
        : ''
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceBase,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: spacing.xs,
      }}>
        <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
          ✓ Setup complete — booth inventory and vendor agreement statements are configured{placeholderSuffix}
        </div>
        <Link
          href={`/${vertical}/market-manager/${marketId}/onboarding`}
          style={{
            color: colors.primary,
            fontSize: typography.sizes.xs,
            textDecoration: 'none',
            fontWeight: typography.weights.semibold,
          }}
        >
          Review →
        </Link>
      </div>
    )
  }

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: '#fefce8',
      border: '1px solid #fde047',
      borderRadius: radius.md,
      marginBottom: spacing.md,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs }}>
        <h3 style={{
          margin: 0,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: '#713f12',
        }}>
          Set up your market
        </h3>
        <span style={{ fontSize: typography.sizes.xs, color: '#713f12' }}>
          {progress.required_complete} of {progress.required_total} required steps done
        </span>
      </div>
      <p style={{
        margin: 0,
        marginBottom: spacing.sm,
        fontSize: typography.sizes.sm,
        color: '#713f12',
        lineHeight: 1.5,
      }}>
        Walk through a short setup process to configure your booth inventory
        and the vendor agreement statements. You can edit any of these from
        the dashboard later.
      </p>
      <ul style={{
        margin: 0,
        marginBottom: spacing.sm,
        padding: 0,
        listStyle: 'none',
        fontSize: typography.sizes.sm,
        color: '#713f12',
      }}>
        <li style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], marginBottom: spacing['3xs'] }}>
          <span>{progress.inventory_done ? '✓' : '○'}</span>
          <span>Booth inventory{progress.inventory_done ? '' : ' — add at least one size tier'}</span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], marginBottom: spacing['3xs'] }}>
          <span>{progress.placeholders_count > 0 ? '✓' : '○'}</span>
          <span style={{ fontStyle: progress.placeholders_count > 0 ? 'normal' : 'italic' }}>
            {progress.placeholders_count > 0
              ? `Off-platform placeholders — ${progress.placeholders_count} tracked`
              : 'Off-platform placeholders (optional)'}
          </span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
          <span>{progress.optin_done ? '✓' : '○'}</span>
          <span>Vendor agreement statements{progress.optin_done ? '' : ' — pick at least one'}</span>
        </li>
      </ul>
      <Link
        href={`/${vertical}/market-manager/${marketId}/onboarding`}
        style={{
          display: 'inline-block',
          padding: `${spacing.xs} ${spacing.md}`,
          backgroundColor: colors.primary,
          color: 'white',
          textDecoration: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
        }}
      >
        Continue setup →
      </Link>
    </div>
  )
}
