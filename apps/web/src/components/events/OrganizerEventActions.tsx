'use client'

import { useState } from 'react'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

interface OrganizerEventActionsProps {
  eventId: string
  eventName: string
  /**
   * What the cancel API is addressed by — the event id for a pre-approval event,
   * the token once one exists. Both are accepted (lib/events/event-ref.ts).
   * Previously cancel was addressed by token alone, so on a tokenless event the
   * button and its confirmation dialog both rendered and then did NOTHING: the
   * handler bailed on `!eventToken` with no message. Half of the reason an
   * addressless event had no way out (owner testing 2026-08-06).
   */
  eventRef: string
  /** Only for the shareable attendee link, which genuinely needs the token. */
  eventToken: string | null
  status: string
  vertical: string
}

export default function OrganizerEventActions({ eventId, eventName, eventRef, eventToken, status, vertical }: OrganizerEventActionsProps) {
  const [copied, setCopied] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelResult, setCancelResult] = useState<string | null>(null)

  const eventUrl = eventToken && typeof window !== 'undefined'
    ? `${window.location.origin}/${vertical}/events/${eventToken}`
    : null
  const canCancel = !['completed', 'cancelled', 'declined'].includes(status)

  async function handleCopyLink() {
    if (!eventUrl) return
    try {
      await navigator.clipboard.writeText(eventUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textarea = document.createElement('textarea')
      textarea.value = eventUrl
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleCancel() {
    if (cancelling) return
    setCancelling(true)
    setCancelResult(null)
    try {
      const res = await fetch(`/api/events/${eventRef}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (res.ok) {
        setCancelResult('Event cancelled. Vendors have been notified.')
      } else {
        setCancelResult(`Error: ${data.error || 'Failed to cancel event'}`)
      }
    } catch {
      setCancelResult('Error: Connection failed. Please try again.')
    }
    setCancelling(false)
    setShowCancel(false)
  }

  return (
    <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap', marginTop: spacing.xs }}>
      {/* Copy shareable link */}
      {eventToken && ['approved', 'ready', 'active'].includes(status) && (
        <button
          onClick={handleCopyLink}
          style={{
            padding: `${spacing['3xs']} ${spacing.xs}`,
            backgroundColor: copied ? '#dcfce7' : statusColors.neutral100,
            color: copied ? '#166534' : statusColors.neutral600,
            border: `1px solid ${copied ? '#86efac' : statusColors.neutral300}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Link Copied!' : 'Copy Event Link'}
        </button>
      )}

      {/* Cancel event */}
      {canCancel && (
        <button
          onClick={() => setShowCancel(true)}
          disabled={cancelling}
          style={{
            padding: `${spacing['3xs']} ${spacing.xs}`,
            backgroundColor: 'transparent',
            color: statusColors.danger,
            border: `1px solid ${statusColors.dangerBorder}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.medium,
            cursor: cancelling ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel Event
        </button>
      )}

      {cancelResult && (
        <span style={{ fontSize: typography.sizes.xs, color: cancelResult.startsWith('Error') ? statusColors.danger : '#166534' }}>
          {cancelResult}
        </span>
      )}

      <ConfirmDialog
        open={showCancel}
        title="Cancel Event"
        message={`Are you sure you want to cancel "${eventName}"? Vendors will be notified and pre-orders will need to be refunded. This cannot be easily undone.`}
        confirmLabel="Cancel Event"
        cancelLabel="Keep Event"
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setShowCancel(false)}
      />
    </div>
  )
}
