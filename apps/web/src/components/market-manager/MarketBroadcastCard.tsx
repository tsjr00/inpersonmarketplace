'use client'

import { useState, useEffect, useCallback } from 'react'
import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import ManagerCard from './ManagerCard'
import { term } from '@/lib/vertical/terminology'

/**
 * Manager broadcast composer + history (Session 92 Phase B-broadcast). One-way
 * announcement to the market's vendors (approved + paid upcoming renters).
 * NOT a chat — send-only. Server enforces a 2-per-7-days limit per market.
 * The history list below shows past sends + how many remain this window.
 */
interface MarketBroadcastCardProps {
  marketId: string
  vertical: string
}

interface BroadcastRow {
  id: string
  subject: string | null
  body: string
  recipient_count: number
  created_at: string
}

const MAX_BODY = 2000
const MAX_SUBJECT = 150

function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function MarketBroadcastCard({ marketId, vertical }: MarketBroadcastCardProps) {
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [history, setHistory] = useState<BroadcastRow[] | null>(null)
  const [sentThisWindow, setSentThisWindow] = useState(0)
  const [maxPerWindow, setMaxPerWindow] = useState(2)

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-manager/${marketId}/broadcast`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setHistory((data.broadcasts as BroadcastRow[]) || [])
        setSentThisWindow((data.sentThisWindow as number) ?? 0)
        setMaxPerWindow((data.maxPerWindow as number) ?? 2)
      } else {
        setHistory([])
      }
    } catch {
      setHistory([])
    }
  }, [marketId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

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
          text: `Sent to ${data.recipient_count ?? 0} ${term(vertical, 'vendor').toLowerCase()}${data.recipient_count === 1 ? '' : 's'}.`,
        })
        setSubject('')
        setBodyText('')
        // Refresh the history + window count so the new send appears and the
        // "X of N used this week" hint updates immediately.
        loadHistory()
      } else {
        setResult({ type: 'error', text: data.error || 'Failed to send announcement.' })
      }
    } catch {
      setResult({ type: 'error', text: 'Something went wrong sending the announcement.' })
    } finally {
      setBusy(false)
    }
  }

  const atLimit = sentThisWindow >= maxPerWindow

  return (
    <ManagerCard
      title="Send an announcement"
      description={`Send a one-way message to the ${term(vertical, 'vendors').toLowerCase()} at your ${term(vertical, 'market').toLowerCase()} (everyone approved, plus anyone with a paid ${term(vertical, 'booth').toLowerCase()} this week or later). They get an in-app notification and an email. ${term(vertical, 'vendors')} can't reply here — share contact details in the message if you want responses. Up to 2 announcements per 7 days.`}
    >
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
        placeholder={`Your announcement to ${term(vertical, 'vendors').toLowerCase()}…`}
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
          backgroundColor: result.type === 'success' ? statusColors.successLight : statusColors.dangerLight,
          color: result.type === 'success' ? statusColors.successDark : statusColors.dangerDark,
          border: `1px solid ${result.type === 'success' ? statusColors.successBorder : statusColors.dangerBorder}`,
        }}>
          {result.text}
        </div>
      )}

      {/* Recent announcements — read-only history of past sends + the
          trailing-window count, so the rate limit is legible. */}
      <div style={{
        marginTop: spacing.md,
        paddingTop: spacing.md,
        borderTop: `1px solid ${colors.border}`,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: spacing.xs,
          marginBottom: spacing.xs,
        }}>
          <h3 style={{
            margin: 0,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
          }}>
            Recent announcements
          </h3>
          <span style={{
            fontSize: typography.sizes.xs,
            color: atLimit ? statusColors.danger : colors.textMuted,
          }}>
            {sentThisWindow} of {maxPerWindow} used this week
          </span>
        </div>

        {history === null ? (
          <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>Loading…</div>
        ) : history.length === 0 ? (
          <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>
            No announcements sent yet.
          </div>
        ) : (
          <ul style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: spacing.xs,
          }}>
            {history.map((b) => (
              <li key={b.id} style={{
                padding: spacing.sm,
                backgroundColor: colors.surfaceBase,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: spacing.xs,
                  flexWrap: 'wrap',
                  marginBottom: spacing['3xs'],
                }}>
                  <span style={{
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary,
                  }}>
                    {b.subject || 'Announcement'}
                  </span>
                  <span style={{
                    fontSize: typography.sizes.xs,
                    color: colors.textMuted,
                    whiteSpace: 'nowrap',
                  }}>
                    {formatSentAt(b.created_at)} · {b.recipient_count} recipient{b.recipient_count === 1 ? '' : 's'}
                  </span>
                </div>
                <div style={{
                  fontSize: typography.sizes.sm,
                  color: colors.textPrimary,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}>
                  {b.body}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ManagerCard>
  )
}
