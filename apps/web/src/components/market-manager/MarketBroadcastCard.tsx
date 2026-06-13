'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Manager broadcast composer (Session 92 Phase B-broadcast). One-way
 * announcement to the market's vendors (approved + paid upcoming renters).
 * NOT a chat — send-only. Server enforces a 2-per-7-days limit per market.
 */
interface MarketBroadcastCardProps {
  marketId: string
}

const MAX_BODY = 2000
const MAX_SUBJECT = 150

export default function MarketBroadcastCard({ marketId }: MarketBroadcastCardProps) {
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const send = async () => {
    if (!bodyText.trim() || busy) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim() || undefined, body: bodyText.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult({
          type: 'success',
          text: `Sent to ${data.recipient_count ?? 0} vendor${data.recipient_count === 1 ? '' : 's'}.`,
        })
        setSubject('')
        setBodyText('')
      } else {
        setResult({ type: 'error', text: data.error || 'Failed to send announcement.' })
      }
    } catch {
      setResult({ type: 'error', text: 'Something went wrong sending the announcement.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    }}>
      <h2 style={{
        marginTop: 0,
        marginBottom: spacing.xs,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        Send an announcement
      </h2>
      <p style={{
        margin: 0,
        marginBottom: spacing.sm,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        lineHeight: 1.5,
      }}>
        Send a one-way message to the vendors at your market (everyone approved,
        plus anyone with a paid booth this week or later). They get an in-app
        notification and an email. Vendors can&apos;t reply here — share contact
        details in the message if you want responses. Up to 2 announcements per 7 days.
      </p>

      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value.slice(0, MAX_SUBJECT))}
        placeholder="Subject (optional)"
        disabled={busy}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: spacing.sm,
          marginBottom: spacing.xs,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
        }}
      />
      <textarea
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value.slice(0, MAX_BODY))}
        placeholder="Your announcement to vendors…"
        rows={4}
        disabled={busy}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: spacing.sm,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        marginTop: spacing.xs,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
          {bodyText.length}/{MAX_BODY}
        </span>
        <button
          onClick={send}
          disabled={busy || !bodyText.trim()}
          style={{
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: busy || !bodyText.trim() ? colors.border : colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: busy || !bodyText.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Sending…' : 'Send announcement'}
        </button>
      </div>

      {result && (
        <div style={{
          marginTop: spacing.sm,
          padding: `${spacing.xs} ${spacing.sm}`,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          backgroundColor: result.type === 'success' ? '#f0fdf4' : '#fef2f2',
          color: result.type === 'success' ? '#166534' : '#991b1b',
          border: `1px solid ${result.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
        }}>
          {result.text}
        </div>
      )}
    </div>
  )
}
