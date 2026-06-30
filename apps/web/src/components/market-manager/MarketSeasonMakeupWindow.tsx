'use client'

import { useCallback, useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

const ACCENT_BG = '#ecfdf5'
const ACCENT_BORDER = '#10b981'
const ACCENT_TEXT = '#065f46'

function fmtDate(d: string): string {
  const date = new Date(`${d}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? d
    : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Phase E make-up days — the make-up window UI for an 'ended' season. Lists the
 * scheduled make-up dates + remaining capacity and lets the manager schedule
 * another (any day of week, after the season's end date), capped by the season's
 * potential_makeup_days. Fulfillment only — no money moves; scheduling notifies
 * the season's paid-booth vendors.
 */
export default function MarketSeasonMakeupWindow({ marketId, seasonId }: { marketId: string; seasonId: string }) {
  const [dates, setDates] = useState<string[]>([])
  const [potential, setPotential] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [newDate, setNewDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/seasons/${seasonId}/makeup-dates`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDates((data.scheduledDates ?? []) as string[])
        setPotential(data.potentialMakeupDays ?? 0)
        setRemaining(data.remaining ?? 0)
      } else {
        setError(data.error || 'Could not load make-up days.')
      }
    } catch {
      setError('Network error loading make-up days.')
    } finally {
      setLoading(false)
    }
  }, [marketId, seasonId])

  useEffect(() => { load() }, [load])

  async function schedule() {
    if (!newDate) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/seasons/${seasonId}/makeup-dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not schedule that date.')
      } else {
        setNotice(`Make-up day scheduled for ${fmtDate(newDate)}. Vendors notified.`)
        setNewDate('')
        await load()
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>Loading make-up window…</div>
  }

  return (
    <div style={{
      backgroundColor: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, borderRadius: radius.sm,
      padding: spacing.sm, display: 'flex', flexDirection: 'column', gap: spacing.xs,
    }}>
      <strong style={{ fontSize: typography.sizes.sm, color: ACCENT_TEXT }}>
        Make-up window open — {dates.length} of {potential} scheduled
      </strong>

      {potential === 0 ? (
        <span style={{ fontSize: typography.sizes.sm, color: ACCENT_TEXT }}>
          This season has no make-up buffer, so make-up days can&apos;t be scheduled. Resolve any owed days in
          Season settlement below.
        </span>
      ) : (
        <>
          {dates.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: spacing.md, fontSize: typography.sizes.sm, color: colors.textPrimary }}>
              {dates.map((d) => <li key={d}>{fmtDate(d)}</li>)}
            </ul>
          )}
          {remaining > 0 ? (
            <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
                <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                  New make-up date (any day, after the season end)
                </span>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{
                  padding: `${spacing['2xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm, fontSize: typography.sizes.sm, color: colors.textPrimary,
                  backgroundColor: colors.surfaceElevated,
                }} />
              </label>
              <button type="button" onClick={schedule} disabled={busy || !newDate} style={{
                padding: `${spacing['2xs']} ${spacing.sm}`, minHeight: 44,
                backgroundColor: (busy || !newDate) ? colors.surfaceBase : colors.primary,
                color: (busy || !newDate) ? colors.textMuted : '#fff',
                border: (busy || !newDate) ? `1px solid ${colors.border}` : 'none', borderRadius: radius.sm,
                fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold,
                cursor: busy ? 'wait' : (!newDate ? 'not-allowed' : 'pointer'),
              }}>
                {busy ? 'Scheduling…' : 'Schedule make-up day'}
              </button>
            </div>
          ) : (
            <span style={{ fontSize: typography.sizes.sm, color: ACCENT_TEXT }}>
              All {potential} make-up day(s) scheduled.
            </span>
          )}
        </>
      )}

      {error && <span style={{ fontSize: typography.sizes.sm, color: '#721c24' }}>{error}</span>}
      {notice && <span style={{ fontSize: typography.sizes.sm, color: ACCENT_TEXT }}>{notice}</span>}
    </div>
  )
}
