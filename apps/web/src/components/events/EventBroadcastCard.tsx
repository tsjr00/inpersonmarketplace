'use client'

import { useState, useEffect } from 'react'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'

/**
 * Organizer → vendors/attendees announcement composer for an event.
 * One-way (not a chat). Mirrors the manager MarketBroadcastCard: subject +
 * body + audience choice, a "X of N used this week" counter, and a recent
 * history list. Backend: /api/events/[token]/broadcast (in-app + email via
 * sendNotification). Rendered inside the organizer's My Events card.
 */

interface EventBroadcastCardProps {
  eventToken: string
  primaryColor: string
}

interface BroadcastRow {
  id: string
  subject: string | null
  body: string
  recipient_count: number
  created_at: string
}

type Audience = 'both' | 'vendors' | 'attendees'

const MAX_BODY = 2000
const MAX_SUBJECT = 150

export default function EventBroadcastCard({ eventToken, primaryColor }: EventBroadcastCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<Audience>('both')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [history, setHistory] = useState<BroadcastRow[]>([])
  const [usage, setUsage] = useState<{ sent: number; max: number; days: number } | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function loadHistory() {
    try {
      const res = await fetch(`/api/events/${eventToken}/broadcast`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data.broadcasts || [])
        setUsage({ sent: data.sentThisWindow ?? 0, max: data.maxPerWindow ?? 2, days: data.windowDays ?? 7 })
      }
    } catch { /* silent */ }
    setLoaded(true)
  }

  useEffect(() => {
    if (expanded && !loaded) queueMicrotask(() => { void loadHistory() })
  }, [expanded, loaded])

  async function send() {
    if (sending || !body.trim()) return
    setSending(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/events/${eventToken}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim() || undefined, body: body.trim(), audience }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage(`Sent to ${data.recipient_count} recipient${data.recipient_count === 1 ? '' : 's'}${
          data.vendor_count != null ? ` (${data.vendor_count} vendors, ${data.attendee_count} attendees)` : ''
        }.`)
        setSubject('')
        setBody('')
        setLoaded(false)
        void loadHistory()
      } else {
        setMessage(data.error || 'Could not send. Please try again.')
      }
    } catch {
      setMessage('Network error. Please try again.')
    }
    setSending(false)
  }

  const atLimit = usage ? usage.sent >= usage.max : false

  return (
    <div style={{ marginTop: spacing.xs }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: typography.sizes.sm, color: primaryColor, fontWeight: typography.weights.semibold,
          display: 'flex', alignItems: 'center', gap: spacing['3xs'],
        }}
      >
        {expanded ? '▾' : '▸'} Message vendors &amp; attendees
      </button>

      {expanded && (
        <div style={{ marginTop: spacing.xs }}>
          <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `0 0 ${spacing.xs}` }}>
            Sends a one-way announcement by in-app notification and email. Recipients can&apos;t reply here — include contact details if you need a response.
            {usage && <> {' '}<strong>{usage.sent} of {usage.max}</strong> used in the last {usage.days} days.</>}
          </p>

          <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.xs, flexWrap: 'wrap' }}>
            {(['both', 'vendors', 'attendees'] as Audience[]).map(a => (
              <label key={a} style={{ display: 'flex', alignItems: 'center', gap: spacing['3xs'], fontSize: typography.sizes.xs, color: statusColors.neutral700, cursor: 'pointer' }}>
                <input type="radio" name={`aud-${eventToken}`} checked={audience === a} onChange={() => setAudience(a)} />
                {a === 'both' ? 'Vendors + attendees' : a === 'vendors' ? 'Vendors only' : 'Attendees only'}
              </label>
            ))}
          </div>

          <input
            type="text"
            placeholder="Subject (optional)"
            value={subject}
            maxLength={MAX_SUBJECT}
            onChange={(e) => setSubject(e.target.value)}
            style={{
              width: '100%', padding: `${spacing['3xs']} ${spacing.xs}`,
              border: `1px solid ${statusColors.neutral300}`, borderRadius: radius.sm,
              fontSize: typography.sizes.sm, boxSizing: 'border-box', marginBottom: spacing.xs,
            }}
          />
          <textarea
            rows={4}
            placeholder="Your announcement…"
            value={body}
            maxLength={MAX_BODY}
            onChange={(e) => setBody(e.target.value)}
            style={{
              width: '100%', padding: `${spacing['3xs']} ${spacing.xs}`,
              border: `1px solid ${statusColors.neutral300}`, borderRadius: radius.sm,
              fontSize: typography.sizes.sm, boxSizing: 'border-box', resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs }}>
            <button
              onClick={send}
              disabled={sending || !body.trim() || atLimit}
              style={{
                padding: `${spacing['3xs']} ${spacing.sm}`, backgroundColor: primaryColor, color: 'white',
                border: 'none', borderRadius: radius.sm, fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                cursor: sending || !body.trim() || atLimit ? 'not-allowed' : 'pointer',
                opacity: sending || !body.trim() || atLimit ? 0.6 : 1,
              }}
            >
              {sending ? 'Sending…' : 'Send announcement'}
            </button>
            {atLimit && (
              <span style={{ fontSize: typography.sizes.xs, color: '#92400e' }}>
                Weekly limit reached.
              </span>
            )}
          </div>

          {message && (
            <p style={{ fontSize: typography.sizes.xs, color: message.startsWith('Sent') ? '#166534' : '#dc2626', marginTop: spacing['2xs'] }}>
              {message}
            </p>
          )}

          {history.length > 0 && (
            <div style={{ marginTop: spacing.sm }}>
              <div style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral600, marginBottom: spacing['2xs'] }}>
                Recent announcements
              </div>
              {history.map(h => (
                <div key={h.id} style={{ fontSize: typography.sizes.xs, color: statusColors.neutral600, marginBottom: spacing['2xs'], paddingBottom: spacing['2xs'], borderBottom: `1px solid ${statusColors.neutral200}` }}>
                  {h.subject && <strong>{h.subject} · </strong>}
                  {h.body.length > 120 ? h.body.slice(0, 120) + '…' : h.body}
                  <span style={{ color: statusColors.neutral400 }}> — {h.recipient_count} recipient{h.recipient_count === 1 ? '' : 's'}, {new Date(h.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
