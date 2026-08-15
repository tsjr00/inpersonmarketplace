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
    return () => { cancelled = true }
  }, [eventRef])

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
          <button
            onClick={() => void startConnect()}
            disabled={connecting}
            style={{
              padding: `${spacing['3xs']} ${spacing.sm}`,
              backgroundColor: primaryColor,
              color: 'white',
              border: 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              cursor: connecting ? 'not-allowed' : 'pointer',
              opacity: connecting ? 0.7 : 1,
            }}
          >
            {connecting ? 'Opening…' : state.payout.connected ? 'Finish payout setup' : 'Set up payouts'}
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
          color: message.startsWith('Fee') ? statusColors.successDark : statusColors.warningDark,
        }}>
          {message}
        </p>
      )}
    </div>
  )
}
