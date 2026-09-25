'use client'

import { useState } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * "Continue payment" for a pending one-off booth week (OB-030 D1). Asks
 * POST /api/vendor/booth-rentals/[rentalId]/resume what Stripe says:
 *   open page → go straight back to it (the SAME session — never a new one)
 *   paid      → "Payment received — confirming"
 *   expired   → the unpaid booking is released; offer to book the week again
 * Used on the booking page (after stepping away, or when the week is already
 * pending) and on the vendor's Bookings page.
 */
export default function ContinueBoothPaymentButton({
  rentalId,
  vertical,
  marketId,
}: {
  rentalId: string
  vertical: string
  marketId: string
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [released, setReleased] = useState(false)

  async function go() {
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch(`/api/vendor/booth-rentals/${rentalId}/resume`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNote({ tone: 'warn', text: data.error || 'Could not continue the payment. Please try again.' })
      } else if (data.state === 'resume' && typeof data.checkout_url === 'string') {
        window.location.href = data.checkout_url
        return
      } else if (data.state === 'confirming' || data.state === 'paid') {
        setNote({ tone: 'ok', text: 'Payment received — we are confirming your booth week. Refresh in a minute to see it as paid.' })
      } else if (data.state === 'released') {
        setReleased(true)
        setNote({ tone: 'ok', text: 'That payment page had expired, so the unpaid booking was released. You can book the week again now.' })
      }
    } catch {
      setNote({ tone: 'warn', text: 'Network error — please try again.' })
    }
    setBusy(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'], alignItems: 'flex-start' }}>
      {released ? (
        <Link
          href={`/${vertical}/markets/${marketId}/book`}
          style={{ padding: `${spacing['2xs']} ${spacing.sm}`, backgroundColor: colors.primary, color: 'white', borderRadius: radius.sm, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textDecoration: 'none' }}
        >
          Book the week again
        </Link>
      ) : (
        <button
          type="button"
          onClick={go}
          disabled={busy}
          style={{ padding: `${spacing['2xs']} ${spacing.sm}`, backgroundColor: colors.primary, color: 'white', border: 'none', borderRadius: radius.sm, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Checking…' : 'Continue payment'}
        </button>
      )}
      {note && (
        <span style={{ fontSize: typography.sizes.xs, color: note.tone === 'ok' ? '#166534' : '#991b1b', lineHeight: 1.4 }}>
          {note.text}
        </span>
      )}
    </div>
  )
}
