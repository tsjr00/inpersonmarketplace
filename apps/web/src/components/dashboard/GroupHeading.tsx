import type { ReactNode } from 'react'
import { colors, spacing, typography } from '@/lib/design-tokens'
import { NAV_OFFSET } from './DashboardCard'

/**
 * Banner that groups several DashboardCards under one heading (accent rail +
 * bold title + optional subtitle + optional right-aligned accessory).
 *
 * Consolidated 2026-08-07 from two byte-identical private copies in
 * FmDashboardBody and FtParkDashboardBody — the FT copy's `accessory` slot is
 * the only difference and is preserved here, so both verticals now share one
 * primitive instead of drifting apart. Server component: no interactivity.
 */
export default function GroupHeading({
  id,
  title,
  subtitle,
  accessory,
}: {
  id?: string
  title: string
  subtitle?: string
  accessory?: ReactNode
}) {
  return (
    <div id={id} style={{ scrollMarginTop: NAV_OFFSET, marginTop: spacing.md, marginBottom: spacing.xs, display: 'flex', alignItems: 'baseline', gap: spacing.xs, flexWrap: 'wrap', borderLeft: `4px solid ${colors.primary}`, paddingLeft: spacing.sm, paddingBottom: spacing.xs, borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary }}>{title}</span>
      {subtitle && <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>{subtitle}</span>}
      {accessory && <span style={{ marginLeft: 'auto' }}>{accessory}</span>}
    </div>
  )
}
