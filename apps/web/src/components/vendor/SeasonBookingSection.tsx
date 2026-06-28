'use client'

import { useEffect, useRef, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { calculateBoothRentalFees } from '@/lib/pricing'

interface SeasonOpt {
  id: string
  name: string
  start_date: string
  end_date: string
  prepay_closes_at: string | null
  weekCount: number
}
interface InvOpt {
  id: string
  size_label: string
  dimensions: string | null
  weekly_price_cents: number
}

function fmtDate(d: string): string {
  const date = new Date(`${d}T00:00:00`) // local midnight — avoid DATE off-by-one
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Phase E — vendor season pre-sale picker. Renders next to the one-off booth
 * form, but only when the market has OPEN seasons. The vendor picks a season +
 * booth size and reserves the WHOLE season in one payment (partial-week
 * selection is a fast-follow — the backend already supports it). Totals are
 * computed client-side via calculateBoothRentalFees (per-week rounding).
 */
export default function SeasonBookingSection({ marketId }: { marketId: string }) {
  const [seasons, setSeasons] = useState<SeasonOpt[]>([])
  const [inventory, setInventory] = useState<InvOpt[]>([])
  const [loaded, setLoaded] = useState(false)
  const [seasonId, setSeasonId] = useState('')
  const [inventoryId, setInventoryId] = useState('')
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    void (async () => {
      try {
        const res = await fetch(`/api/vendor/markets/${marketId}/seasons`)
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          setSeasons((data.seasons ?? []) as SeasonOpt[])
          setInventory((data.inventory ?? []) as InvOpt[])
        }
      } catch {
        // Non-fatal: the section just won't render. The one-off form still works.
      } finally {
        setLoaded(true)
      }
    })()
  }, [marketId])

  // No open seasons → render nothing (don't clutter the booking page).
  if (!loaded || seasons.length === 0) return null

  const season = seasons.find((s) => s.id === seasonId)
  const inv = inventory.find((i) => i.id === inventoryId)
  const perWeekCents = inv ? calculateBoothRentalFees(inv.weekly_price_cents).vendorPaysCents : 0
  const totalCents = season ? perWeekCents * season.weekCount : 0

  async function reserve() {
    setError(null)
    if (!seasonId) { setError('Pick a season.'); return }
    if (!inventoryId) { setError('Pick a booth size.'); return }
    if (!agree) { setError('Accept the agreement to continue.'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/vendor/markets/${marketId}/book-season`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season_id: seasonId, inventory_id: inventoryId, agreement_accepted: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not start the booking.'); setSubmitting(false); return }
      if (data.checkout_url) { window.location.href = data.checkout_url as string; return }
      setError('Booking created but no checkout link came back — contact the manager.')
      setSubmitting(false)
    } catch {
      setError('Network error — please try again.')
      setSubmitting(false)
    }
  }

  const selectStyle = {
    padding: `${spacing['2xs']} ${spacing.xs}`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    width: '100%',
  } as const

  return (
    <section style={{
      marginTop: spacing.lg,
      padding: spacing.md,
      border: `2px solid ${colors.primary}`,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceElevated,
    }}>
      <h2 style={{ margin: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
        Reserve a whole season
      </h2>
      <p style={{ margin: 0, marginBottom: spacing.md, fontSize: typography.sizes.sm, color: colors.textMuted, lineHeight: 1.5 }}>
        Commit to a full season and lock your booth for every market week in one payment.
        {' '}
        <strong>Season payments are not refundable as cash through the platform.</strong> If you cancel,
        your payment becomes a booth credit at this market — full value before the season starts, or the
        remaining weeks minus a 25% fee after — usable only toward future booth bookings here and only
        through the end of the season. It is a credit, not a money-back refund.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, maxWidth: 460 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>Season</span>
          <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} style={selectStyle}>
            <option value="">Select a season…</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {fmtDate(s.start_date)} to {fmtDate(s.end_date)} ({s.weekCount} weeks)
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>Booth size</span>
          <select value={inventoryId} onChange={(e) => setInventoryId(e.target.value)} style={selectStyle}>
            <option value="">Select a booth size…</option>
            {inventory.map((i) => (
              <option key={i.id} value={i.id}>
                {i.size_label}{i.dimensions ? ` (${i.dimensions})` : ''} — {money(calculateBoothRentalFees(i.weekly_price_cents).vendorPaysCents)}/week
              </option>
            ))}
          </select>
        </label>

        {season && inv && (
          <div style={{ padding: spacing.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm }}>
            <div style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
              {season.weekCount} weeks × {money(perWeekCents)}
            </div>
            <div style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.primary }}>
              Season total: {money(totalCents)}
            </div>
          </div>
        )}

        <label style={{ display: 'flex', gap: spacing['2xs'], alignItems: 'flex-start', fontSize: typography.sizes.sm, color: colors.textPrimary }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I accept the market agreement and the season cancellation policy above.</span>
        </label>

        {error && <span style={{ fontSize: typography.sizes.sm, color: '#dc2626' }}>{error}</span>}

        <button onClick={reserve} disabled={submitting || !seasonId || !inventoryId || !agree} style={{
          alignSelf: 'flex-start', padding: `${spacing.xs} ${spacing.md}`,
          backgroundColor: (submitting || !seasonId || !inventoryId || !agree) ? colors.surfaceBase : colors.primary,
          color: (submitting || !seasonId || !inventoryId || !agree) ? colors.textMuted : '#fff',
          border: (submitting || !seasonId || !inventoryId || !agree) ? `1px solid ${colors.border}` : 'none',
          borderRadius: radius.sm, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold,
          cursor: submitting ? 'wait' : 'pointer',
        }}>
          {submitting ? 'Starting checkout…' : season && inv ? `Reserve season — ${money(totalCents)}` : 'Reserve season'}
        </button>
      </div>
    </section>
  )
}
