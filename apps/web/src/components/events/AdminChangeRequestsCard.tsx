'use client'

import { useState, useEffect, useCallback } from 'react'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import { describeChanges, reasonLabel } from '@/lib/events/change-requests'

/**
 * The admin queue behind the organizer change block.
 *
 * Every row here is time-critical BY DEFINITION — a request only exists because
 * the event was too close for the organizer to change it themselves. So the
 * card renders at the top of the admin events page whenever anything is
 * pending, and renders NOTHING when the queue is empty rather than occupying
 * space with a permanent empty state.
 *
 * Owner decisions surfaced in this UI (2026-08-09):
 *   · A decline cannot be submitted without a reason.
 *   · Approving requires an explicit choice about the existing pre-orders —
 *     there is no default, because they are judged case by case.
 *   · The organizer's explanation is shown verbatim, because it is what the
 *     admin is actually judging.
 */

interface ChangeRequest {
  id: string
  reason_category: string
  explanation: string
  requested_changes: Record<string, string>
  preorder_count_at_request: number
  preorder_value_cents_at_request: number
  live_preorder_count: number
  live_preorder_value_cents: number
  status: string
  created_at: string
  event: {
    company_name: string | null
    contact_name: string | null
    contact_email: string | null
    event_date: string | null
    city: string | null
    state: string | null
    service_level: string | null
  } | null
}

/** Cents to a plain dollar figure. Never rounded away — this is real money. */
function money(cents: number): string {
  return `$${((cents || 0) / 100).toFixed(2)}`
}

const ORDER_ACTIONS = [
  { value: 'refund_all', label: 'Refund every pre-order' },
  { value: 'keep_all', label: 'Keep all pre-orders as they are' },
  { value: 'handled_manually', label: "I'll handle the orders myself" },
] as const

export default function AdminChangeRequestsCard({
  vertical,
  primaryColor,
}: {
  vertical: string
  primaryColor: string
}) {
  const [requests, setRequests] = useState<ChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [orderAction, setOrderAction] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/change-requests?vertical=${vertical}&status=pending`)
      if (res.ok) {
        const data = await res.json()
        setRequests(data.requests || [])
      }
    } catch { /* the card simply stays empty */ }
    setLoading(false)
  }, [vertical])

  // queueMicrotask, not a bare call: react-hooks/set-state-in-effect forbids
  // setState inside an effect body, and `load` sets state on completion. Same
  // pattern as OrganizerEventDetails.
  useEffect(() => {
    queueMicrotask(() => { void load() })
  }, [load])

  async function act(id: string, action: 'approve' | 'decline') {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/events/change-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          review_note: note.trim() || undefined,
          ...(action === 'approve' ? { order_action: orderAction } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage(action === 'approve' ? 'Approved and applied.' : 'Declined — the organizer will be told why.')
        setOpenId(null)
        setNote('')
        setOrderAction('')
        await load()
      } else {
        setMessage(data.error || 'That did not go through.')
      }
    } catch {
      setMessage('That did not go through.')
    }
    setBusy(false)
  }

  // Nothing pending: render nothing. A permanent empty state on a queue that is
  // usually empty just trains admins to scroll past this area.
  if (loading || requests.length === 0) return null

  return (
    <div style={{
      marginBottom: spacing.md,
      padding: spacing.md,
      backgroundColor: statusColors.attentionLight,
      border: `2px solid ${statusColors.attentionBorder}`,
      borderRadius: radius.md,
    }}>
      <h3 style={{
        margin: `0 0 ${spacing['2xs']}`,
        fontSize: typography.sizes.base,
        fontWeight: typography.weights.bold,
        color: statusColors.attentionDark,
      }}>
        {requests.length} organizer {requests.length === 1 ? 'is' : 'are'} waiting on you
      </h3>
      <p style={{
        margin: `0 0 ${spacing.sm}`,
        fontSize: typography.sizes.xs,
        color: statusColors.neutral700,
        lineHeight: 1.5,
      }}>
        These events are too close for the organizer to change themselves, so nothing happens until
        you decide. Oldest first.
      </p>

      {message && (
        <p style={{
          margin: `0 0 ${spacing.xs}`,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          color: statusColors.neutral800,
        }}>
          {message}
        </p>
      )}

      {requests.map(r => {
        const isOpen = openId === r.id
        const isSelfService = r.event?.service_level === 'self_service'
        return (
          <div
            key={r.id}
            style={{
              backgroundColor: '#ffffff',
              border: `1px solid ${statusColors.neutral200}`,
              borderRadius: radius.sm,
              padding: spacing.sm,
              marginBottom: spacing.xs,
            }}
          >
            <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.neutral900 }}>
              {r.event?.company_name || 'Event'} — {r.event?.event_date || 'no date'}
              {r.event?.city ? ` · ${r.event.city}, ${r.event.state}` : ''}
            </div>

            <div style={{ fontSize: typography.sizes.xs, color: statusColors.neutral700, marginTop: spacing['3xs'] }}>
              Wants to change <strong>{describeChanges(r.requested_changes)}</strong>
              {' · '}
              {isSelfService ? 'self-service' : 'admin-assisted'}
            </div>

            {/*
              The money, not just the count — this is what the admin is really
              deciding about, and it is the reason a person is in this loop at
              all. Owner, 2026-08-09: "the admin should see how much is at
              stake… we want to give them the info needed to communicate with
              the organizer and make decisions."
            */}
            <div style={{
              marginTop: spacing['2xs'],
              padding: spacing['2xs'],
              backgroundColor: statusColors.dangerLight,
              border: `1px solid ${statusColors.dangerBorder}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              color: statusColors.dangerDark,
              fontWeight: typography.weights.semibold,
            }}>
              {money(r.live_preorder_value_cents)} at stake across{' '}
              {r.live_preorder_count} {r.live_preorder_count === 1 ? 'order' : 'orders'}
              {/*
                Only shown when it has actually moved. The organizer decided
                based on the first figure; the admin decides on the second, and
                a silent difference between them is how someone gets told a
                number that is no longer true.
              */}
              {(r.live_preorder_count !== r.preorder_count_at_request ||
                r.live_preorder_value_cents !== r.preorder_value_cents_at_request) && (
                <span style={{
                  display: 'block',
                  fontWeight: typography.weights.normal,
                  fontSize: typography.sizes.xs,
                  color: statusColors.neutral600,
                  marginTop: 2,
                }}>
                  Was {money(r.preorder_value_cents_at_request)} across{' '}
                  {r.preorder_count_at_request}{' '}
                  {r.preorder_count_at_request === 1 ? 'order' : 'orders'} when they asked —
                  it has changed since.
                </span>
              )}
            </div>

            <div style={{
              marginTop: spacing['2xs'],
              padding: spacing['2xs'],
              backgroundColor: statusColors.neutral50,
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              color: statusColors.neutral800,
            }}>
              <strong>{reasonLabel(r.reason_category)}</strong>
              <div style={{ marginTop: 2, fontStyle: 'italic' }}>&ldquo;{r.explanation}&rdquo;</div>
            </div>

            {!isOpen ? (
              <button
                onClick={() => { setOpenId(r.id); setNote(''); setOrderAction(''); setMessage(null) }}
                style={{
                  marginTop: spacing.xs,
                  padding: `${spacing['3xs']} ${spacing.sm}`,
                  backgroundColor: primaryColor,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.semibold,
                  cursor: 'pointer',
                }}
              >
                Review
              </button>
            ) : (
              <div style={{ marginTop: spacing.xs }}>
                {/*
                  No default. The owner decided pre-orders are judged case by
                  case, so the admin has to pick before approve is enabled.
                */}
                <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral700, marginBottom: 2 }}>
                  If you approve, what happens to the {r.live_preorder_count} existing{' '}
                  {r.live_preorder_count === 1 ? 'pre-order' : 'pre-orders'} —{' '}
                  {money(r.live_preorder_value_cents)}?
                </label>
                <select
                  value={orderAction}
                  onChange={(e) => setOrderAction(e.target.value)}
                  style={{
                    width: '100%',
                    padding: spacing['2xs'],
                    borderRadius: radius.sm,
                    border: `1px solid ${statusColors.neutral300}`,
                    fontSize: typography.sizes.sm,
                    marginBottom: spacing.xs,
                  }}
                >
                  <option value="">Choose…</option>
                  {ORDER_ACTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>

                <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral700, marginBottom: 2 }}>
                  Note to the organizer {' '}
                  <span style={{ fontWeight: typography.weights.normal, color: statusColors.neutral500 }}>
                    (required if you decline)
                  </span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: spacing['2xs'],
                    borderRadius: radius.sm,
                    border: `1px solid ${statusColors.neutral300}`,
                    fontSize: typography.sizes.sm,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    marginBottom: spacing.xs,
                  }}
                />

                {isSelfService && (
                  <p style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>
                    Self-service event — approve exactly what was asked, or decline. Editing the
                    change is only available on admin-assisted events.
                  </p>
                )}

                <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => void act(r.id, 'approve')}
                    disabled={busy || !orderAction}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.sm}`,
                      backgroundColor: busy || !orderAction ? statusColors.neutral300 : statusColors.success,
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      cursor: busy || !orderAction ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Approve &amp; apply
                  </button>
                  <button
                    onClick={() => void act(r.id, 'decline')}
                    disabled={busy || !note.trim()}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.sm}`,
                      backgroundColor: busy || !note.trim() ? statusColors.neutral300 : statusColors.danger,
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      cursor: busy || !note.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => setOpenId(null)}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.sm}`,
                      backgroundColor: 'transparent',
                      color: statusColors.neutral600,
                      border: `1px solid ${statusColors.neutral300}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
