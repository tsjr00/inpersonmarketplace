'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { MANAGER_NAV_OFFSET } from './ManagerCard'

/**
 * A titled, collapsible group wrapper for the manager dashboard. Reads as a
 * single outlined, obviously-expandable box (accent rail + large disclosure
 * triangle + Show/Hide pill) so a collapsed group doesn't look like a stray
 * heading. Used to fold occasional-use groups (e.g. FT "Park setup") out of
 * the daily eyeline. Server renders the children (cards); this client island
 * only owns the collapse toggle.
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
    <section
      id={id}
      style={{
        scrollMarginTop: MANAGER_NAV_OFFSET,
        marginTop: spacing.md,
        marginBottom: spacing.sm,
        border: `2px solid ${colors.border}`,
        borderRadius: radius.md,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
          padding: spacing.sm,
          background: colors.surfaceMuted,
          border: 'none',
          borderLeft: `4px solid ${colors.primary}`,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-block',
          fontSize: 20,
          lineHeight: 1,
          color: colors.primary,
          transition: 'transform 0.15s ease',
          transform: collapsed ? 'none' : 'rotate(180deg)',
        }}>
          ▾
        </span>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        <span style={{
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          color: colors.primary,
          border: `1px solid ${colors.primary}`,
          borderRadius: radius.sm,
          padding: `${spacing['3xs']} ${spacing.sm}`,
          whiteSpace: 'nowrap',
        }}>
          {collapsed ? 'Show' : 'Hide'}
        </span>
      </button>
      {!collapsed && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.sm,
          padding: spacing.sm,
          backgroundColor: colors.surfaceBase,
        }}>
          {children}
        </div>
      )}
    </section>
  )
}
