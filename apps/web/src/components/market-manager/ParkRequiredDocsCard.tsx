'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import ManagerCard from './ManagerCard'
import {
  PARK_REQUIRED_DOC_OPTIONS,
  MAX_CUSTOM_DOCS,
  MAX_CUSTOM_DOC_LABEL,
  requiredDocLabel,
  type RequiredDocEntry,
} from '@/lib/markets/required-docs'

/**
 * Park required-documents card — tester finding P4b (2026-07-15), structured
 * 2026-07-23.
 *
 * The booking flow tells trucks to upload "the documents this park requires";
 * operators say what those are here. A checkbox list of the standard food-truck
 * permits (labels from the SAME onboarding source the vendor uploads against)
 * plus repeatable free-text "Other" entries. Structured storage in
 * markets.required_docs (mig 206). Display-only — enforcement stays human review
 * (book-then-vet), deliberately not a compliance engine.
 *
 * Self-fetching (GET/PATCH market-manager/[marketId]/required-docs) so the
 * dashboard keeps rendering even before mig 206 is applied — a fetch failure
 * just shows the card in a quiet error state; an absent column reads as "none".
 */
interface ParkRequiredDocsCardProps {
  marketId: string
}

export default function ParkRequiredDocsCard({ marketId }: ParkRequiredDocsCardProps) {
  const [saved, setSaved] = useState<RequiredDocEntry[]>([])
  const [standardKeys, setStandardKeys] = useState<Set<string>>(new Set())
  const [customLabels, setCustomLabels] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/market-manager/${marketId}/required-docs`)
      .then(async (res) => {
        if (!res.ok) throw new Error('load failed')
        const data = await res.json()
        if (cancelled) return
        const docs: RequiredDocEntry[] = Array.isArray(data.required_docs) ? data.required_docs : []
        setSaved(docs)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => { cancelled = true }
  }, [marketId])

  function beginEdit() {
    setStandardKeys(new Set(saved.filter((d) => d.key !== 'other').map((d) => d.key)))
    setCustomLabels(saved.filter((d) => d.key === 'other').map((d) => d.label ?? ''))
    setError(null)
    setEditing(true)
  }

  function toggleStandard(key: string) {
    setStandardKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    const entries: RequiredDocEntry[] = [
      ...PARK_REQUIRED_DOC_OPTIONS.filter((o) => standardKeys.has(o.key)).map((o) => ({ key: o.key })),
      ...customLabels
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, MAX_CUSTOM_DOCS)
        .map((label) => ({ key: 'other' as const, label })),
    ]
    try {
      const res = await fetch(`/api/market-manager/${marketId}/required-docs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ required_docs: entries }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((data as { error?: string }).error || 'Could not save. Please try again.')
        return
      }
      const docs: RequiredDocEntry[] = Array.isArray((data as { required_docs?: unknown }).required_docs)
        ? (data as { required_docs: RequiredDocEntry[] }).required_docs
        : []
      setSaved(docs)
      setEditing(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 3000)
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ManagerCard
      title="Required documents"
      description="Tell food trucks which documents they must carry to book here. Shown on the booking page. You review what they upload — booking is never blocked by missing docs."
    >
      {loadFailed ? (
        <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>
          Couldn&apos;t load right now — try refreshing.
        </p>
      ) : !loaded ? (
        <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>Loading…</p>
      ) : editing ? (
        <div>
          <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing['3xs'] }}>
            Standard permits
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'], marginBottom: spacing.sm }}>
            {PARK_REQUIRED_DOC_OPTIONS.map((opt) => (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.xs, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={standardKeys.has(opt.key)}
                  onChange={() => toggleStandard(opt.key)}
                  style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer' }}
                />
                <span>
                  <span style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>{opt.label}</span>
                  <span style={{ display: 'block', fontSize: typography.sizes.xs, color: colors.textMuted, lineHeight: 1.3 }}>{opt.description}</span>
                </span>
              </label>
            ))}
          </div>

          <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing['3xs'] }}>
            Other documents
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'], marginBottom: spacing.xs }}>
            {customLabels.map((label, i) => (
              <div key={i} style={{ display: 'flex', gap: spacing['2xs'], alignItems: 'center' }}>
                <input
                  type="text"
                  value={label}
                  maxLength={MAX_CUSTOM_DOC_LABEL}
                  placeholder="e.g. City noise permit"
                  onChange={(e) => setCustomLabels((prev) => prev.map((l, j) => (j === i ? e.target.value : l)))}
                  style={{
                    flex: 1,
                    padding: spacing.xs,
                    fontSize: typography.sizes.sm,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surfaceBase,
                    color: colors.textPrimary,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setCustomLabels((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="Remove"
                  style={{ ...secondaryButtonStyle, padding: `${spacing['3xs']} ${spacing.xs}` }}
                >
                  Remove
                </button>
              </div>
            ))}
            {customLabels.length < MAX_CUSTOM_DOCS && (
              <button
                type="button"
                onClick={() => setCustomLabels((prev) => [...prev, ''])}
                style={{ ...secondaryButtonStyle, alignSelf: 'flex-start' }}
              >
                + Add another document
              </button>
            )}
          </div>

          {error && (
            <div style={{ fontSize: typography.sizes.xs, color: '#dc2626', marginTop: spacing['3xs'] }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs }}>
            <button type="button" onClick={save} disabled={saving} style={primaryButtonStyle}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null) }}
              disabled={saving}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          {saved.length > 0 ? (
            <ul style={{ margin: `0 0 ${spacing.xs} 0`, paddingLeft: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
              {saved.map((entry, i) => (
                <li key={i} style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>
                  {requiredDocLabel(entry)}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, marginBottom: spacing.xs, fontSize: typography.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>
              No required documents listed yet — trucks currently see only the generic acknowledgment.
            </p>
          )}
          {savedFlash && (
            <div style={{ fontSize: typography.sizes.xs, color: '#059669', marginBottom: spacing.xs }}>✓ Saved</div>
          )}
          <button type="button" onClick={beginEdit} style={secondaryButtonStyle}>
            {saved.length > 0 ? 'Edit list' : 'Add required documents'}
          </button>
        </div>
      )}
    </ManagerCard>
  )
}

const primaryButtonStyle = {
  padding: `${spacing.xs} ${spacing.sm}`,
  backgroundColor: colors.primary,
  color: 'white',
  border: 'none',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  cursor: 'pointer',
} as const

const secondaryButtonStyle = {
  padding: `${spacing.xs} ${spacing.sm}`,
  backgroundColor: 'transparent',
  color: colors.textPrimary,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  cursor: 'pointer',
} as const
