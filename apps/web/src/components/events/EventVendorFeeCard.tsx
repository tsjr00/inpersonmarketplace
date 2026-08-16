'use client'

import { useEffect, useState } from 'react'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'

/**
 * Event Vendor Fee — organizer card (V1, decisions.md 2026-08-14).
 *
 * The organizer sets a flat per-event fee vendors pay for a spot. Setting a
 * non-zero fee requires a payout account (decision 8b, lazy Connect): the PUT
 * answers `connect_required` and this card walks them into Stripe onboarding
 * right there — you cannot finish setting a fee with nowhere for the money to
 * land. Free events never see any of that.
 *
 * Renders on the event-manager dashboard only (organizer auth lives in the
 * two routes this calls). Amounts are entered in dollars, stored in cents.
 * A fee change affects only vendors who haven't paid yet — paid rows snapshot
 * their amounts — and the card says so.
 */

interface FeeState {
  fee_cents: number | null
  approved: boolean
  payout: { connected: boolean; onboardingComplete: boolean }
  /** Accounts the organizer already finished onboarding elsewhere (vendor
      account / prior event) — offered as one-click reuse, owner decision
      2026-08-15. Labels only; the server holds the account ids. */
  reuse_options?: Array<{ source: string; label: string }>
}

/** Backup bench Phase 3 (2026-08-16): a vendor who cancelled inside 72h and
    forfeited their fee. The organizer may waive (= refund) each one until
    event date + 14 days. */
interface ForfeitRow {
  payment_id: string
  vendor_name: string
  amount_cents: number
  cancel_reason: string | null
  forfeited_at: string | null
}

export default function EventVendorFeeCard({
  eventRef,
  primaryColor,
}: {
  eventRef: string
  primaryColor: string
}) {
  const [state, setState] = useState<FeeState | null>(null)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [needsConnect, setNeedsConnect] = useState(false)
  const [forfeits, setForfeits] = useState<ForfeitRow[]>([])
  const [waivable, setWaivable] = useState(false)
  const [waivingId, setWaivingId] = useState<string | null>(null)
  const [waiveMessage, setWaiveMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/events/${eventRef}/vendor-fee`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: FeeState | null) => {
        if (cancelled) return
        if (data) {
          setState(data)
          setInput(data.fee_cents ? (data.fee_cents / 100).toFixed(2) : '')
          // Surface the payout requirement before they type, not after.
          setNeedsConnect(!data.payout.onboardingComplete)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
    fetch(`/api/events/${eventRef}/fee-waiver`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: { waivable: boolean; forfeits: ForfeitRow[] } | null) => {
        if (cancelled || !data) return
        setForfeits(data.forfeits || [])
        setWaivable(data.waivable === true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [eventRef])

  async function waive(paymentId: string) {
    if (waivingId) return
    setWaivingId(paymentId)
    setWaiveMessage(null)
    try {
      const res = await fetch(`/api/events/${eventRef}/fee-waiver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setForfeits(prev => prev.filter(f => f.payment_id !== paymentId))
        setWaiveMessage('Waived — the vendor is being refunded in full.')
      } else {
        setWaiveMessage(data.error || 'Could not waive that forfeit.')
      }
    } catch {
      setWaiveMessage('Network error — please try again.')
    }
    setWaivingId(null)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setMessage(null)
    const dollars = input.trim() === '' ? null : Number(input)
    if (dollars !== null && (Number.isNaN(dollars) || dollars < 0)) {
      setMessage('Enter a dollar amount, or leave blank for no fee.')
      setSaving(false)
      return
    }
    const feeCents = dollars === null ? null : Math.round(dollars * 100)
    try {
      const res = await fetch(`/api/events/${eventRef}/vendor-fee`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fee_cents: feeCents }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setState(prev => (prev ? { ...prev, fee_cents: data.fee_cents } : prev))
        setMessage(data.fee_cents ? 'Fee saved.' : 'Fee cleared — vendors join free.')
        setNeedsConnect(false)
      } else if (data.connect_required) {
        setNeedsConnect(true)
        setMessage(data.error || 'Connect a payout account first.')
      } else {
        setMessage(data.error || 'Could not save the fee.')
      }
    } catch {
      setMessage('Network error — please try again.')
    }
    setSaving(false)
  }

  async function startConnect() {
    if (connecting) return
    setConnecting(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/events/${eventRef}/stripe/onboard`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      setMessage(data.error || 'Could not start payout setup.')
    } catch {
      setMessage('Network error — please try again.')
    }
    setConnecting(false)
  }

  async function reuseAccount(source: string) {
    if (connecting) return
    setConnecting(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/events/${eventRef}/stripe/reuse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setState(prev => (prev ? { ...prev, payout: { connected: true, onboardingComplete: true }, reuse_options: [] } : prev))
        setNeedsConnect(false)
        setMessage('Payout account connected — now set your fee.')
      } else {
        setMessage(data.error || 'Could not connect that account.')
      }
    } catch {
      setMessage('Network error — please try again.')
    }
    setConnecting(false)
  }

  if (loading) {
    return <p style={{ margin: 0, fontSize: typography.sizes.sm, color: statusColors.neutral500 }}>Loading…</p>
  }
  if (!state) {
    return <p style={{ margin: 0, fontSize: typography.sizes.sm, color: statusColors.neutral500 }}>Could not load fee settings.</p>
  }
  if (!state.approved) {
    return (
      <p style={{ margin: 0, fontSize: typography.sizes.sm, color: statusColors.neutral500 }}>
        Once your event is approved, you can charge vendors a fee for their spot. It will appear
        in their invitation before they accept.
      </p>
    )
  }

  return (
    <div style={{ fontSize: typography.sizes.sm }}>
      <p style={{ margin: `0 0 ${spacing.xs}`, color: statusColors.neutral600, lineHeight: 1.5 }}>
        Charge {`vendors`} a one-time fee for their spot at this event. The fee is shown in every
        invitation before they accept, and a spot is theirs once they pay. Leave blank for a free
        event. Changing the fee later only affects vendors who haven&apos;t paid yet.
      </p>

      {needsConnect && (
        <div style={{
          marginBottom: spacing.xs,
          padding: spacing.xs,
          backgroundColor: statusColors.warningLight,
          border: `1px solid ${statusColors.warningBorder}`,
          borderRadius: radius.md,
          color: statusColors.warningDark,
        }}>
          <p style={{ margin: `0 0 ${spacing['2xs']}` }}>
            <strong>First, set up where your money goes.</strong> Fees are paid straight to you —
            a one-time form connects your bank account (via Stripe). Takes a few minutes; you can
            come back and finish any time from this button.
          </p>
          {/* Payout-account reuse (owner decision 2026-08-15): offered as a
              choice, never automatic — the same person isn't always the same
              business. Buttons carry the account's business/event name so the
              organizer knows exactly where the money would go. */}
          {(state.reuse_options?.length ?? 0) > 0 && (
            <>
              <p style={{ margin: `0 0 ${spacing['2xs']}` }}>
                You&apos;ve set up payouts with us before. If your prior payout account is still
                active, it&apos;s easiest to use the same account — or set up a separate one below.
              </p>
              {/* Owner styling 2026-08-15: transparent over the yellow box with
                  a primary-color outline (solid primary read as an error
                  banner), natural width, side-by-side on desktop and wrapping
                  to stacked on mobile. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing['2xs'], marginBottom: spacing['2xs'] }}>
                {state.reuse_options?.map(opt => (
                  <button
                    key={opt.source}
                    onClick={() => void reuseAccount(opt.source)}
                    disabled={connecting}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.sm}`,
                      backgroundColor: 'transparent',
                      color: primaryColor,
                      border: `1px solid ${primaryColor}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      cursor: connecting ? 'not-allowed' : 'pointer',
                      opacity: connecting ? 0.7 : 1,
                      textAlign: 'left',
                    }}
                  >
                    {opt.source === 'vendor'
                      ? `Use your existing vendor payout account (${opt.label})`
                      : `Use the payout account from ${opt.label}`}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            onClick={() => void startConnect()}
            disabled={connecting}
            style={{
              padding: `${spacing['3xs']} ${spacing.sm}`,
              backgroundColor: (state.reuse_options?.length ?? 0) > 0 ? 'transparent' : primaryColor,
              color: (state.reuse_options?.length ?? 0) > 0 ? statusColors.warningDark : 'white',
              border: (state.reuse_options?.length ?? 0) > 0 ? `1px solid ${statusColors.warningBorder}` : 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              cursor: connecting ? 'not-allowed' : 'pointer',
              opacity: connecting ? 0.7 : 1,
            }}
          >
            {connecting
              ? 'Opening…'
              : (state.reuse_options?.length ?? 0) > 0
                ? 'Set up a separate account'
                : state.payout.connected ? 'Finish payout setup' : 'Set up payouts'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
        <label style={{ fontWeight: typography.weights.semibold, color: statusColors.neutral700 }}>
          Event Vendor Fee $
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            width: 110,
            padding: `${spacing['3xs']} ${spacing.xs}`,
            border: `1px solid ${statusColors.neutral300}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
          }}
        />
        <button
          onClick={() => void save()}
          disabled={saving}
          style={{
            padding: `${spacing['3xs']} ${spacing.sm}`,
            backgroundColor: primaryColor,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {state.fee_cents ? (
          <span style={{ color: statusColors.neutral500, fontSize: typography.sizes.xs }}>
            Current: ${(state.fee_cents / 100).toFixed(2)} per vendor
          </span>
        ) : (
          <span style={{ color: statusColors.neutral500, fontSize: typography.sizes.xs }}>
            No fee — vendors join free
          </span>
        )}
      </div>

      {message && (
        <p style={{
          margin: `${spacing['2xs']} 0 0`,
          fontSize: typography.sizes.xs,
          color: message.startsWith('Fee') || message.startsWith('Payout account connected') ? statusColors.successDark : statusColors.warningDark,
        }}>
          {message}
        </p>
      )}

      {/* Forfeited fees + waiver lever (Backup bench Phase 3, 2026-08-16).
          Forfeits happen when a vendor cancels inside 72h; the money stays
          with the organizer by default and covers a replacement's spot. The
          waive warning copy is owner-required, verbatim. */}
      {forfeits.length > 0 && (
        <div style={{
          marginTop: spacing.sm,
          padding: spacing.xs,
          backgroundColor: statusColors.warningLight,
          border: `1px solid ${statusColors.warningBorder}`,
          borderRadius: radius.md,
          color: statusColors.warningDark,
        }}>
          <p style={{ margin: `0 0 ${spacing['2xs']}`, fontWeight: typography.weights.semibold }}>
            Forfeited vendor fees
          </p>
          <p style={{ margin: `0 0 ${spacing['2xs']}`, fontSize: typography.sizes.xs, lineHeight: 1.5 }}>
            These vendors cancelled inside the 72-hour window and forfeited their fee. The money
            stays with you by default. If you feel the circumstances warrant it, you can waive a
            forfeit and refund the vendor in full — but note: waiving refunds the fee that
            currently covers your replacement vendor&apos;s spot.
            {!waivable && ' The waive window (14 days after your event) has closed.'}
          </p>
          {forfeits.map(f => (
            <div key={f.payment_id} style={{
              display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap',
              padding: `${spacing['3xs']} 0`,
            }}>
              <span style={{ fontSize: typography.sizes.xs }}>
                <strong>{f.vendor_name}</strong> — ${(f.amount_cents / 100).toFixed(2)}
                {f.cancel_reason ? ` · "${f.cancel_reason}"` : ''}
              </span>
              {waivable && (
                <button
                  onClick={() => void waive(f.payment_id)}
                  disabled={waivingId !== null}
                  style={{
                    padding: `${spacing['3xs']} ${spacing.sm}`,
                    backgroundColor: 'transparent',
                    color: primaryColor,
                    border: `1px solid ${primaryColor}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.semibold,
                    cursor: waivingId ? 'not-allowed' : 'pointer',
                    opacity: waivingId === f.payment_id ? 0.7 : 1,
                  }}
                >
                  {waivingId === f.payment_id ? 'Refunding…' : 'Waive & refund'}
                </button>
              )}
            </div>
          ))}
          {waiveMessage && (
            <p style={{
              margin: `${spacing['2xs']} 0 0`,
              fontSize: typography.sizes.xs,
              color: waiveMessage.startsWith('Waived') ? statusColors.successDark : statusColors.warningDark,
            }}>
              {waiveMessage}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
