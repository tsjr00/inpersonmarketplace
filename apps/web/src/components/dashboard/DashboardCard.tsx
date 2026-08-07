import type { ReactNode } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { DASHBOARD_STATES, type DashboardState } from './states'

/**
 * Shared card wrapper for every dashboard surface (manager, vendor, shopper).
 * Originated as the market-manager `ManagerCard` in the Session 92 design pass
 * and was promoted here so all dashboards read as one system:
 *   - padding: spacing.sm (16) — tighter than the old spacing.md (24)
 *   - gap between cards: spacing.sm (16) via marginBottom
 *   - section header at the agreed `lg` semibold; description at `sm` muted
 *   - id + scrollMarginTop so a sticky jump-nav lands the section cleanly
 *
 * Typography discipline (4 sizes page-wide): title `xl`, headers `lg`,
 * body `sm`, meta `xs`. Metric values use `lg` bold. Cards should NOT
 * reintroduce `2xl`/`xl` body text (that was the wrapping problem).
 *
 * ⚠ KEEP THIS A SERVER COMPONENT. It has no 'use client' on purpose, so the
 * card chrome on the highest-traffic authenticated pages ships zero JS. Adding
 * interactivity here would convert every card on every dashboard into a client
 * component. Interactive behaviour belongs in the individual cards instead.
 *
 * `headerAccessory` is how a card stays legible while collapsed — put the count,
 * status, or next action there so nobody has to open a section to learn whether
 * it needs them ("Orders — 3 need packing", not "Orders").
 */
interface DashboardCardProps {
  /** Anchor id for the jump-nav (e.g. 'money', 'vendors'). */
  id?: string
  /** Section header (rendered at lg/semibold). Omit for headerless cards. */
  title?: ReactNode
  /** Optional sub-text under the header (sm/muted). */
  description?: ReactNode
  /** Optional node rendered at the right of the header row (badge, count). */
  headerAccessory?: ReactNode
  /** Semantic state, shared with DashboardTile — see ./states.ts. Defaults to
   *  `neutral`, which is the plain chrome every existing card already renders,
   *  so adding this prop changed nothing for callers that omit it. */
  state?: DashboardState
  /**
   * Render as a grid cell rather than a stacked block: equal height with its
   * peers, and no bottom margin (the grid's `gap` owns spacing).
   *
   * Cards are normally full-width and stacked. A SMALL card may sit in a grid
   * as a peer of tiles — e.g. vendor "Analytics & Insights", which is a card
   * because it holds two destinations rather than being one door. The test is
   * content weight, not type: a card with several internal sections needs the
   * full width and belongs below the grid (see "Your Events", moved out
   * 2026-08-07 for exactly this reason).
   */
  inGrid?: boolean
  children: ReactNode
}

/** Sticky jump-nav height + a little breathing room, so anchored sections
 *  aren't hidden under the nav after a jump. */
export const NAV_OFFSET = 64

export default function DashboardCard({ id, title, description, headerAccessory, state = 'neutral', inGrid = false, children }: DashboardCardProps) {
  const s = DASHBOARD_STATES[state]
  // Cards sit at 1px when resting and 2px whenever a state is set. They do NOT
  // take the tile's 3px + glow: a card is already full-width, so it does not
  // need that much weight to be seen, and reserving the glow for tiles keeps
  // `attention` meaning one specific thing at a glance.
  const borderWidth = state === 'neutral' ? 1 : 2

  return (
    <section
      {...(id ? { id } : {})}
      style={{
        padding: spacing.sm,
        backgroundColor: s.background,
        border: `${borderWidth}px solid ${s.border}`,
        borderRadius: radius.md,
        ...(inGrid ? { height: '100%' } : { marginBottom: spacing.sm }),
        scrollMarginTop: `${NAV_OFFSET}px`,
      }}
    >
      {(title || headerAccessory) && (
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: spacing.xs,
          flexWrap: 'wrap',
          marginBottom: description ? spacing['2xs'] : spacing.xs,
        }}>
          {title && (
            <h2 style={{
              margin: 0,
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary,
            }}>
              {title}
            </h2>
          )}
          {headerAccessory}
        </div>
      )}
      {description && (
        <p style={{
          margin: `0 0 ${spacing.sm} 0`,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          lineHeight: 1.5,
        }}>
          {description}
        </p>
      )}
      {children}
    </section>
  )
}
