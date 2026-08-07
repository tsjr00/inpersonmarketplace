import { colors, spacing, typography } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import DashboardCard from '@/components/dashboard/DashboardCard'

/**
 * Static support card on the manager dashboard. Phase D.3 (2026-05-16).
 * No data fetch — just a known set of help/contact links.
 *
 * What's intentionally NOT here: a feedback form (we have support@
 * already), a chat widget (not built), or knowledge-base search
 * (admin/knowledge exists but is admin-only — vendor/manager-facing
 * KB doesn't yet).
 */
interface ManagerSupportCardProps {
  vertical: string
}

// Tester finding P3 (2026-07-15): this was hardcoded to the FM address and
// shown to FT park managers too. Vertical-switched; unknown verticals fall
// back to the FM address (platform umbrella inbox).
const SUPPORT_EMAIL_BY_VERTICAL: Record<string, string> = {
  farmers_market: 'support@farmersmarketing.app',
  food_trucks: 'support@foodtruckn.app',
}

export default function ManagerSupportCard({ vertical }: ManagerSupportCardProps) {
  const supportEmail = SUPPORT_EMAIL_BY_VERTICAL[vertical] ?? SUPPORT_EMAIL_BY_VERTICAL.farmers_market
  return (
    <DashboardCard
      title="Need help?"
      description={`Questions about your dashboard, ${term(vertical, 'vendor').toLowerCase()} onboarding, or how the platform handles your ${term(vertical, 'market').toLowerCase()}? Reach out and we'll help.`}
    >
      <ul style={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
        fontSize: typography.sizes.sm,
      }}>
        <li>
          <span style={{ color: colors.textMuted, marginRight: spacing['2xs'] }}>📧</span>
          <a
            href={`mailto:${supportEmail}?subject=Market%20manager%20support`}
            style={{ color: colors.primary, textDecoration: 'underline', fontWeight: typography.weights.semibold }}
          >
            {supportEmail}
          </a>
        </li>
        <li>
          <span style={{ color: colors.textMuted, marginRight: spacing['2xs'] }}>📋</span>
          <a
            href={`/${vertical}/help`}
            style={{ color: colors.primary, textDecoration: 'underline', fontWeight: typography.weights.semibold }}
          >
            Help center
          </a>
        </li>
        <li>
          <span style={{ color: colors.textMuted, marginRight: spacing['2xs'] }}>💬</span>
          <a
            href={`/${vertical}/support`}
            style={{ color: colors.primary, textDecoration: 'underline', fontWeight: typography.weights.semibold }}
          >
            Submit a feedback / support request
          </a>
        </li>
      </ul>
    </DashboardCard>
  )
}
