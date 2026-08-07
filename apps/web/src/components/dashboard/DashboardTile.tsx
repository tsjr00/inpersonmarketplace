import type { ReactNode } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, statusColors } from '@/lib/design-tokens'
import { DASHBOARD_STATES, type DashboardState } from './states'
import { DASHBOARD_ICONS, ICON_SIZE, ICON_STROKE, type DashboardIconName } from './icons'

/**
 * A TILE is a door: the whole surface is clickable and takes you somewhere else.
 * Contrast with DashboardCard, which is a room — content lives there and you act
 * on it in place. Full taxonomy: docs/Codebase_Map/22_Components_UI.md.
 *
 * Tiles sit in a grid as equal-height peers (height: 100%), so this component
 * does NOT set a bottom margin — the grid's `gap` owns the spacing.
 *
 * ⚠ KEEP THIS A SERVER COMPONENT (no 'use client'). The dashboards are the
 * highest-traffic authenticated pages and are server-rendered; the chrome ships
 * zero JS. next/link works fine from a server component.
 *
 * ⚠ THE FACE RULE: a tile must say whether it needs you WITHOUT being clicked.
 * Put the count/status in `badge` and the current situation in `children` —
 * "3 to confirm · 2 to fulfill", not "Manage incoming orders". A tile whose
 * description never changes is a tile the user has to open to learn anything.
 */

interface DashboardTileProps {
  /** Where the door leads. Tiles are always navigation. */
  href: string
  /** Name from the shared icon vocabulary (./icons.tsx). EVERY tile takes one —
   *  a grid where some tiles have icons and some do not is the inconsistency
   *  this replaced (owner, 2026-08-07). To change a glyph, edit the map. */
  icon: DashboardIconName
  title: ReactNode
  /** Count or status pill rendered inline after the title. This is the face rule
   *  in component form — use it whenever a number would answer "does this need me?" */
  badge?: ReactNode
  state?: DashboardState
  /** The status line. Should change with the data; see the face rule above. */
  children?: ReactNode
  /** Opens in a new tab. Used sparingly — a tile normally navigates in place. */
  targetBlank?: boolean
}

export default function DashboardTile({
  href,
  icon,
  title,
  badge,
  state = 'neutral',
  children,
  targetBlank = false,
}: DashboardTileProps) {
  const s = DASHBOARD_STATES[state]
  const Icon = DASHBOARD_ICONS[icon]

  // Titles and icons use ONE colour each, NOT the state colour. State reads
  // through background and border instead.
  //
  // Slice 2 tied title colour to state. It was systematic in code but on screen
  // it just looked arbitrary and unpolished — the user has no way to know the
  // rule (owner, 2026-08-07). `locked` is the single exception, because a
  // disabled thing should look disabled.
  const isLocked = state === 'locked'
  const titleColor = isLocked ? colors.textSecondary : colors.textPrimary
  const iconColor = isLocked ? colors.textSecondary : colors.primary

  return (
    <Link
      href={href}
      style={{ textDecoration: 'none' }}
      {...(targetBlank ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <div style={{
        padding: spacing.sm,
        backgroundColor: s.background,
        color: colors.textPrimary,
        border: `${s.borderWidth}px solid ${s.border}`,
        borderRadius: radius.md,
        cursor: 'pointer',
        height: '100%',
        minHeight: 120,
        boxShadow: s.glow ?? shadows.sm,
      }}>
        <div style={{ marginBottom: spacing['2xs'], color: iconColor, lineHeight: 0 }}>
          <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
        </div>
        <h3 style={{
          color: titleColor,
          margin: `0 0 ${spacing['2xs']} 0`,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          display: 'flex',
          alignItems: 'center',
          gap: spacing['2xs'],
          flexWrap: 'wrap',
        }}>
          {title}
          {badge}
        </h3>
        {children && (
          <div style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
            {children}
          </div>
        )}
      </div>
    </Link>
  )
}

/**
 * The count/status pill that goes in a tile's `badge` slot. Tone defaults to
 * matching the tile's state so the pill reads as part of the same signal.
 */
export function TileBadge({ children, tone = 'attention' }: { children: ReactNode; tone?: 'attention' | 'primary' | 'danger' }) {
  const background =
    tone === 'primary' ? colors.primary
    : tone === 'danger' ? statusColors.danger
    : statusColors.attention

  return (
    <span style={{
      backgroundColor: background,
      color: 'white',
      padding: `2px ${spacing.xs}`,
      borderRadius: radius.full,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.bold,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}
