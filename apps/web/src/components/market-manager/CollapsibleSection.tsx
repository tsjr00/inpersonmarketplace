'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { MANAGER_NAV_OFFSET } from './ManagerCard'

/**
 * A titled, collapsible group wrapper for the manager dashboard. Used to
 * fold occasional-use groups (e.g. FT "Park setup") out of the daily eyeline
 * without removing them. Server renders the children (cards); this client
 * island only owns the collapse toggle.
 */
export default function CollapsibleSection({
  id,
  title,
  subtitle,
  defaultCollapsed = false,
  children,
}: {
  id?: string
  title: string
  subtitle?: string
  defaultCollapsed?: boolean
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  return (
    <section id={id} style={{ scrollMarginTop: MANAGER_NAV_OFFSET, marginBottom: spacing.sm }}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'baseline',
          gap: spacing['2xs'],
          padding: `${spacing.xs} 0`,
          background: 'none',
          border: 'none',
          borderBottom: `1px solid ${colors.border}`,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted, width: 12 }}>
          {collapsed ? '▸' : '▾'}
        </span>
        <span style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>{subtitle}</span>
        )}
        {collapsed && (
          <span style={{
            marginLeft: 'auto',
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
            color: colors.primary,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            padding: `${spacing['3xs']} ${spacing.xs}`,
          }}>
            Show
          </span>
        )}
      </button>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, marginTop: spacing.sm }}>
          {children}
        </div>
      )}
    </section>
  )
}
