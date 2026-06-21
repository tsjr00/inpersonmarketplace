import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { MANAGER_NAV_OFFSET } from './ManagerCard'

/**
 * Sticky in-page jump navigation for the market-manager dashboard
 * (Session 92 design pass). A row of anchor chips that scroll to each
 * section group, so managers don't scroll the long page by hand.
 *
 * Plain anchors (`href="#id"`) — native scroll, works without JS, and
 * respects each card's scrollMarginTop. Server component (no interactivity).
 * The chip ids must match the `id` on the first ManagerCard of each group.
 */
const SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'setup', label: 'Setup' },
  { id: 'money', label: 'Money' },
  { id: 'booths', label: 'Booths' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'cancel-date', label: 'Cancel day' },
  { id: 'announce', label: 'Announce' },
  { id: 'surveys', label: 'Surveys' },
]

export default function ManagerJumpNav() {
  return (
    <nav
      aria-label="Dashboard sections"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        marginBottom: spacing.sm,
        padding: `${spacing['2xs']} 0`,
        backgroundColor: colors.surfaceBase,
        borderBottom: `1px solid ${colors.border}`,
        // keep the sticky bar height ~ MANAGER_NAV_OFFSET so anchored
        // sections land just below it
        minHeight: MANAGER_NAV_OFFSET - 16,
        display: 'flex',
        alignItems: 'center',
        gap: spacing['2xs'],
        flexWrap: 'wrap',
      }}
    >
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          style={{
            padding: `${spacing['3xs']} ${spacing.xs}`,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.medium,
            color: colors.textSecondary,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {s.label}
        </a>
      ))}
    </nav>
  )
}
