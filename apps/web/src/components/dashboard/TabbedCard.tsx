'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { NAV_OFFSET } from './DashboardCard'

/**
 * A section with a title + a segmented tab bar that swaps one panel at a
 * time. Used to fold several related cards (e.g. FT "Your trucks" = roster /
 * recurring / invite) into one object instead of a vertical stack. Each
 * panel's content renders as-is (cards keep their own chrome) — this is a
 * presentation shell, no logic in the panels changes.
 */
interface Tab {
  id: string
  label: ReactNode
  content: ReactNode
}

export default function TabbedCard({
  id,
  title,
  tabs,
  defaultTabId,
  heading = 'group',
}: {
  id?: string
  title: string
  tabs: Tab[]
  defaultTabId?: string
  /** 'group' (default) = accent rail + xl title, the same look as GroupHeading —
   *  for a tabbed card that IS a section (FT "Your trucks"). 'card' = a card-level
   *  header (lg / semibold, no rail) for a tabbed card nested UNDER a GroupHeading
   *  (FM "Vendors at this market" — owner 2026-09-20: it read as a section). */
  heading?: 'group' | 'card'
}) {
  const [active, setActive] = useState(defaultTabId ?? tabs[0]?.id)
  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0]

  return (
    <section id={id} style={{ scrollMarginTop: NAV_OFFSET, marginTop: heading === 'group' ? spacing.md : spacing.sm }}>
      {heading === 'group' ? (
        <div style={{
          borderLeft: `4px solid ${colors.primary}`,
          paddingLeft: spacing.sm,
          marginBottom: spacing.sm,
        }}>
          <span style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
            {title}
          </span>
        </div>
      ) : (
        <h2 style={{ margin: `0 0 ${spacing.xs} 0`, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
          {title}
        </h2>
      )}

      <div role="tablist" aria-label={title} style={{ display: 'flex', gap: spacing['2xs'], marginBottom: spacing.sm, flexWrap: 'wrap' }}>
        {tabs.map((t) => {
          const on = t.id === activeTab?.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.id)}
              style={{
                padding: `${spacing['2xs']} ${spacing.md}`,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: on ? 'white' : colors.textPrimary,
                backgroundColor: on ? colors.primary : colors.surfaceBase,
                border: `1px solid ${on ? colors.primary : colors.border}`,
                borderRadius: radius.sm,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel">{activeTab?.content}</div>
    </section>
  )
}
