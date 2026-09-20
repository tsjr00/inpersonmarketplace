'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import MarketAgreementBlock from '@/components/market-manager/MarketAgreementBlock'
import { calculateBoothRentalFees } from '@/lib/pricing'

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
  /** Vendor's booth-credit balance at this market (auto-applied at checkout). */
  creditBalanceCents?: number
  /** Return-from-Stripe flash (Phase C Stage 3). When set, the form
   *  renders a confirmation/cancellation state instead of the booking
   *  form. Server reads ?session= query param and passes the flag in. */
  returnFlash?: 'success' | 'cancel'
  /** BR-4 (owner 2026-09-19): the tier the manager set on the vendor's pin.
   *  When present the size picker is locked to it — booking is the vendor's
   *  acceptance of the size the manager assigned. */
  lockedInventoryId?: string | null
  /** BR-5: the booth number pinned for this vendor (a hold until they pay). */
  pinnedBoothNumber?: string | null
  /** BR-13: when set, booking is blocked for this reason (e.g. no days
   *  declared yet) — the submit button stays disabled and says why. */
  bookingBlockedReason?: string | null
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
  // Always show cents on a transaction amount — otherwise $26.78 next to a
  // "$25" renders inconsistently and a $159.90 total reads as "$159.9"
  // (tester finding 2026-07-23).
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function BookBoothForm({
  marketId,
  marketName,
  vertical,
  weeks,
  inventory,
  creditBalanceCents = 0,
  returnFlash,
  lockedInventoryId = null,
  pinnedBoothNumber = null,
  bookingBlockedReason = null,
}: BookBoothFormProps) {
  const [selectedWeek, setSelectedWeek] = useState<string>(weeks[0] ?? '')
  // BR-4: a pin with a tier pre-selects and locks that tier.
  const lockedTierExists = !!lockedInventoryId && inventory.some((i) => i.id === lockedInventoryId)
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>(
    lockedTierExists ? (lockedInventoryId as string) : (inventory[0]?.id ?? '')
  )
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      // Phase C Stage 3 (2026-05-17): when the manager's Stripe is
      // ready, the API returns a checkout_url and we redirect the
      // vendor to Stripe-hosted Checkout. Otherwise (Stage 1 mode —
      // manager not yet onboarded), fall through to the offline-
      // payment success state.
      if (typeof data.checkout_url === 'string' && data.checkout_url.length > 0) {
        window.location.href = data.checkout_url
        return
      }
      // Stripe-only model (2026-05-18): API should always return a
      // checkout_url on success. If it doesn't, treat as a server error
      // — don't fall through to a "manager will coordinate" success
      // state since that path no longer exists.
      setError('Something went wrong setting up your payment. Please try again, or reach out to the market manager.')
      setSubmitting(false)
    } catch {
      setError('Network error — please try again.')
      setSubmitting(false)
    }
  }

  // Phase C Stage 3 (2026-05-17) — return-from-Stripe flash rendering.
  // success path: vendor completed Stripe Checkout; webhook will flip
  // status='paid' if it hasn't already. Send them to their dashboard.
  // cancel path: vendor backed out at Stripe; offer to retry or leave.
  if (returnFlash === 'success') {
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
          ✓ Payment received
        </h2>
        <p style={{ margin: 0, marginBottom: spacing.sm, color: colors.textPrimary, fontSize: typography.sizes.sm, lineHeight: 1.6 }}>
          Thanks — your booth booking at <strong>{marketName}</strong> is confirmed.
          The manager will reach out with a booth number assignment before
          your market day.
        </p>
        <p style={{ margin: 0, marginBottom: spacing.md, color: colors.textMuted, fontSize: typography.sizes.sm, lineHeight: 1.5 }}>
          Your booking should appear on your dashboard within a minute as
          Stripe finishes processing. You&apos;ll also get an email receipt.
        </p>
        <Link
          href={`/${vertical}/vendor/bookings`}
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
          View my bookings →
        </Link>
      </div>
    )
  }

  if (returnFlash === 'cancel') {
    return (
      <div style={{
        padding: spacing.md,
        backgroundColor: '#fff3cd',
        border: '1px solid #ffeeba',
        borderRadius: radius.md,
        marginBottom: spacing.md,
        color: '#856404',
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
        }}>
          You stepped away from payment
        </h2>
        <p style={{ margin: 0, marginBottom: spacing.sm, fontSize: typography.sizes.sm, lineHeight: 1.5 }}>
          No charge was made. Your booking is still on file as pending —
          it will be released automatically in about 30 minutes if you
          don&apos;t come back to complete payment.
        </p>
        <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Link
            href={`/${vertical}/markets/${marketId}/book`}
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
            Try again
          </Link>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              display: 'inline-block',
              padding: `${spacing.sm} ${spacing.md}`,
              backgroundColor: 'transparent',
              color: colors.textMuted,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              textDecoration: 'none',
            }}
          >
            Back to dashboard
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
      {creditBalanceCents > 0 && (
        <div style={{
          padding: `${spacing['2xs']} ${spacing.xs}`,
          marginBottom: spacing.md,
          fontSize: typography.sizes.sm,
          color: '#155724',
          backgroundColor: '#d4edda',
          borderRadius: radius.sm,
        }}>
          You have <strong>{formatPrice(creditBalanceCents)}</strong> in booth credit here — it&apos;s applied automatically at checkout.
        </div>
      )}

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

      {/* BR-4/BR-5 (owner 2026-09-19): what the manager set at approval. The
          number is a hold until the first paid week; the size is locked. */}
      {(pinnedBoothNumber || lockedTierExists) && (
        <div style={{
          marginBottom: spacing.md,
          padding: spacing.sm,
          backgroundColor: colors.primaryLight,
          border: `1px solid ${colors.primary}`,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          color: colors.textPrimary,
          lineHeight: 1.5,
        }}>
          <strong>Your booth at {marketName}:</strong>{' '}
          {pinnedBoothNumber ? `#${pinnedBoothNumber}` : 'number set when you pay'}
          {lockedTierExists ? ` · ${inventory.find((i) => i.id === lockedInventoryId)?.size_label ?? ''} size` : ''}
          {' — assigned by the manager. '}
          {lockedTierExists ? 'That is the size you will be charged for; ask the manager if you need a different one. ' : ''}
          {pinnedBoothNumber ? 'The number is held for you and becomes yours once you pay for a week.' : ''}
        </div>
      )}

      {/* Booth size picker */}
      <label style={{ display: 'block', marginBottom: spacing.md }}>
        <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing['2xs'] }}>
          Booth size{lockedTierExists ? ' (set by the manager)' : ''}
        </div>
        <select
          value={selectedInventoryId}
          onChange={(e) => setSelectedInventoryId(e.target.value)}
          disabled={submitting || lockedTierExists}
          title={lockedTierExists ? 'Your booth size was set by the manager at approval' : undefined}
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

      {/* Price display — Stripe-only model (revised 2026-05-18). The booth
          booking form is the single pre-checkout screen (combines product-
          page + cart + final-confirmation), so it follows the existing
          "one all-inclusive number, no breakdown" convention from
          CartDrawer.tsx:218 and the calculateDisplayPrice helper in
          src/lib/constants.ts ("what buyer sees"). The number shown is
          what Stripe will charge on the next step — no surprises. */}
      {selectedInventory && (() => {
        const fees = calculateBoothRentalFees(selectedInventory.weekly_price_cents)
        const applied = Math.max(0, Math.min(creditBalanceCents, fees.managerReceivesCents, fees.vendorPaysCents - 50))
        const net = fees.vendorPaysCents - applied
        return (
          <div style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceBase,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            marginBottom: spacing.md,
          }}>
            <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing['3xs'] }}>
              You&apos;ll pay
            </div>
            <div style={{
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold,
              color: colors.textPrimary,
              lineHeight: 1.1,
            }}>
              {formatPrice(net)}
            </div>
            {applied > 0 && (
              <div style={{ fontSize: typography.sizes.xs, color: '#155724', marginTop: spacing['3xs'] }}>
                Booth credit applied: −{formatPrice(applied)} (was {formatPrice(fees.vendorPaysCents)})
              </div>
            )}
            <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>
              Locked at booking. You&apos;ll complete payment through Stripe on the next step.
            </div>
          </div>
        )
      })()}

      {/* Cancellation policy. Updated Session 92 Phase C: market-day
          cancellation is now in-app — when a manager cancels a date, the
          booth fee is credited or rescheduled (their choice). The platform
          still issues no cash refunds for booth rentals. */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#fff7e6',
        border: '1px solid #ffd57a',
        borderRadius: radius.sm,
        fontSize: typography.sizes.sm,
        color: '#664d03',
        lineHeight: 1.5,
        marginBottom: spacing.md,
      }}>
        <strong>If a market day is cancelled:</strong> Once you book and pay,
        the booth is yours for the selected week. If the market manager
        cancels that market day, your booth fee is credited or moved to a
        make-up date — their call. The platform doesn&apos;t issue cash
        refunds for booth rentals.
      </div>

      {/* Agreement block */}
      <MarketAgreementBlock
        marketId={marketId}
        vertical={vertical}
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

      {/* BR-13: blocked until the vendor has declared days at this market (the
          gate above the form). The server refuses too (ERR_DECLARE_DAYS_FIRST). */}
      {bookingBlockedReason && (
        <p style={{ margin: `0 0 ${spacing.sm} 0`, fontSize: typography.sizes.sm, color: '#78350f' }}>
          {bookingBlockedReason}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || !agreementAccepted || !!bookingBlockedReason}
        title={bookingBlockedReason ?? undefined}
        style={{
          padding: `${spacing.sm} ${spacing.md}`,
          backgroundColor: colors.primary,
          color: 'white',
          border: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          cursor: (submitting || !agreementAccepted || !!bookingBlockedReason) ? 'not-allowed' : 'pointer',
          opacity: (submitting || !agreementAccepted || !!bookingBlockedReason) ? 0.6 : 1,
        }}
      >
        {submitting ? 'Booking…' : 'Continue to payment →'}
      </button>
    </form>
  )
}
