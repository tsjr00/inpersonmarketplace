'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import ManagerCard from './ManagerCard'

/**
 * Park required-documents card — tester finding P4b (2026-07-15).
 *
 * The booking flow tells trucks to upload "the documents this park requires,"
 * but operators had no way to say what those are. Free text (mig 192,
 * markets.required_docs_note), displayed verbatim on the booking form above
 * the document acknowledgment. Display-only — enforcement stays human review
 * (book-then-vet), deliberately not a compliance engine.
 *
 * Self-fetching (GET/PATCH market-manager/[marketId]/required-docs) rather
 * than page-supplied so the dashboard keeps rendering even before mig 192
 * is applied — a fetch failure just shows the card in a quiet error state.
 */
interface ParkRequiredDocsCardProps {
  marketId: string
}

export default function ParkRequiredDocsCard({ marketId }: ParkRequiredDocsCardProps) {
  const [note, setNote] = useState<string>('')
  const [savedNote, setSavedNote] = useState<string>('')
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
        const value = (data.required_docs_note as string | null) ?? ''
        setNote(value)
        setSavedNote(value)
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => { cancelled = true }
  }, [marketId])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/required-docs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ required_docs_note: note.trim() || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((data as { error?: string }).error || 'Could not save. Please try again.')
        return
      }
      const value = ((data as { required_docs_note?: string | null }).required_docs_note as string | null) ?? ''
      setNote(value)
      setSavedNote(value)
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
      description="Tell food trucks which documents they must carry to book here (permits, insurance, licenses). Shown on the booking page. You review what they upload — booking is never blocked by missing docs."
    >
      {loadFailed ? (
        <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>
          Couldn&apos;t load right now — try refreshing.
        </p>
      ) : !loaded ? (
        <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>Loading…</p>
      ) : editing ? (
        <div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder={'One per line, e.g.\nCity vending permit\nCertificate of insurance ($1M, naming the park)\nCounty health permit'}
            style={{
              width: '100%',
              padding: spacing.xs,
              fontSize: typography.sizes.sm,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceBase,
              color: colors.textPrimary,
              resize: 'vertical',
            }}
          />
          {error && (
            <div style={{ fontSize: typography.sizes.xs, color: '#dc2626', marginTop: spacing['3xs'] }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs }}>
            <button type="button" onClick={save} disabled={saving} style={primaryButtonStyle}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setNote(savedNote); setEditing(false); setError(null) }}
              disabled={saving}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          {savedNote ? (
            <div style={{ fontSize: typography.sizes.sm, color: colors.textPrimary, whiteSpace: 'pre-wrap', marginBottom: spacing.xs }}>
              {savedNote}
            </div>
          ) : (
            <p style={{ margin: 0, marginBottom: spacing.xs, fontSize: typography.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>
              No required documents listed yet — trucks currently see only the generic acknowledgment.
            </p>
          )}
          {savedFlash && (
            <div style={{ fontSize: typography.sizes.xs, color: '#059669', marginBottom: spacing.xs }}>✓ Saved</div>
          )}
          <button type="button" onClick={() => setEditing(true)} style={secondaryButtonStyle}>
            {savedNote ? 'Edit list' : 'Add required documents'}
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
