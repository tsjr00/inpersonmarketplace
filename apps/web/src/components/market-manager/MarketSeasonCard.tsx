'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ManagerCard from './ManagerCard'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

const DANGER = '#dc2626'

interface Season {
  id: string
  name: string
  start_date: string
  end_date: string
  declared_market_days: number | null
  refund_cap_days: number | null
  prepay_open: boolean
  prepay_opened_at: string | null
  prepay_closes_at: string | null
  status: string
  created_at: string
}

/** Format a plain DATE (YYYY-MM-DD) as local midnight to avoid the off-by-one. */
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const date = new Date(`${d}T00:00:00`)
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Phase E — manager season pre-sale setup. Create a season (the system derives
 * the market-day count + a 10% refund cap), then open the pre-sale window
 * (allowed within 60 days of start; one open season per market at a time; auto-
 * closes 14 days after start). Vendors prepay a whole season in one checkout.
 */
export default function MarketSeasonCard({ marketId }: { marketId: string }) {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [creating, setCreating] = useState(false)
  const [needsScheduleConfirm, setNeedsScheduleConfirm] = useState(false)
  const [scheduleConfirmChecked, setScheduleConfirmChecked] = useState(false)

  const [busyId, setBusyId] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-manager/${marketId}/seasons`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) setSeasons((data.seasons ?? []) as Season[])
      else setError(data.error || 'Could not load seasons.')
    } catch {
      setError('Network error loading seasons.')
    } finally {
      setLoading(false)
    }
  }, [marketId])

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    load()
  }, [load])

  async function createSeason() {
    setError(null)
    if (!name.trim()) { setError('Give the season a name.'); return }
    if (!startDate || !endDate) { setError('Pick start and end dates.'); return }
    setCreating(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/seasons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          ...(scheduleConfirmChecked ? { scheduleConfirmed: true } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.needsScheduleConfirm) { setNeedsScheduleConfirm(true); setError(null) }
        else setError(data.error || 'Could not create the season.')
      } else {
        setName(''); setStartDate(''); setEndDate('')
        setNeedsScheduleConfirm(false); setScheduleConfirmChecked(false)
        await load()
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setCreating(false)
    }
  }

  async function act(seasonId: string, action: 'open_prepay' | 'close_prepay') {
    setError(null)
    setBusyId(seasonId)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/seasons`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error || 'Action failed.')
      else await load()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusyId(null)
    }
  }

  const inputStyle = {
    padding: `${spacing['2xs']} ${spacing.xs}`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    width: '100%',
  } as const

  return (
    <ManagerCard
      id="seasons"
      title="Season pre-sales"
      description="Set up a season and pre-sell whole-season booth spots to committed vendors in one payment. Pre-sales open within 60 days of the start date, one season at a time, and close 14 days after the season begins."
    >
      {error && (
        <div style={{ marginBottom: spacing.sm, fontSize: typography.sizes.sm, color: DANGER }}>{error}</div>
      )}

      {/* Existing seasons */}
      {loading ? (
        <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>Loading seasons…</div>
      ) : seasons.length === 0 ? (
        <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.sm }}>
          No seasons yet. Create one below.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, marginBottom: spacing.md }}>
          {seasons.map((s) => (
            <div key={s.id} style={{
              padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                  {s.name}
                  <span style={{
                    marginLeft: spacing.xs, padding: `0 ${spacing['2xs']}`, borderRadius: radius.full,
                    fontSize: typography.sizes.xs, fontWeight: typography.weights.medium,
                    backgroundColor: s.prepay_open ? colors.primaryLight : colors.surfaceMuted,
                    color: s.prepay_open ? colors.primaryDark : colors.textMuted,
                  }}>
                    {s.prepay_open ? 'Pre-sales open' : s.status}
                  </span>
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                  {fmtDate(s.start_date)} – {fmtDate(s.end_date)} · {s.declared_market_days ?? '?'} market days · cap {s.refund_cap_days ?? '?'} days
                  {s.prepay_open && s.prepay_closes_at ? ` · closes ${fmtDate(s.prepay_closes_at.slice(0, 10))}` : ''}
                </div>
              </div>
              {s.prepay_open ? (
                <button onClick={() => act(s.id, 'close_prepay')} disabled={busyId === s.id} style={{
                  padding: `${spacing['2xs']} ${spacing.sm}`, backgroundColor: colors.surfaceBase,
                  color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radius.sm,
                  fontSize: typography.sizes.sm, cursor: busyId === s.id ? 'wait' : 'pointer',
                }}>
                  {busyId === s.id ? '…' : 'Close pre-sales'}
                </button>
              ) : (
                <button onClick={() => act(s.id, 'open_prepay')} disabled={busyId === s.id} style={{
                  padding: `${spacing['2xs']} ${spacing.sm}`, backgroundColor: colors.primary,
                  color: '#fff', border: 'none', borderRadius: radius.sm,
                  fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold,
                  cursor: busyId === s.id ? 'wait' : 'pointer',
                }}>
                  {busyId === s.id ? '…' : 'Open pre-sales'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, maxWidth: 460, borderTop: `1px solid ${colors.border}`, paddingTop: spacing.sm }}>
        <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
          New season
        </span>
        <input type="text" value={name} maxLength={120} placeholder="Season name (e.g. Summer 2026)"
          onChange={(e) => setName(e.target.value)} style={inputStyle} />
        <div style={{ display: 'flex', gap: spacing.sm }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
            <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>Start</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
            <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>End</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </label>
        </div>

        {needsScheduleConfirm && (
          <label style={{ display: 'flex', gap: spacing['2xs'], alignItems: 'flex-start', fontSize: typography.sizes.sm, color: colors.textPrimary }}>
            <input type="checkbox" checked={scheduleConfirmChecked} onChange={(e) => setScheduleConfirmChecked(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I confirm my market schedule (operating days &amp; times) is accurate — the season&apos;s market-day count is derived from it.</span>
          </label>
        )}

        <button onClick={createSeason} disabled={creating || (needsScheduleConfirm && !scheduleConfirmChecked)} style={{
          alignSelf: 'flex-start', padding: `${spacing.xs} ${spacing.md}`,
          backgroundColor: (needsScheduleConfirm && !scheduleConfirmChecked) ? colors.surfaceBase : colors.primary,
          color: (needsScheduleConfirm && !scheduleConfirmChecked) ? colors.textMuted : '#fff',
          border: (needsScheduleConfirm && !scheduleConfirmChecked) ? `1px solid ${colors.border}` : 'none',
          borderRadius: radius.sm, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold,
          cursor: creating ? 'wait' : 'pointer',
        }}>
          {creating ? 'Creating…' : 'Create season'}
        </button>
      </div>
    </ManagerCard>
  )
}
