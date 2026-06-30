'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ManagerCard from './ManagerCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import MarketSeasonMakeupWindow from './MarketSeasonMakeupWindow'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

const DANGER = '#dc2626'
const WARN_BG = '#fffbeb'
const WARN_BORDER = '#f59e0b'
const WARN_TEXT = '#92400e'

interface Season {
  id: string
  name: string
  start_date: string
  end_date: string
  declared_market_days: number | null
  refund_cap_days: number | null
  potential_makeup_days: number | null
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

/** Today as YYYY-MM-DD (local), for the "season has reached its end" check. */
function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Human range that tolerates a one-sided admin season (NULL = open-ended that side). */
function fmtRange(start: string | null, end: string | null): string {
  if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`
  if (start) return `from ${fmtDate(start)} (no end date set)`
  if (end) return `through ${fmtDate(end)} (no start date set)`
  return 'not set'
}

/**
 * True when the admin-set availability season (markets.season_start/end) and the
 * proposed pre-sale dates disagree. Only the admin date(s) that EXIST are
 * compared (a one-sided admin season is open-ended on the unset side). Returns
 * false when the admin hasn't set any season — nothing to reconcile.
 */
function datesOutOfSync(
  adminStart: string | null,
  adminEnd: string | null,
  start: string,
  end: string,
): boolean {
  if (!adminStart && !adminEnd) return false
  return (!!adminStart && adminStart !== start) || (!!adminEnd && adminEnd !== end)
}

/**
 * Shared notice: the admin availability season and the pre-sale dates differ.
 * The admin's season_start/end gate buyer ordering (get_available_pickup_dates
 * → validate_cart_item_schedule), so booth weeks sold outside it can't process
 * sales. Manager can't edit the admin dates — they must contact the admin.
 */
function SeasonSyncWarning({
  adminStart,
  adminEnd,
  yourStart,
  yourEnd,
}: {
  adminStart: string | null
  adminEnd: string | null
  yourStart: string
  yourEnd: string
}) {
  return (
    <div style={{
      backgroundColor: WARN_BG, border: `1px solid ${WARN_BORDER}`, borderRadius: radius.sm,
      padding: spacing.sm, fontSize: typography.sizes.sm, color: WARN_TEXT,
      display: 'flex', flexDirection: 'column', gap: spacing['2xs'],
    }}>
      <strong>⚠️ Season dates don&apos;t match — sync with your admin before renting booths.</strong>
      <div>
        This market&apos;s season on file (set by an admin) is <strong>{fmtRange(adminStart, adminEnd)}</strong>.
        You entered <strong>{fmtDate(yourStart)} – {fmtDate(yourEnd)}</strong>.
      </div>
      <div>
        <strong>Why this matters:</strong> the admin&apos;s dates control when buyers can place orders — the
        platform only processes product sales while the market is in season. If you pre-sell booth weeks
        that fall before or after the admin&apos;s season, your vendors will have booths on days when no
        orders can be placed and no sales go through — paying for a spot they can&apos;t sell from.
      </div>
      <div>
        <strong>Before renting any booths,</strong> contact your platform admin to align the dates. Include
        both ranges above in your message.
      </div>
    </div>
  )
}

/**
 * Inline editor for a season's make-up buffer (potential_makeup_days). Opt-in:
 * 0 or >= 2. Editable until the season ends (PATCH set_makeup_days).
 */
function MakeupBufferEditor({ marketId, season, onSaved }: { marketId: string; season: Season; onSaved: () => void }) {
  const current = String(season.potential_makeup_days ?? 0)
  const [val, setVal] = useState(current)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    const n = Number(val)
    if (!Number.isInteger(n) || (n !== 0 && n < 2)) { setErr('0 or 2+'); return }
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/seasons`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId: season.id, action: 'set_makeup_days', potential_makeup_days: n }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setErr(data.error || 'Failed')
      else onSaved()
    } catch {
      setErr('Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], fontSize: typography.sizes.xs, color: colors.textMuted }}>
      <span>Make-up buffer (0 or 2+):</span>
      <input
        type="number" min={0} value={val} onChange={(e) => setVal(e.target.value)}
        style={{
          width: 56, padding: `2px ${spacing['3xs']}`, border: `1px solid ${colors.border}`,
          borderRadius: radius.sm, fontSize: typography.sizes.xs, color: colors.textPrimary,
          backgroundColor: colors.surfaceElevated,
        }}
      />
      {val !== current && (
        <button type="button" onClick={save} disabled={busy} style={{
          padding: `2px ${spacing.xs}`, minHeight: 28, backgroundColor: colors.primary, color: '#fff',
          border: 'none', borderRadius: radius.sm, fontSize: typography.sizes.xs,
          cursor: busy ? 'wait' : 'pointer',
        }}>
          {busy ? '…' : 'Save'}
        </button>
      )}
      {err && <span style={{ color: '#721c24' }}>{err}</span>}
    </div>
  )
}

/**
 * Phase E — manager season pre-sale setup. Create a season (the system derives
 * the market-day count + a 10% refund cap), then open the pre-sale window
 * (allowed within 60 days of start; one open season per market at a time; auto-
 * closes 14 days after start). Vendors prepay a whole season in one checkout.
 *
 * adminSeasonStart/End are the market's admin-set availability season
 * (markets.season_start/end). They gate buyer ordering, so the card warns when
 * the pre-sale dates differ and requires an acknowledgment before opening
 * pre-sales out of sync (the manager can't edit the admin dates themselves).
 */
export default function MarketSeasonCard({
  marketId,
  adminSeasonStart = null,
  adminSeasonEnd = null,
  stripeChargesEnabled = true,
}: {
  marketId: string
  adminSeasonStart?: string | null
  adminSeasonEnd?: string | null
  /** markets.stripe_charges_enabled — booth rentals (weekly + season) can't be
   *  paid until this is true, so we warn the manager up front. */
  stripeChargesEnabled?: boolean
}) {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [makeupDays, setMakeupDays] = useState('0')
  const [creating, setCreating] = useState(false)
  const [needsScheduleConfirm, setNeedsScheduleConfirm] = useState(false)
  const [scheduleConfirmChecked, setScheduleConfirmChecked] = useState(false)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [endingId, setEndingId] = useState<string | null>(null)
  const [ackedSeasons, setAckedSeasons] = useState<Set<string>>(new Set())
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

  function toggleAck(id: string) {
    setAckedSeasons((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
          potential_makeup_days: Number(makeupDays) || 0,
          ...(scheduleConfirmChecked ? { scheduleConfirmed: true } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.needsScheduleConfirm) { setNeedsScheduleConfirm(true); setError(null) }
        else setError(data.error || 'Could not create the season.')
      } else {
        setName(''); setStartDate(''); setEndDate(''); setMakeupDays('0')
        setNeedsScheduleConfirm(false); setScheduleConfirmChecked(false)
        await load()
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setCreating(false)
    }
  }

  async function act(seasonId: string, action: 'open_prepay' | 'close_prepay' | 'end_season') {
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

  const createOutOfSync =
    !!startDate && !!endDate && datesOutOfSync(adminSeasonStart, adminSeasonEnd, startDate, endDate)

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

      {stripeChargesEnabled !== true && (
        <div style={{
          backgroundColor: WARN_BG, border: `1px solid ${WARN_BORDER}`, borderRadius: radius.sm,
          padding: spacing.sm, fontSize: typography.sizes.sm, color: WARN_TEXT, marginBottom: spacing.sm,
          display: 'flex', flexDirection: 'column', gap: spacing['2xs'],
        }}>
          <strong>⚠️ Payment setup incomplete — vendors can&apos;t book yet.</strong>
          <div>
            Your market&apos;s Stripe payment setup isn&apos;t finished, so booth rentals — single
            weeks and whole-season pre-sales — can&apos;t be paid for. You can set a season up now,
            but vendors won&apos;t be able to reserve until you finish Stripe in the
            &ldquo;Booth rental payments&rdquo; card above.
          </div>
        </div>
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
          {seasons.map((s) => {
            const outOfSync = datesOutOfSync(adminSeasonStart, adminSeasonEnd, s.start_date, s.end_date)
            const acked = ackedSeasons.has(s.id)
            const openBlocked = outOfSync && !acked
            const pastEnd = !!s.end_date && s.end_date <= todayStr()
            const isEnded = s.status === 'ended'
            const isSettled = s.status === 'settled'
            const canEnd = s.status === 'active' && pastEnd && !s.prepay_open
            return (
              <div key={s.id} style={{
                padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm,
                display: 'flex', flexDirection: 'column', gap: spacing.xs,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
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
                      {outOfSync && (
                        <span style={{
                          marginLeft: spacing['2xs'], padding: `0 ${spacing['2xs']}`, borderRadius: radius.full,
                          fontSize: typography.sizes.xs, fontWeight: typography.weights.medium,
                          backgroundColor: WARN_BG, color: WARN_TEXT, border: `1px solid ${WARN_BORDER}`,
                        }}>
                          Dates ≠ admin
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                      {fmtDate(s.start_date)} – {fmtDate(s.end_date)} · {s.declared_market_days ?? '?'} market days · cap {s.refund_cap_days ?? '?'} days · make-up buffer {s.potential_makeup_days ?? 0}
                      {s.prepay_open && s.prepay_closes_at ? ` · closes ${fmtDate(s.prepay_closes_at.slice(0, 10))}` : ''}
                    </div>
                  </div>
                  {isSettled ? (
                    <span style={{
                      padding: `${spacing['2xs']} ${spacing.sm}`, fontSize: typography.sizes.sm,
                      color: colors.textMuted, fontWeight: typography.weights.medium,
                    }}>
                      Settled
                    </span>
                  ) : isEnded ? (
                    <span style={{
                      padding: `0 ${spacing['2xs']}`, borderRadius: radius.full, fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.medium, backgroundColor: '#ecfdf5', color: '#065f46',
                      border: '1px solid #10b981',
                    }}>
                      Make-up window
                    </span>
                  ) : s.prepay_open ? (
                    <button onClick={() => act(s.id, 'close_prepay')} disabled={busyId === s.id} style={{
                      padding: `${spacing['2xs']} ${spacing.sm}`, backgroundColor: colors.surfaceBase,
                      color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radius.sm,
                      fontSize: typography.sizes.sm, cursor: busyId === s.id ? 'wait' : 'pointer',
                    }}>
                      {busyId === s.id ? '…' : 'Close pre-sales'}
                    </button>
                  ) : canEnd ? (
                    <button onClick={() => setEndingId(s.id)} disabled={busyId === s.id} style={{
                      padding: `${spacing['2xs']} ${spacing.sm}`, minHeight: 44, backgroundColor: colors.primary,
                      color: '#fff', border: 'none', borderRadius: radius.sm,
                      fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold,
                      cursor: busyId === s.id ? 'wait' : 'pointer',
                    }}>
                      {busyId === s.id ? '…' : 'End season & open make-up window'}
                    </button>
                  ) : (
                    <button onClick={() => act(s.id, 'open_prepay')} disabled={busyId === s.id || openBlocked} style={{
                      padding: `${spacing['2xs']} ${spacing.sm}`,
                      backgroundColor: openBlocked ? colors.surfaceBase : colors.primary,
                      color: openBlocked ? colors.textMuted : '#fff',
                      border: openBlocked ? `1px solid ${colors.border}` : 'none', borderRadius: radius.sm,
                      fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold,
                      cursor: busyId === s.id ? 'wait' : openBlocked ? 'not-allowed' : 'pointer',
                    }}>
                      {busyId === s.id ? '…' : 'Open pre-sales'}
                    </button>
                  )}
                </div>

                {outOfSync && (
                  <SeasonSyncWarning
                    adminStart={adminSeasonStart}
                    adminEnd={adminSeasonEnd}
                    yourStart={s.start_date}
                    yourEnd={s.end_date}
                  />
                )}
                {outOfSync && !s.prepay_open && (
                  <label style={{ display: 'flex', gap: spacing['2xs'], alignItems: 'flex-start', fontSize: typography.sizes.sm, color: colors.textPrimary }}>
                    <input type="checkbox" checked={acked} onChange={() => toggleAck(s.id)} style={{ marginTop: 3 }} />
                    <span>I understand the season dates don&apos;t match — I&apos;ve contacted my admin to align them before renting booths.</span>
                  </label>
                )}

                {!isEnded && !isSettled && (
                  <MakeupBufferEditor marketId={marketId} season={s} onSaved={load} />
                )}
                {isEnded && (
                  <MarketSeasonMakeupWindow marketId={marketId} seasonId={s.id} />
                )}
              </div>
            )
          })}
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

        <label style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
          <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
            Make-up days buffer (0, or 2+) — how many post-close make-up days your climate &amp; community could
            support if you have to cancel market days. Leave at 0 for none.
          </span>
          <input type="number" min={0} value={makeupDays} onChange={(e) => setMakeupDays(e.target.value)} style={inputStyle} />
        </label>

        {createOutOfSync && (
          <SeasonSyncWarning
            adminStart={adminSeasonStart}
            adminEnd={adminSeasonEnd}
            yourStart={startDate}
            yourEnd={endDate}
          />
        )}

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

      <ConfirmDialog
        open={!!endingId}
        title="End this season?"
        message="This closes the season. If no make-up days are owed it settles right away; otherwise the make-up window opens so you can schedule make-up dates and settle owed days in Season settlement. You can't reopen pre-sales for it afterward."
        confirmLabel="End season"
        cancelLabel="Cancel"
        onConfirm={async () => { const id = endingId; setEndingId(null); if (id) await act(id, 'end_season') }}
        onCancel={() => setEndingId(null)}
      />
    </ManagerCard>
  )
}
