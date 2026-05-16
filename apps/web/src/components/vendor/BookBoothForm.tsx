'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import MarketAgreementBlock from '@/components/market-manager/MarketAgreementBlock'

/**
 * Vendor weekly booth booking form. Phase C Stage 1 (2026-05-16).
 *
 * Client component rendered by /[vertical]/markets/[id]/book. The server
 * page does all auth + approval checking; this form just collects the
 * three inputs and posts.
 *
 * Submit hits POST /api/vendor/markets/[id]/book. Stripe is not in this
 * flow — the booking is written with status='pending_payment' and the
 * vendor sees a success state explaining payment is coming.
 */
interface InventoryRow {
  id: string
  size_label: string
  dimensions: string | null
  weekly_price_cents: number
}

interface BookBoothFormProps {
  marketId: string
  marketName: string
  vertical: string
  /** Pre-computed Sunday YYYY-MM-DD strings from the server. */
  weeks: string[]
  inventory: InventoryRow[]
}

function formatWeekLabel(yyyyMmDd: string): string {
  // Construct the date in local time to avoid UTC-shift display surprises.
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  const dt = new Date(y, (m - 1), d)
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export default function BookBoothForm({
  marketId,
  marketName,
  vertical,
  weeks,
  inventory,
}: BookBoothFormProps) {
  const [selectedWeek, setSelectedWeek] = useState<string>(weeks[0] ?? '')
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>(inventory[0]?.id ?? '')
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    week: string
    size: string
    price_cents: number
  } | null>(null)

  const selectedInventory = useMemo(
    () => inventory.find((i) => i.id === selectedInventoryId) ?? null,
    [inventory, selectedInventoryId]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (!agreementAccepted) {
      setError("Please accept the market's agreement before booking.")
      return
    }
    if (!selectedWeek) {
      setError('Please pick a week.')
      return
    }
    if (!selectedInventoryId) {
      setError('Please pick a booth size.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/vendor/markets/${marketId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start_date: selectedWeek,
          inventory_id: selectedInventoryId,
          agreement_accepted: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not complete booking. Try again.')
        setSubmitting(false)
        return
      }
      setSuccess({
        week: data.week_start_date,
        size: selectedInventory?.size_label ?? '',
        price_cents: data.price_cents,
      })
      setSubmitting(false)
    } catch {
      setError('Network error — please try again.')
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          ✓ Booking submitted
        </h2>
        <p style={{ margin: 0, marginBottom: spacing.sm, color: colors.textPrimary, fontSize: typography.sizes.sm, lineHeight: 1.6 }}>
          Your booking at <strong>{marketName}</strong> is recorded:
        </p>
        <ul style={{ margin: 0, marginBottom: spacing.md, paddingLeft: spacing.md, color: colors.textPrimary, fontSize: typography.sizes.sm, lineHeight: 1.6 }}>
          <li>Week of {formatWeekLabel(success.week)}</li>
          <li>Booth size: {success.size}</li>
          <li>Price: {formatPrice(success.price_cents)}</li>
          <li>Status: <em>pending payment</em></li>
        </ul>
        <p style={{ margin: 0, marginBottom: spacing.md, color: colors.textMuted, fontSize: typography.sizes.sm, lineHeight: 1.5 }}>
          Online payment is coming soon. For now, the manager will reach
          out to coordinate payment directly. Your price ({formatPrice(success.price_cents)})
          is locked in — they can&apos;t change it after the fact.
        </p>
        <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              display: 'inline-block',
              padding: `${spacing.sm} ${spacing.md}`,
              backgroundColor: colors.primary,
              color: 'white',
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              textDecoration: 'none',
            }}
          >
            Back to vendor dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
      }}
    >
      {/* Week picker */}
      <label style={{ display: 'block', marginBottom: spacing.md }}>
        <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing['2xs'] }}>
          Week
        </div>
        <select
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          disabled={submitting}
          style={{
            width: '100%',
            padding: spacing.xs,
            fontSize: typography.sizes.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceBase,
            color: colors.textPrimary,
          }}
        >
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week of {formatWeekLabel(w)}
            </option>
          ))}
        </select>
      </label>

      {/* Booth size picker */}
      <label style={{ display: 'block', marginBottom: spacing.md }}>
        <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing['2xs'] }}>
          Booth size
        </div>
        <select
          value={selectedInventoryId}
          onChange={(e) => setSelectedInventoryId(e.target.value)}
          disabled={submitting}
          style={{
            width: '100%',
            padding: spacing.xs,
            fontSize: typography.sizes.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceBase,
            color: colors.textPrimary,
          }}
        >
          {inventory.map((i) => (
            <option key={i.id} value={i.id}>
              {i.size_label}
              {i.dimensions ? ` (${i.dimensions})` : ''}
              {' — '}
              {formatPrice(i.weekly_price_cents)}/week
            </option>
          ))}
        </select>
      </label>

      {/* Price display */}
      {selectedInventory && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: colors.surfaceBase,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.sm,
          marginBottom: spacing.md,
        }}>
          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing['3xs'] }}>
            You&apos;ll be charged
          </div>
          <div style={{
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
            lineHeight: 1.1,
          }}>
            {formatPrice(selectedInventory.weekly_price_cents)}
          </div>
          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
            Locked at booking. Payment coordinated separately for now.
          </div>
        </div>
      )}

      {/* Agreement block */}
      <MarketAgreementBlock
        marketId={marketId}
        onChange={setAgreementAccepted}
      />

      {error && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          marginBottom: spacing.sm,
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !agreementAccepted}
        style={{
          padding: `${spacing.sm} ${spacing.md}`,
          backgroundColor: colors.primary,
          color: 'white',
          border: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          cursor: (submitting || !agreementAccepted) ? 'not-allowed' : 'pointer',
          opacity: (submitting || !agreementAccepted) ? 0.6 : 1,
        }}
      >
        {submitting ? 'Booking…' : 'Complete booking (payment coming soon)'}
      </button>
    </form>
  )
}
