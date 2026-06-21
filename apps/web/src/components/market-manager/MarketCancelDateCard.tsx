'use client'

import { useState } from 'react'
import ManagerCard from './ManagerCard'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

const DANGER = '#dc2626'

/** YYYY-MM-DD for `today + offsetDays` (local). */
function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

interface Result {
  refundedItems: number
  boothRentersNotified: number
  marketBoxCredited: number
}

/**
 * Phase C — manager cancels a single upcoming market day. Records the override
 * and runs the cascade server-side: buyer orders auto-refunded, paid booth
 * renters credited/rescheduled (manager's choice), market-box pickups credited.
 * One-way in v1 (no un-cancel). Acknowledgment required before submit.
 */
export default function MarketCancelDateCard({ marketId }: { marketId: string }) {
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [disposition, setDisposition] = useState<'credit' | 'reschedule'>('credit')
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const minDate = isoDate(1)
  const maxDate = isoDate(56)

  function openConfirm() {
    setError(null)
    if (!date) { setError('Pick the market date to cancel.'); return }
    if (disposition === 'reschedule' && !rescheduleDate) {
      setError('Pick the make-up date, or choose Credit instead.'); return
    }
    setAcknowledged(false)
    setConfirming(true)
  }

  async function submit() {
    if (!acknowledged) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/cancel-date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          reason,
          boothDisposition: disposition,
          ...(disposition === 'reschedule' ? { rescheduleDate } : {}),
          acknowledged: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not cancel the date. Please try again.')
      } else {
        setResult({
          refundedItems: data.refundedItems ?? 0,
          boothRentersNotified: data.boothRentersNotified ?? 0,
          marketBoxCredited: data.marketBoxCredited ?? 0,
        })
        setConfirming(false)
        setDate(''); setReason(''); setDisposition('credit'); setRescheduleDate('')
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    padding: `${spacing['2xs']} ${spacing.xs}`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    width: '100%',
  } as const

  return (
    <ManagerCard
      id="cancel-date"
      title="Cancel a market day"
      description="Close a single upcoming date (e.g. weather). Buyers with orders are refunded automatically; paid booth renters are credited or rescheduled; market-box pickups are credited. This can't be undone."
    >
      {result && (
        <div style={{
          marginBottom: spacing.sm, padding: spacing.xs,
          backgroundColor: colors.primaryLight, border: `1px solid ${colors.primary}`,
          borderRadius: radius.sm, fontSize: typography.sizes.sm, color: colors.primaryDark,
        }}>
          Date cancelled. {result.refundedItems} buyer item(s) refunded · {result.boothRentersNotified} booth renter(s) notified · {result.marketBoxCredited} market-box pickup(s) credited.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, maxWidth: 460 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
            Market date to cancel
          </span>
          <input type="date" value={date} min={minDate} max={maxDate}
            onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
            Reason (shown to vendors &amp; buyers)
          </span>
          <input type="text" value={reason} maxLength={500} placeholder="e.g. Severe weather"
            onChange={(e) => setReason(e.target.value)} style={inputStyle} />
        </label>

        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
          <legend style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, padding: 0, marginBottom: spacing['3xs'] }}>
            For paid booth renters
          </legend>
          <label style={{ display: 'flex', gap: spacing['2xs'], alignItems: 'center', fontSize: typography.sizes.sm, color: colors.textPrimary }}>
            <input type="radio" name="disposition" checked={disposition === 'credit'} onChange={() => setDisposition('credit')} />
            Credit their booth fee
          </label>
          <label style={{ display: 'flex', gap: spacing['2xs'], alignItems: 'center', fontSize: typography.sizes.sm, color: colors.textPrimary }}>
            <input type="radio" name="disposition" checked={disposition === 'reschedule'} onChange={() => setDisposition('reschedule')} />
            Reschedule to a make-up date
          </label>
          {disposition === 'reschedule' && (
            <input type="date" value={rescheduleDate} min={minDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              style={{ ...inputStyle, maxWidth: 200, marginTop: spacing['3xs'] }} />
          )}
        </fieldset>

        {error && <span style={{ fontSize: typography.sizes.sm, color: DANGER }}>{error}</span>}

        <button onClick={openConfirm} style={{
          alignSelf: 'flex-start',
          padding: `${spacing.xs} ${spacing.md}`,
          backgroundColor: DANGER, color: '#fff', border: 'none',
          borderRadius: radius.sm, fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold, cursor: 'pointer',
        }}>
          Cancel this date…
        </button>
      </div>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !submitting && setConfirming(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: spacing.md, zIndex: 1000,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            backgroundColor: colors.surfaceElevated, borderRadius: radius.md,
            padding: spacing.lg, maxWidth: 440, width: '100%',
            display: 'flex', flexDirection: 'column', gap: spacing.sm,
          }}>
            <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
              Cancel {date}?
            </h3>
            <ul style={{ margin: 0, paddingLeft: spacing.md, fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: 1.5 }}>
              <li>Buyers with orders for this date are <strong>refunded automatically</strong>.</li>
              <li>Paid booth renters are <strong>{disposition === 'reschedule' ? `rescheduled${rescheduleDate ? ` to ${rescheduleDate}` : ''}` : 'credited'}</strong> — you contact them directly.</li>
              <li>Market-box pickups on this date are <strong>credited</strong> (subscription extended a week).</li>
              <li>This <strong>cannot be undone</strong>.</li>
            </ul>
            <label style={{ display: 'flex', gap: spacing['2xs'], alignItems: 'flex-start', fontSize: typography.sizes.sm, color: colors.textPrimary }}>
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ marginTop: 3 }} />
              <span>I understand the effects above and take responsibility for direct vendor outreach.</span>
            </label>
            <div style={{ display: 'flex', gap: spacing.xs, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirming(false)} disabled={submitting} style={{
                padding: `${spacing.xs} ${spacing.md}`, backgroundColor: colors.surfaceBase,
                color: colors.textPrimary, border: `1px solid ${colors.border}`,
                borderRadius: radius.sm, fontSize: typography.sizes.sm, cursor: 'pointer',
              }}>
                Back
              </button>
              <button onClick={submit} disabled={!acknowledged || submitting} style={{
                padding: `${spacing.xs} ${spacing.md}`,
                backgroundColor: acknowledged ? DANGER : colors.surfaceBase,
                color: acknowledged ? '#fff' : colors.textMuted,
                border: acknowledged ? 'none' : `1px solid ${colors.border}`,
                borderRadius: radius.sm, fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                cursor: acknowledged && !submitting ? 'pointer' : 'not-allowed',
              }}>
                {submitting ? 'Cancelling…' : 'Cancel this date'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ManagerCard>
  )
}
