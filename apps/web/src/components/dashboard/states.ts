import { colors, statusColors } from '@/lib/design-tokens'

/**
 * The semantic states a dashboard unit (tile or card) can be in, ordered by how
 * loudly they shout. ONE vocabulary shared by DashboardTile and DashboardCard,
 * so "needs your attention" looks identical everywhere in the app.
 *
 * Every colour here comes from the shared palette in lib/design-tokens.ts. Do
 * NOT reintroduce raw hex in a dashboard — that is exactly the drift this
 * replaces (the two big dashboards had accumulated 38 hardcoded hex values,
 * including two different colours for the same severity tier).
 *
 * Adding a state is deliberately cheap: one entry below, and every tile and card
 * in the app can use it immediately. Expect to add some after real device
 * testing — that is the plan, not a gap.
 *
 * `suspended`/`revoked` was considered and deliberately NOT added (owner,
 * 2026-08-07): the concept is live in the data (migration 217; the manager
 * access-suspended / access-removed pages) but it would render identically to
 * `danger`, so it earns its own state only if testing shows it needs one.
 */
export type DashboardState =
  | 'neutral'    // resting. no condition met.
  | 'active'     // something in flight and healthy — you have work today.
  | 'attention'  // YOU must act and nobody else can. loudest state by design.
  | 'warning'    // degrading, not broken.
  | 'danger'     // broken or blocking.
  | 'pending'    // you have done your part; someone else has not.
  | 'locked'     // the feature exists, your tier does not include it.
  | 'promo'      // an upgrade / promotion offer. A purpose, not a data condition.

export interface DashboardStateStyle {
  background: string
  border: string
  /** Border weight for TILES. Cards use 1px at rest and 2px whenever stated. */
  borderWidth: 1 | 2 | 3
  title: string
  /** Only `attention` earns a glow — it is the one state meant to interrupt a scan. */
  glow?: string
}

export const DASHBOARD_STATES: Record<DashboardState, DashboardStateStyle> = {
  neutral: {
    background: colors.surfaceElevated,
    border: colors.border,
    borderWidth: 1,
    title: colors.primary,
  },
  active: {
    background: colors.primaryLight,
    border: colors.primary,
    borderWidth: 2,
    title: colors.primaryDark,
  },
  // Distinct from `danger` on purpose. The FT vertical previously leaned on red
  // so heavily that everything looked urgent and the signal stopped meaning
  // anything (owner, 2026-08-07). Actionable-but-fine must not look like broken.
  attention: {
    background: statusColors.attentionLight,
    border: statusColors.attention,
    borderWidth: 3,
    title: statusColors.attentionDark,
    glow: '0 0 0 3px rgba(234, 88, 12, 0.2)',
  },
  warning: {
    background: statusColors.warningLight,
    border: statusColors.warningBorder,
    borderWidth: 2,
    title: statusColors.warningDark,
  },
  danger: {
    background: statusColors.dangerLight,
    border: statusColors.dangerBorder,
    borderWidth: 2,
    title: statusColors.dangerDark,
  },
  // Info blue, and that is the whole point: `pending` must NOT read as
  // `attention`. Blue says "in progress, nothing for you to do" — today the
  // dashboards render this condition ("Available after approval") as muted grey
  // body text, so a vendor cannot tell "waiting on us" from "waiting on you".
  pending: {
    background: statusColors.infoLight,
    border: statusColors.infoBorder,
    borderWidth: 2,
    title: statusColors.infoDark,
  },
  locked: {
    background: statusColors.neutral50,
    border: statusColors.neutral300,
    borderWidth: 1,
    title: colors.textSecondary,
  },
  // The one entry that is a PURPOSE rather than a data condition: an upgrade or
  // promotion offer. Kept in this map anyway so there is a single vocabulary
  // instead of promo blocks going bespoke — which is exactly how they drifted.
  //
  // Deliberately an OUTLINE on a plain background, not a gradient fill (owner,
  // 2026-08-07): "if we want to promote them then an outlined color or colors is
  // better anyway." An outline draws the eye without competing with the rest of
  // the page, and it survives small screens and dark backgrounds — which the
  // previous `linear-gradient(135deg, #fefce8, #fef3c7)` treatments did not.
  promo: {
    background: colors.surfaceElevated,
    border: colors.accent,
    borderWidth: 2,
    title: colors.textPrimary,
  },
}
