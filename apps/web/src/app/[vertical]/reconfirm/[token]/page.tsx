'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'

/**
 * B3 — "Are you still coming?" (owner spec 2026-08-08; mig 230).
 *
 * The one-click landing for the re-confirmation link. Token-based, no login —
 * every lost yes is a refund we eat plus a vendor who already cooked.
 *
 * ⚠ Arrival NEVER confirms (mail scanners follow links — the mig-218 lesson).
 * The page shows the event's CURRENT details and one button; only the button's
 * POST confirms.
 */

interface ReconfirmState {
  state: 'awaiting' | 'confirmed' | 'refunded' | 'not_required' | 'cancelled'
  order_number: string | null
  vertical?: string
  event: {
    name: string
    address: string | null
    city: string | null
    state: string | null
    event_date?: string
    event_start_time?: string
    event_end_time?: string
    event_token?: string | null
  } | null
  // ST-20 (2026-08-29): live vs cancelled items, so the copy can tell a
  // withdrawal apart from "still stands".
  items?: { total: number; live: number; cancelled: number; cancelled_by_vendor: boolean }
}

export default function ReconfirmPage() {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [data, setData] = useState<ReconfirmState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/orders/reconfirm/${token}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: ReconfirmState | null) => {
        if (cancelled) return
        if (!d) setNotFound(true)
        else setData(d)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) { setNotFound(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [token])

  async function confirm() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/reconfirm/${token}`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setConfirmed(true)
      else setError(d.error || 'Could not save your confirmation — please try again.')
    } catch {
      setError('Network error — please try again.')
    }
    setSubmitting(false)
  }

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: spacing.md }}>
      <div style={{ maxWidth: 480, width: '100%', backgroundColor: 'white', border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.lg, padding: spacing.lg, textAlign: 'center' }}>
        {children}
      </div>
    </div>
  )

  if (loading) return shell(<p style={{ color: statusColors.neutral500, margin: 0 }}>Loading…</p>)

  if (notFound || !data) {
    return shell(
      <>
        <h1 style={{ fontSize: typography.sizes.xl, color: statusColors.neutral900, margin: `0 0 ${spacing.xs}` }}>Link not found</h1>
        <p style={{ color: statusColors.neutral600, margin: 0, lineHeight: 1.6 }}>
          This confirmation link isn&apos;t valid. If you got here from an email about your order, check your latest email — a newer link may have replaced this one.
        </p>
      </>
    )
  }

  if (data.state === 'refunded') {
    return shell(
      <>
        <div style={{ fontSize: '3rem', marginBottom: spacing.sm }}>💸</div>
        <h1 style={{ fontSize: typography.sizes.xl, color: statusColors.neutral900, margin: `0 0 ${spacing.xs}` }}>Your order was refunded</h1>
        <p style={{ color: statusColors.neutral600, margin: 0, lineHeight: 1.6 }}>
          Too much time passed without a confirmation, so {data.order_number ? `order ${data.order_number}` : 'your order'} was refunded in full. The money is on its way back to your card.
        </p>
      </>
    )
  }

  if (data.state === 'cancelled') {
    const byVendor = data.items?.cancelled_by_vendor
    const eventHref = data.vertical && data.event?.event_token ? `/${data.vertical}/events/${data.event.event_token}` : null
    return shell(
      <>
        <div style={{ fontSize: '3rem', marginBottom: spacing.sm }}>🚫</div>
        <h1 style={{ fontSize: typography.sizes.xl, color: statusColors.neutral900, margin: `0 0 ${spacing.xs}` }}>
          {byVendor ? 'The vendor withdrew from this event' : 'Your order was cancelled'}
        </h1>
        <p style={{ color: statusColors.neutral600, margin: `0 0 ${spacing.sm}`, lineHeight: 1.6 }}>
          {byVendor
            ? `${data.order_number ? `Order ${data.order_number}` : 'Your order'} was cancelled because the vendor you ordered from is no longer attending. You have been refunded in full — nothing to confirm.`
            : `${data.order_number ? `Order ${data.order_number}` : 'Your order'} was cancelled and refunded in full — nothing to confirm.`}
        </p>
        {eventHref && (
          <p style={{ color: statusColors.neutral600, margin: 0, lineHeight: 1.6 }}>
            Other vendors may still be there — <a href={eventHref} style={{ color: statusColors.info }}>see who&apos;s attending and order again</a>.
          </p>
        )}
      </>
    )
  }

  if (confirmed || data.state === 'confirmed') {
    return shell(
      <>
        <div style={{ fontSize: '3rem', marginBottom: spacing.sm }}>🎉</div>
        <h1 style={{ fontSize: typography.sizes.xl, color: statusColors.neutral900, margin: `0 0 ${spacing.xs}` }}>You&apos;re confirmed!</h1>
        <p style={{ color: statusColors.neutral600, margin: 0, lineHeight: 1.6 }}>
          {data.order_number ? `Order ${data.order_number}` : 'Your order'} stands — see you at {data.event?.name || 'the event'}{data.event?.event_date ? ` on ${data.event.event_date}` : ''}.
        </p>
      </>
    )
  }

  if (data.state === 'not_required') {
    return shell(
      <>
        <h1 style={{ fontSize: typography.sizes.xl, color: statusColors.neutral900, margin: `0 0 ${spacing.xs}` }}>Nothing to confirm</h1>
        <p style={{ color: statusColors.neutral600, margin: 0, lineHeight: 1.6 }}>
          {data.order_number ? `Order ${data.order_number}` : 'Your order'} doesn&apos;t need a confirmation right now.
        </p>
      </>
    )
  }

  return shell(
    <>
      <h1 style={{ fontSize: typography.sizes.xl, color: statusColors.neutral900, margin: `0 0 ${spacing.xs}` }}>
        The event changed — are you still coming?
      </h1>
      {/* ST-20: honest about what "stands" means — the vendors and offerings
          may have changed since the order was placed; a withdrawn vendor's
          items are already cancelled and refunded. */}
      {data.items && data.items.cancelled > 0 && data.items.live > 0 && (
        <div style={{ textAlign: 'left', backgroundColor: statusColors.warningLight, border: `1px solid ${statusColors.warningBorder}`, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm, color: statusColors.warningDark, fontSize: typography.sizes.sm, lineHeight: 1.5 }}>
          <strong>Part of this order was cancelled</strong> — {data.items.cancelled} of {data.items.total} item{data.items.total === 1 ? '' : 's'}{data.items.cancelled_by_vendor ? ' because that vendor withdrew from the event' : ''}. Those items were refunded. The rest is what you&apos;re confirming below.
        </div>
      )}
      <p style={{ color: statusColors.neutral600, margin: `0 0 ${spacing.md}`, lineHeight: 1.6 }}>
        {data.order_number ? `Your pre-order (${data.order_number})` : 'Your pre-order'} stands as of now — confirm that the new details work for you. Vendors and offerings can change before the event
        {data.vertical && data.event?.event_token ? (
          <> — <a href={`/${data.vertical}/events/${data.event.event_token}`} style={{ color: statusColors.info }}>check who&apos;s attending</a>.</>
        ) : '.'}
        {' '}If nobody confirms an order, it&apos;s refunded before the event so vendors don&apos;t cook for no one.
      </p>

      {data.event && (
        <div style={{ textAlign: 'left', backgroundColor: statusColors.neutral50, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md }}>
          <div style={{ fontWeight: typography.weights.semibold, color: statusColors.neutral900, marginBottom: spacing['3xs'] }}>{data.event.name}</div>
          {data.event.event_date && (
            <div style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700 }}>
              {data.event.event_date}
              {data.event.event_start_time ? ` · ${String(data.event.event_start_time).slice(0, 5)}` : ''}
              {data.event.event_end_time ? `–${String(data.event.event_end_time).slice(0, 5)}` : ''}
            </div>
          )}
          {(data.event.address || data.event.city) && (
            <div style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700 }}>
              {[data.event.address, data.event.city, data.event.state].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => void confirm()}
        disabled={submitting}
        style={{
          width: '100%',
          padding: spacing.sm,
          backgroundColor: submitting ? statusColors.neutral300 : '#059669',
          color: 'white',
          border: 'none',
          borderRadius: radius.lg,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.bold,
          cursor: submitting ? 'not-allowed' : 'pointer',
          minHeight: 52,
        }}
      >
        {submitting ? 'Confirming…' : "Yes, I'm still coming"}
      </button>

      {error && (
        <p style={{ marginTop: spacing.xs, fontSize: typography.sizes.sm, color: statusColors.dangerDark }}>{error}</p>
      )}
    </>
  )
}
