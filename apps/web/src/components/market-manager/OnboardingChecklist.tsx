import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
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
 * Renders as a short summary when all required steps are complete; as a
 * fuller "Continue setup" prompt when anything required is missing.
 *
 * Mig 145 grew the required-steps list from 2 to 4:
 *   1. Booth inventory (at least one size tier)
 *   2. Vendor agreement statements (at least one selection)
 *   3. On-platform vendors — at least one OR ack "I have none yet"
 *   4. Off-platform placeholders — at least one OR ack "I have none yet"
 *
 * The acks let new markets legitimately skip steps 3 + 4 without lying
 * about the data — manager checks a box on each step that says "I have
 * no existing X at this market yet."
 */
export default function OnboardingChecklist({
  vertical,
  marketId,
  progress,
}: OnboardingChecklistProps) {
  const allRequiredDone =
    progress.inventory_done &&
    progress.optin_done &&
    progress.vendors_step_done &&
    progress.placeholders_step_done

  if (allRequiredDone) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceBase,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.sm,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: spacing.xs,
      }}>
        <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
          ✓ Setup complete — all 4 required steps configured
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
      marginBottom: spacing.sm,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs }}>
        <h3 style={{
          margin: 0,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: '#713f12',
        }}>
          Set up your {term(vertical, 'market').toLowerCase()}
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
        Walk through a short setup process to configure your {term(vertical, 'booth').toLowerCase()} inventory
        and the {term(vertical, 'vendor').toLowerCase()} agreement statements. You can edit any of these from
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
          <span>{term(vertical, 'booth')} inventory{progress.inventory_done ? '' : ' — add at least one size tier'}</span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], marginBottom: spacing['3xs'] }}>
          <span>{progress.vendors_step_done ? '✓' : '○'}</span>
          <span>
            {progress.no_existing_vendors_ack
              ? `On-platform ${term(vertical, 'vendors').toLowerCase()} — acknowledged none yet`
              : progress.vendors_at_market_count > 0
                ? `On-platform ${term(vertical, 'vendors').toLowerCase()} — ${progress.vendors_at_market_count} at this ${term(vertical, 'market').toLowerCase()}${progress.vendors_with_booth_count > 0 ? ` (${progress.vendors_with_booth_count} with ${term(vertical, 'booth').toLowerCase()} #)` : ''}`
                : `On-platform ${term(vertical, 'vendors').toLowerCase()} — add at least one or check "I have none yet"`}
          </span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], marginBottom: spacing['3xs'] }}>
          <span>{progress.placeholders_step_done ? '✓' : '○'}</span>
          <span>
            {progress.no_placeholders_ack
              ? 'Off-platform placeholders — acknowledged none yet'
              : progress.placeholders_count > 0
                ? `Off-platform placeholders — ${progress.placeholders_count} tracked`
                : 'Off-platform placeholders — add at least one or check "I have none yet"'}
          </span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
          <span>{progress.optin_done ? '✓' : '○'}</span>
          <span>{term(vertical, 'vendor')} agreement statements{progress.optin_done ? '' : ' — pick at least one'}</span>
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
