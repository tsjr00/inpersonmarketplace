import type { ReactNode } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Shared card wrapper for the market-manager dashboard (Session 92 design pass).
 * Enforces consistent chrome so the whole page reads as one system:
 *   - padding: spacing.sm (16) — tighter than the old spacing.md (24)
 *   - gap between cards: spacing.sm (16) via marginBottom
 *   - section header at the agreed `lg` semibold; description at `sm` muted
 *   - id + scrollMarginTop so the sticky jump-nav lands the section cleanly
 *
 * Typography discipline (4 sizes page-wide): title `xl`, headers `lg`,
 * body `sm`, meta `xs`. Metric values use `lg` bold. Cards should NOT
 * reintroduce `2xl`/`xl` body text (that was the wrapping problem).
 */
interface ManagerCardProps {
  /** Anchor id for the jump-nav (e.g. 'money', 'vendors'). */
  id?: string
  /** Section header (rendered at lg/semibold). Omit for headerless cards. */
  title?: string
  /** Optional sub-text under the header (sm/muted). */
  description?: ReactNode
  /** Optional node rendered at the right of the header row (badge, count). */
  headerAccessory?: ReactNode
  children: ReactNode
}

/** Sticky jump-nav height + a little breathing room, so anchored sections
 *  aren't hidden under the nav after a jump. */
export const MANAGER_NAV_OFFSET = 64

export default function ManagerCard({ id, title, description, headerAccessory, children }: ManagerCardProps) {
  return (
    <section
      {...(id ? { id } : {})}
      style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.sm,
        scrollMarginTop: `${MANAGER_NAV_OFFSET}px`,
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
