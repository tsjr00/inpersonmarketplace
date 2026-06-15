import { colors, spacing, typography } from '@/lib/design-tokens'
import ManagerCard from './ManagerCard'

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

const SUPPORT_EMAIL = 'support@farmersmarketing.app'

export default function ManagerSupportCard({ vertical }: ManagerSupportCardProps) {
  return (
    <ManagerCard
      title="Need help?"
      description="Questions about your dashboard, vendor onboarding, or how the platform handles your market? Reach out and we'll help."
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
            href={`mailto:${SUPPORT_EMAIL}?subject=Market%20manager%20support`}
            style={{ color: colors.primary, textDecoration: 'underline', fontWeight: typography.weights.semibold }}
          >
            {SUPPORT_EMAIL}
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
    </ManagerCard>
  )
}
