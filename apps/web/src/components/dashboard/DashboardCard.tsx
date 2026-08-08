import type { ReactNode } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { DASHBOARD_STATES, type DashboardState } from './states'

/**
 * WHY an empty section still renders (owner, 2026-08-08).
 *
 * Cards used to `return null` when they had nothing, so a manager with a quiet
 * week saw a shorter page — and never learned the section existed at all. The
 * owner's call: *"I want the user to see the functionality & features available
 * to them… so people start using the app more and get used to its functionality
 * more than their other options."* A feature nobody has seen cannot drive
 * adoption, upgrades, or retention.
 *
 * So an empty card COLLAPSES instead of disappearing: header, one muted line,
 * no body. The page reads like a table of contents rather than a wall of empty
 * grids and dead buttons.
 *
 * ⚠ "Empty" is three different things and they need different sentences. Using
 * the wrong one is worse than saying nothing — telling somebody data "will
 * appear here" when it never will is a lie, and saying it passively at the
 * moment they should be setting something up wastes the moment.
 */
export type EmptyKind =
  /** Nothing here because the user hasn't set it up. The line is an INVITATION —
   *  pair it with an action. "Add your first booth type →" */
  | 'setup'
  /** Nothing here right now, by nature — no orders yet today, no announcements
   *  sent. Nothing is owed; it fills in on its own. */
  | 'waiting'
  /** Not available to this user — wrong tier, wrong market type. Pair with an
   *  upgrade path where one exists. NEVER use 'waiting' copy here; the data is
   *  not coming. */
  | 'unavailable'

export interface DashboardCardEmpty {
  kind: EmptyKind
  /** The single line shown in place of the body. One sentence. */
  message: ReactNode
  /** Optional call to action. Expected for 'setup' and 'unavailable'. */
  action?: { href: string; label: string }
}

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
  /**
   * Alert-weight card: bigger padding and a bigger corner radius, for the one
   * thing on a page that is meant to shout.
   *
   * Prominence is a separate axis from `state`. `state` says WHAT KIND of
   * signal this is; `prominent` says HOW LOUD. "Ready for Pickup" is both —
   * `active` (something good is waiting) AND prominent (it sits at the top,
   * appears only when there is an order to collect, and carries the order
   * number the buyer is looking for).
   *
   * ⚠ Use sparingly — one per page at most. A page where two things shout is a
   * page where nothing does, which is the same failure as the FT all-red
   * palette and as uniform nudge intensity.
   */
  prominent?: boolean
  /**
   * This section has nothing to show. Renders collapsed — header plus one muted
   * line — instead of the body. See EmptyKind above for why sections collapse
   * rather than disappear, and for picking the right flavour.
   *
   * When set, `children` are NOT rendered, so a caller can pass its normal body
   * without guarding it. `state` is ignored: an empty section never signals.
   */
  empty?: DashboardCardEmpty
  children: ReactNode
}

/** Sticky jump-nav height + a little breathing room, so anchored sections
 *  aren't hidden under the nav after a jump. */
export const NAV_OFFSET = 64

export default function DashboardCard({ id, title, description, headerAccessory, state = 'neutral', inGrid = false, prominent = false, empty, children }: DashboardCardProps) {
  // An empty section never signals and never shouts — whatever state or
  // prominence the caller normally passes is dropped. A collapsed card that
  // carried an `attention` border would be urgency about nothing, which is the
  // same failure as uniform nudge intensity (see states.ts).
  const s = DASHBOARD_STATES[empty ? 'neutral' : state]
  // Cards sit at 1px when resting and 2px whenever a state is set. They do NOT
  // take the tile's 3px + glow: a card is already full-width, so it does not
  // need that much weight to be seen, and reserving the glow for tiles keeps
  // `attention` meaning one specific thing at a glance.
  const borderWidth = empty || state === 'neutral' ? 1 : 2

  return (
    <section
      {...(id ? { id } : {})}
      style={{
        // Collapsed sections are deliberately tighter than live ones. Six of
        // them in a row should scan as a table of contents, not as six cards —
        // that is what keeps "show everything" from becoming "wall of nothing",
        // which matters most on mobile where this page is mostly read.
        padding: empty ? spacing.xs : prominent ? spacing.md : spacing.sm,
        backgroundColor: s.background,
        border: `${borderWidth}px solid ${s.border}`,
        borderRadius: empty ? radius.sm : prominent ? radius.lg : radius.md,
        // Grid items default to `min-width: auto`, i.e. "never shrink below your
        // content". So a child that cannot wrap — anything with
        // `white-space: nowrap`, a URL, a long name — makes its whole COLUMN
        // expand instead of truncating, squeezing every sibling column.
        // 2026-08-07: a long notification title did exactly this on the FT
        // shopper dashboard. DashboardNotifications was already asking for
        // ellipsis truncation; it simply never engaged, because nothing
        // constrained the width. This is the constraint.
        minWidth: 0,
        ...(inGrid ? { height: '100%' } : { marginBottom: spacing.sm }),
        scrollMarginTop: `${NAV_OFFSET}px`,
      }}
    >
      {(title || (headerAccessory && !empty)) && (
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: spacing.xs,
          flexWrap: 'wrap',
          // A collapsed card is header + one line; the header's normal bottom
          // margin would make the pair look like two separate things.
          marginBottom: empty ? spacing['3xs'] : description ? spacing['2xs'] : spacing.xs,
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
          {!empty && headerAccessory}
        </div>
      )}
      {/* Collapsed body. The description is suppressed too — an empty section
          gets ONE line, and the empty message is the more useful of the two. */}
      {empty ? (
        <p style={{
          margin: 0,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          lineHeight: 1.5,
        }}>
          {empty.message}
          {empty.action && (
            <>
              {' '}
              <Link
                href={empty.action.href}
                style={{ color: colors.primary, fontWeight: typography.weights.medium, textDecoration: 'none' }}
              >
                {empty.action.label} →
              </Link>
            </>
          )}
        </p>
      ) : (
        <>
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
        </>
      )}
    </section>
  )
}
