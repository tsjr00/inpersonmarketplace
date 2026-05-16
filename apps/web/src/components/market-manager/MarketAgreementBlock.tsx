'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Vendor-facing agreement block rendered on the co-branded vendor-signup
 * page (and any future surface that needs the same UI). Shows the
 * manager's selected opt-in statements grouped by category, with a
 * single "I agree" checkbox.
 *
 * Design intent (locked Session 82):
 *  - Single checkbox covering all statements ("I agree to this market's
 *    agreement"), NOT one checkbox per statement. Statements are visible
 *    above the checkbox so the vendor can read them.
 *  - Grouped by category for scannability — managers organize their
 *    statements that way and so do we.
 *  - If the manager has selected zero statements, the block renders
 *    NOTHING. Caller decides what to do with that case (typically: no
 *    checkbox needed, vendor proceeds without acceptance).
 *  - `accepted` state is hoisted to the caller via `onChange` so the
 *    submit button can gate on the value.
 *
 * Data source: GET /api/markets/[id]/optin-public (service-client; no auth).
 */
interface MarketAgreementBlockProps {
  marketId: string
  /** Fired whenever the checkbox value changes. */
  onChange: (accepted: boolean) => void
  /** Optional initial value. Defaults to false. */
  initialAccepted?: boolean
}

interface RenderedStatement {
  statement_id: string
  category: string
  category_label: string
  rendered_text: string
}

export default function MarketAgreementBlock({
  marketId,
  onChange,
  initialAccepted = false,
}: MarketAgreementBlockProps) {
  const [statements, setStatements] = useState<RenderedStatement[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(initialAccepted)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/markets/${marketId}/optin-public`)
        if (!res.ok) {
          if (!cancelled) setLoadError('Could not load market agreement')
          return
        }
        const data = await res.json()
        if (cancelled) return
        setStatements(
          Array.isArray(data?.statements) ? (data.statements as RenderedStatement[]) : []
        )
      } catch {
        if (!cancelled) setLoadError('Network error loading market agreement')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [marketId])

  // Loading — show a slim placeholder so layout doesn't jump
  if (statements === null && !loadError) {
    return (
      <div style={{ padding: spacing.sm, color: colors.textMuted, fontSize: typography.sizes.sm }}>
        Loading market agreement…
      </div>
    )
  }

  // Error case — show inline so vendor isn't blocked silently
  if (loadError) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: radius.sm,
        color: '#856404',
        fontSize: typography.sizes.sm,
      }}>
        {loadError}. You can still proceed — the manager will follow up if needed.
      </div>
    )
  }

  // Empty — manager hasn't selected statements yet. Render nothing AND
  // auto-fire onChange(true) so the parent's submit gate doesn't block
  // on a non-existent checkbox. The acceptance row write in /api/submit
  // will be a no-op snapshot (empty array) — semantically "vendor agreed
  // to nothing because there was nothing to agree to," and recoverable
  // when the manager later picks statements (prompt-on-next-load).
  if (statements && statements.length === 0) {
    if (!accepted) {
      // Defer the state update so we don't setState during render
      queueMicrotask(() => {
        setAccepted(true)
        onChange(true)
      })
    }
    return null
  }

  // Group by category for display
  const groups = new Map<string, { label: string; items: RenderedStatement[] }>()
  for (const s of statements || []) {
    if (!groups.has(s.category)) {
      groups.set(s.category, { label: s.category_label, items: [] })
    }
    groups.get(s.category)!.items.push(s)
  }

  const handleToggle = (next: boolean) => {
    setAccepted(next)
    onChange(next)
  }

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: colors.surfaceBase,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    }}>
      <h3 style={{
        marginTop: 0,
        marginBottom: spacing.xs,
        fontSize: typography.sizes.base,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        Market agreement
      </h3>
      <p style={{
        margin: 0,
        marginBottom: spacing.sm,
        fontSize: typography.sizes.sm,
        color: colors.textMuted,
        lineHeight: 1.5,
      }}>
        By signing up to this market you&apos;re agreeing to the following.
        These are the operating rules the market manager has set for vendors.
      </p>

      {Array.from(groups.entries()).map(([categoryId, group]) => (
        <div key={categoryId} style={{ marginBottom: spacing.sm }}>
          <div style={{
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: spacing['2xs'],
          }}>
            {group.label}
          </div>
          <ul style={{
            margin: 0,
            paddingLeft: spacing.md,
            fontSize: typography.sizes.sm,
            color: colors.textPrimary,
            lineHeight: 1.5,
          }}>
            {group.items.map((s) => (
              <li key={s.statement_id} style={{ marginBottom: spacing['3xs'] }}>
                {s.rendered_text}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <label style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.xs,
        marginTop: spacing.md,
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.sm,
        cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => handleToggle(e.target.checked)}
          style={{
            marginTop: 3,
            width: 18,
            height: 18,
            cursor: 'pointer',
          }}
        />
        <span style={{
          fontSize: typography.sizes.sm,
          color: colors.textPrimary,
          fontWeight: typography.weights.semibold,
          lineHeight: 1.4,
        }}>
          I agree to this market&apos;s agreement.
        </span>
      </label>
    </div>
  )
}
