'use client'

import { useEffect, useState } from 'react'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

/**
 * Admin: Event Vendor Fee payments for one event, with manual refund
 * (refund-matrix completion, 2026-08-16).
 *
 * Renders in the admin event detail panel (its own Section). Lists every
 * fee-payment row — the automatic paths (cancel bands, waiver, deselection,
 * event death, race loser) cover the normal cases; the Refund button here is
 * the support-case override for whatever they don't. Refunds are full, with
 * transfer reversal (the organizer's portion comes back first), allowed on
 * paid AND forfeited rows (admins outlive the organizer's 14-day waive
 * window). ConfirmDialog, not window.confirm — mobile blocks native dialogs.
 */

interface FeePaymentRow {
  payment_id: string
  vendor_name: string
  status: string
  vendor_pays_cents: number
  organizer_receives_cents: number
  paid_at: string | null
  refunded_at: string | null
  refund_reason: string | null
  forfeited_at: string | null
  cancel_reason: string | null
  covered: boolean
  refundable: boolean
}

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Checkout open',
  paid: 'Paid',
  refunded: 'Refunded',
  released: 'Released',
  forfeited: 'Forfeited',
  covered: 'Covered (step-in)',
}

export default function AdminEventFeePayments({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<FeePaymentRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refunding, setRefunding] = useState<string | null>(null)
  const [confirmFor, setConfirmFor] = useState<FeePaymentRow | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // set-state-in-effect rule: no synchronous setState in an effect body —
    // the reset (for eventId changes) rides a microtask (repo convention).
    queueMicrotask(() => { if (!cancelled) setLoading(true) })
    fetch(`/api/admin/events/${eventId}/fee-payments`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: { payments: FeePaymentRow[] } | null) => {
        if (cancelled) return
        setRows(data?.payments ?? null)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [eventId])

  async function refund(row: FeePaymentRow) {
    setConfirmFor(null)
    setRefunding(row.payment_id)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/fee-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: row.payment_id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setRows(prev => (prev || []).map(r =>
          r.payment_id === row.payment_id
            ? { ...r, status: 'refunded', refundable: false, refund_reason: 'admin_manual' }
            : r
        ))
        setMessage(`Refunded ${row.vendor_name} in full — vendor notified.`)
      } else {
        setMessage(data.error || 'Refund failed.')
      }
    } catch {
      setMessage('Network error — please try again.')
    }
    setRefunding(null)
  }

  if (loading) {
    return <p style={{ margin: 0, fontSize: typography.sizes.sm, color: statusColors.neutral500 }}>Loading…</p>
  }
  if (!rows || rows.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: typography.sizes.sm, color: statusColors.neutral500 }}>
        No Event Vendor Fee payments for this event yet.
      </p>
    )
  }

  return (
    <div style={{ fontSize: typography.sizes.sm }}>
      {rows.map(r => (
        <div key={r.payment_id} style={{
          display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap',
          padding: `${spacing['2xs']} 0`,
          borderBottom: `1px solid ${statusColors.neutral200}`,
        }}>
          <span style={{ fontWeight: typography.weights.semibold }}>{r.vendor_name}</span>
          <span style={{
            padding: `0 ${spacing['3xs']}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
            backgroundColor: r.status === 'paid' || r.status === 'covered' ? statusColors.successLight
              : r.status === 'forfeited' ? statusColors.warningLight
              : statusColors.neutral100,
            color: r.status === 'paid' || r.status === 'covered' ? statusColors.successDark
              : r.status === 'forfeited' ? statusColors.warningDark
              : statusColors.neutral600,
          }}>
            {STATUS_LABELS[r.status] || r.status}
          </span>
          <span style={{ color: statusColors.neutral600, fontSize: typography.sizes.xs }}>
            ${(r.vendor_pays_cents / 100).toFixed(2)} paid · ${(r.organizer_receives_cents / 100).toFixed(2)} to organizer
            {r.refund_reason ? ` · refund: ${r.refund_reason}` : ''}
            {r.status === 'forfeited' && r.cancel_reason ? ` · "${r.cancel_reason}"` : ''}
          </span>
          {r.refundable && (
            <button
              onClick={() => setConfirmFor(r)}
              disabled={refunding !== null}
              style={{
                marginLeft: 'auto',
                padding: `${spacing['3xs']} ${spacing.sm}`,
                backgroundColor: 'transparent',
                color: statusColors.dangerDark,
                border: `1px solid ${statusColors.dangerBorder}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                cursor: refunding ? 'not-allowed' : 'pointer',
                opacity: refunding === r.payment_id ? 0.7 : 1,
              }}
            >
              {refunding === r.payment_id ? 'Refunding…' : 'Refund'}
            </button>
          )}
        </div>
      ))}
      {message && (
        <p style={{
          margin: `${spacing['2xs']} 0 0`,
          fontSize: typography.sizes.xs,
          color: message.startsWith('Refunded') ? statusColors.successDark : statusColors.warningDark,
        }}>
          {message}
        </p>
      )}
      <ConfirmDialog
        open={confirmFor !== null}
        title="Refund this Event Vendor Fee?"
        message={confirmFor
          ? `${confirmFor.vendor_name} gets $${(confirmFor.vendor_pays_cents / 100).toFixed(2)} back in full. The organizer's portion ($${(confirmFor.organizer_receives_cents / 100).toFixed(2)}) is pulled back from their payout account first.${confirmFor.status === 'forfeited' ? ' This overrides a forfeit — the organizer was keeping this money.' : ''}`
          : ''}
        confirmLabel="Refund in full"
        variant="danger"
        onConfirm={() => { if (confirmFor) void refund(confirmFor) }}
        onCancel={() => setConfirmFor(null)}
      />
    </div>
  )
}
