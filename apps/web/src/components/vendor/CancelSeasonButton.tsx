'use client'

import { useState } from 'react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { spacing, typography, radius } from '@/lib/design-tokens'

interface CancelSeasonButtonProps {
  groupId: string
}

/**
 * Vendor-facing "Cancel season" action for a PAID booth_booking_group.
 * Calls POST /api/vendor/booth-groups/[groupId]/cancel (credit-first, no Stripe).
 * The route computes the booth credit on the manager-held base basis (full
 * before the season starts; remaining weeks minus a 25% fee after) and returns
 * the granted amount, which we surface and keep on screen (no auto-refresh).
 */
export default function CancelSeasonButton({ groupId }: CancelSeasonButtonProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleConfirm = async () => {
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch(`/api/vendor/booth-groups/${groupId}/cancel`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setResult({ ok: false, message: data.error || 'Could not cancel this season.' })
        setSubmitting(false)
        return
      }
      const creditDollars = ((data.credit_cents as number) / 100).toFixed(2)
      setResult({ ok: true, message: `Season cancelled. A booth credit of $${creditDollars} (credit only — not a cash refund) was added toward a future booth booking at this market, usable until the season ends.` })
      setOpen(false)
      // Leave the confirmation visible (it replaces the button). The status badge
      // updates on the next page load — we intentionally do NOT auto-refresh, so
      // the credit amount stays on screen for the vendor to read.
    } catch {
      setResult({ ok: false, message: 'Something went wrong. Please try again.' })
      setSubmitting(false)
    }
  }

  if (result?.ok) {
    return (
      <div style={{
        fontSize: typography.sizes.xs,
        color: '#155724',
        backgroundColor: '#d4edda',
        padding: `${spacing['3xs']} ${spacing.xs}`,
        borderRadius: radius.sm,
      }}>
        {result.message}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={submitting}
        style={{
          padding: `${spacing['2xs']} ${spacing.sm}`,
          backgroundColor: 'transparent',
          color: '#dc2626',
          border: '1px solid #dc2626',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.6 : 1,
          minHeight: 44,
        }}
      >
        {submitting ? 'Cancelling…' : 'Cancel season'}
      </button>
      {result && !result.ok && (
        <div style={{
          marginTop: spacing['3xs'],
          fontSize: typography.sizes.xs,
          color: '#721c24',
        }}>
          {result.message}
        </div>
      )}
      <ConfirmDialog
        open={open}
        variant="danger"
        title="Cancel this season?"
        message={
          'Cancelling does NOT refund money to your card — there is no monetary refund through the platform. You will receive a booth credit instead: the full value if the season has not started, or the remaining weeks minus a 25% cancellation fee if it has. The credit has no cash value, can only be applied to future booth bookings at this market, and must be used before the season ends. This frees your booth for the manager to re-rent and cannot be undone.'
        }
        confirmLabel="Cancel season"
        cancelLabel="Keep booking"
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </div>
  )
}
