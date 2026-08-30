'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import type { MissingDetail } from '@/lib/events/invitation-gate'

/**
 * Invitation gate card (mig 239, owner 2026-08-29) — Organizer Event Dashboard.
 *
 * Self-service events no longer invite vendors at intake. This card shows the
 * organizer what vendors need answered before invitations go out, and the
 * "Send invitations" button becomes actionable the moment the list is empty
 * (owner: "once the items are answered the Send invitations button should be
 * actionable"). The list is computed server-side by
 * lib/events/invitation-gate.ts from the same row the dashboard renders.
 *
 * After release it collapses to a one-line receipt; "Refresh matches" in the
 * details editor takes over from there.
 */
interface InvitationGateCardProps {
  eventRef: string
  vertical: string
  missing: MissingDetail[]
  releasedAt: string | null
  /** Approved = has a market. Pre-approval the card only explains itself. */
  approved: boolean
  primaryColor: string
}

const GROUP_HINT: Record<MissingDetail['group'], string> = {
  fee: 'Event Vendor Fee card below',
  budget: 'Add or edit details → Budget',
  context: 'Add or edit details → Event Context',
  logistics: 'Add or edit details → Logistics',
}

export default function InvitationGateCard({ eventRef, vertical, missing, releasedAt, approved, primaryColor }: InvitationGateCardProps) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const vendorWord = vertical === 'farmers_market' ? 'vendors' : 'food trucks'

  if (releasedAt) {
    const when = new Date(releasedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return (
      <p style={{ margin: 0, fontSize: typography.sizes.sm, color: statusColors.neutral600 }}>
        ✅ Invitations went out on <strong>{when}</strong>. {vendorWord[0].toUpperCase() + vendorWord.slice(1)} usually respond within 48 hours.
        Add details later and use <strong>Refresh matches</strong> in the editor below to reach any newly eligible {vendorWord}.
      </p>
    )
  }

  const ready = approved && missing.length === 0

  async function send() {
    if (sending || !ready) return
    setSending(true)
    setResult(null)
    try {
      const res = await fetch(`/api/events/${eventRef}/release-invitations`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult({ ok: true, text: data.invited > 0 ? `Invitations sent to ${data.invited} ${data.invited === 1 ? vendorWord.replace(/s$/, '') : vendorWord}.` : (data.message || 'Invitations released — no matching vendors right now; widen your criteria to reach more.') })
        router.refresh()
      } else {
        setResult({ ok: false, text: data.error || 'Could not send invitations.' })
      }
    } catch {
      setResult({ ok: false, text: 'Network error — please try again.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <p style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.sm, color: statusColors.neutral700, lineHeight: 1.5 }}>
        {vendorWord[0].toUpperCase() + vendorWord.slice(1)} decide whether to come based on what you tell them here — price, budget, what else is at the venue, and anything that might make them think twice.
        {' '}Invitations go out when you click <strong>Send invitations</strong>; the button unlocks once everything below is answered.
      </p>
      {!approved && (
        <p style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.xs, color: statusColors.warningDark }}>
          Your event needs an address and approval first — see the note at the top of this page.
        </p>
      )}
      {missing.length > 0 ? (
        <ul style={{ margin: `0 0 ${spacing.sm}`, paddingLeft: 20, fontSize: typography.sizes.sm, color: statusColors.neutral800, lineHeight: 1.7 }}>
          {missing.map(m => (
            <li key={m.key}>
              {m.label}
              <span style={{ color: statusColors.neutral500, fontSize: typography.sizes.xs }}> — {GROUP_HINT[m.group]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.sm, color: statusColors.successDark, fontWeight: typography.weights.semibold }}>
          Everything {vendorWord} need is answered.
        </p>
      )}
      <button
        type="button"
        onClick={() => void send()}
        disabled={!ready || sending}
        style={{
          padding: `${spacing.xs} ${spacing.md}`,
          backgroundColor: ready ? primaryColor : statusColors.neutral300,
          color: 'white',
          border: 'none',
          borderRadius: radius.md,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          cursor: ready && !sending ? 'pointer' : 'not-allowed',
        }}
      >
        {sending ? 'Sending…' : 'Send invitations'}
      </button>
      {!ready && approved && (
        <span style={{ marginLeft: spacing.xs, fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>
          {missing.length} item{missing.length === 1 ? '' : 's'} left
        </span>
      )}
      {result && (
        <p style={{ margin: `${spacing.xs} 0 0`, fontSize: typography.sizes.sm, color: result.ok ? statusColors.successDark : statusColors.dangerDark }}>
          {result.text}
        </p>
      )}
    </div>
  )
}
