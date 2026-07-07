'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { calculateBoothRentalFees } from '@/lib/pricing'
import MarketAgreementBlock from '@/components/market-manager/MarketAgreementBlock'

/**
 * Vendor food-truck park-spot booking form (FT-only).
 *
 * Client component rendered by /[vertical]/markets/[id]/book-spot. The
 * server page does all the park-readiness checks; this form collects a
 * spot, a booking mode (single day vs prepay a week), and the day(s),
 * then posts to the booking API which returns a Stripe Checkout URL.
 *
 * Two tabs decouple the two actions (a truck kept trying to reconcile how
 * they related when they were stacked in one form):
 *   - "Book a day"    — pay for one day or prepay a week (the primary flow).
 *   - "Weekly hold"   — request a recurring standing reservation. Unlocks only
 *                       AFTER the truck has paid for a rental here at least once
 *                       (hasPriorPaidRental); disabled with an explainer before
 *                       that. Pending approved-occurrence payments live here too.
 */
interface SpotRow {
  id: string
  label: string
  max_length_ft: number | null
  power: 'shore' | 'generator_ok' | 'none'
  has_water: boolean
  base_price_cents: number
  recurring_eligible: boolean
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface PendingOccurrence {
  id: string
  bookingDate: string
  spotLabel: string | null
  priceCents: number
}

interface BookParkSpotFormProps {
  marketId: string
  vertical: string
  marketName: string
  timezone: string
  spots: SpotRow[]
  scheduleDows: number[]
  pendingOccurrences?: PendingOccurrence[]
  /** C1 — true once the truck has a paid/completed booking at this park.
   *  Gates the "Weekly hold" tab (standing reservations are a reward for a
   *  proven, paying relationship, not a first-touch option). */
  hasPriorPaidRental?: boolean
}

const MIN_TOTAL_CENTS = 500

function toYmd(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Parse a YYYY-MM-DD string into a local-time Date (no UTC shift). */
function fromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDayLabel(ymd: string): string {
  return fromYmd(ymd).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatShort(ymd: string): string {
  return fromYmd(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function powerLabel(power: SpotRow['power']): string {
  switch (power) {
    case 'none': return 'No power'
    case 'generator_ok': return 'Generator allowed'
    case 'shore': return 'Shore power'
  }
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function BookParkSpotForm({
  marketId,
  vertical,
  marketName,
  timezone,
  spots,
  scheduleDows,
  pendingOccurrences = [],
  hasPriorPaidRental = false,
}: BookParkSpotFormProps) {
  const searchParams = useSearchParams()
  const sessionFlag = searchParams.get('session')

  // Next 8 weeks (56 days) of operating dates, in the park's timezone.
  const operatingDates = useMemo<string[]>(() => {
    if (scheduleDows.length === 0) return []
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
    const today = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate())
    const dates: string[] = []
    for (let i = 0; i < 56; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      if (scheduleDows.includes(d.getDay())) dates.push(toYmd(d))
    }
    return dates
  }, [scheduleDows, timezone])

  // Group operating dates by their Sunday-week key, preserving order.
  const weeks = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const ymd of operatingDates) {
      const dt = fromYmd(ymd)
      const sunday = new Date(dt)
      sunday.setDate(dt.getDate() - dt.getDay())
      const key = toYmd(sunday)
      const arr = map.get(key)
      if (arr) arr.push(ymd)
      else map.set(key, [ymd])
    }
    return Array.from(map.entries()).map(([key, dates]) => ({ key, dates }))
  }, [operatingDates])

  const [selectedSpotId, setSelectedSpotId] = useState<string>(spots[0]?.id ?? '')
  const [mode, setMode] = useState<'single' | 'week'>('single')
  const [selectedDate, setSelectedDate] = useState<string>(operatingDates[0] ?? '')
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>(weeks[0]?.key ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Which action tab is active — 'book' (pay for a day) or 'hold' (standing request).
  const [activeTab, setActiveTab] = useState<'book' | 'hold'>('book')
  // Vendor's acceptance of the park's opt-in agreement — gates both booking
  // and the recurring-hold request. MarketAgreementBlock auto-accepts when the
  // operator has selected no statements, so unconfigured parks aren't blocked.
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  // B1 — park compliance acknowledgment: doc-responsibility + info-sharing
  // consent. Required to book; the docs themselves are NOT required at booking
  // (book-then-vet). Also gates the recurring-hold request.
  const [docAckAccepted, setDocAckAccepted] = useState(false)

  // Recurring weekly-hold request (P4a) — independent of the pay/booking flow.
  const [recurringDow, setRecurringDow] = useState<number>(scheduleDows[0] ?? 0)
  const [recurringSubmitting, setRecurringSubmitting] = useState(false)
  const [recurringMessage, setRecurringMessage] = useState<string | null>(null)
  const [recurringError, setRecurringError] = useState<string | null>(null)

  // Pay-to-keep for approved recurring occurrences (P4b) — per-row Stripe checkout.
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payError, setPayError] = useState<{ id: string; message: string } | null>(null)

  const selectedSpot = useMemo(
    () => spots.find((s) => s.id === selectedSpotId) ?? null,
    [spots, selectedSpotId]
  )

  const selectedDates = useMemo<string[]>(() => {
    if (mode === 'single') return selectedDate ? [selectedDate] : []
    return weeks.find((w) => w.key === selectedWeekKey)?.dates ?? []
  }, [mode, selectedDate, selectedWeekKey, weeks])

  const perDayCents = selectedSpot
    ? calculateBoothRentalFees(selectedSpot.base_price_cents).vendorPaysCents
    : 0
  const totalCents = perDayCents * selectedDates.length
  const belowMinimum = totalCents < MIN_TOTAL_CENTS

  const docsHref = `/${vertical}/vendor/edit`

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (!selectedSpotId) {
      setError('Please pick a spot.')
      return
    }
    if (selectedDates.length === 0) {
      setError('Please pick at least one day.')
      return
    }
    if (belowMinimum) {
      setError('Minimum booking is $5 — add more days.')
      return
    }
    if (!agreementAccepted) {
      setError("Please accept the park's agreement before booking.")
      return
    }
    if (!docAckAccepted) {
      setError('Please confirm the compliance acknowledgment before booking.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/vendor/markets/${marketId}/book-park-spot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spot_id: selectedSpotId,
          booking_dates: selectedDates,
          doc_ack_accepted: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not start checkout. Please try again.')
        setSubmitting(false)
        return
      }
      if (typeof data.url === 'string' && data.url.length > 0) {
        window.location.href = data.url
        return
      }
      setError('Something went wrong setting up your payment. Please try again.')
      setSubmitting(false)
    } catch {
      setError('Network error — please try again.')
      setSubmitting(false)
    }
  }

  const handleRecurringRequest = async () => {
    if (recurringSubmitting) return
    setRecurringError(null)
    setRecurringMessage(null)
    if (!selectedSpotId) {
      setRecurringError('Please pick a spot.')
      return
    }
    if (!agreementAccepted) {
      setRecurringError("Please accept the park's agreement before requesting.")
      return
    }
    if (!docAckAccepted) {
      setRecurringError('Please confirm the compliance acknowledgment before requesting.')
      return
    }
    setRecurringSubmitting(true)
    try {
      const res = await fetch(`/api/vendor/markets/${marketId}/standing-reservation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spot_id: selectedSpotId, day_of_week: recurringDow, doc_ack_accepted: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRecurringError(data.error || 'Could not send your request. Please try again.')
        return
      }
      setRecurringMessage('✓ Requested — the park operator will review it.')
    } catch {
      setRecurringError('Network error — please try again.')
    } finally {
      setRecurringSubmitting(false)
    }
  }

  const handlePay = async (occId: string) => {
    if (payingId) return
    setPayError(null)
    setPayingId(occId)
    try {
      const res = await fetch(`/api/vendor/park-occurrences/${occId}/pay`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPayError({ id: occId, message: data.error || 'Could not start checkout. Please try again.' })
        setPayingId(null)
        return
      }
      if (typeof data.url === 'string' && data.url.length > 0) {
        window.location.href = data.url
        return
      }
      setPayError({ id: occId, message: 'Something went wrong setting up your payment. Please try again.' })
      setPayingId(null)
    } catch {
      setPayError({ id: occId, message: 'Network error — please try again.' })
      setPayingId(null)
    }
  }

  const holdEligibleSpot = !!(selectedSpot?.recurring_eligible && scheduleDows.length > 0)

  return (
    <>
      {/* C2 — post-payment success state (keyed off the Stripe redirect). */}
      {sessionFlag === 'success' && (
        <div style={{
          padding: spacing.md,
          marginBottom: spacing.md,
          backgroundColor: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: radius.md,
        }}>
          <div style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: '#155724', marginBottom: spacing['3xs'] }}>
            Booking confirmed — you&apos;re set for your spot.
          </div>
          <div style={{ fontSize: typography.sizes.sm, color: '#155724', marginBottom: spacing.sm, lineHeight: 1.5 }}>
            Your payment went through and your spot is booked. Next: make sure your required
            documents (licenses, permits, insurance) are uploaded and current before your rented
            day — the park operator reviews them once they&apos;re on file.
          </div>
          <a
            href={docsHref}
            style={{
              display: 'inline-block',
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: colors.primary,
              color: 'white',
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              textDecoration: 'none',
            }}
          >
            Upload your required documents →
          </a>
        </div>
      )}
      {sessionFlag === 'cancel' && (
        <div style={{
          padding: spacing.sm,
          marginBottom: spacing.md,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          backgroundColor: colors.surfaceBase,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.sm,
        }}>
          Checkout cancelled.
        </div>
      )}

      <div
        style={{
          padding: spacing.md,
          backgroundColor: colors.surfaceElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
        }}
      >
        {/* Spot picker — shared by both booking a day and requesting a hold. */}
        <div style={{ marginBottom: spacing.md }}>
          <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.xs }}>
            Pick a spot
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            {spots.map((spot) => {
              const selected = spot.id === selectedSpotId
              return (
                <label
                  key={spot.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: spacing.sm,
                    padding: spacing.sm,
                    border: `1px solid ${selected ? colors.primary : colors.border}`,
                    borderRadius: radius.sm,
                    backgroundColor: selected ? colors.surfaceBase : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="spot"
                    value={spot.id}
                    checked={selected}
                    onChange={() => setSelectedSpotId(spot.id)}
                    disabled={submitting}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                      {spot.label}
                    </div>
                    <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                      {[
                        spot.max_length_ft ? `Fits up to ${spot.max_length_ft} ft` : null,
                        powerLabel(spot.power),
                        spot.has_water ? 'Water' : null,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, whiteSpace: 'nowrap' }}>
                    {formatPrice(spot.base_price_cents)}/day
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Park agreement — the vendor accepts the operator's opt-in statements
            before booking OR requesting a recurring hold (mirrors the FM booth
            flow). Renders nothing + auto-accepts if the park selected none. */}
        <MarketAgreementBlock marketId={marketId} onChange={setAgreementAccepted} />

        {/* B1 — park compliance acknowledgment (doc responsibility + info-sharing
            consent). Required to book/request; docs are NOT required at booking. */}
        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: spacing.xs,
          padding: spacing.sm,
          marginBottom: spacing.xs,
          backgroundColor: colors.surfaceBase,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.sm,
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={docAckAccepted}
            onChange={(e) => setDocAckAccepted(e.target.checked)}
            style={{ marginTop: 3, width: 18, height: 18, cursor: 'pointer' }}
          />
          <span style={{ fontSize: typography.sizes.sm, color: colors.textPrimary, lineHeight: 1.4 }}>
            I understand it&apos;s my responsibility to upload every document this park requires
            (licenses, permits, insurance), keep them unexpired, and make sure they&apos;re valid
            before my rented time begins — this is a requirement of the park. If my documents are
            missing, expired, inaccurate, or not provided before my booking starts, the operator may
            cancel my booking <strong>without a refund</strong> and may decline my future bookings
            here. I authorize this park to view my compliance documents.
          </span>
        </label>

        {/* C3a — where required docs live, surfaced BEFORE paying so a truck can
            check what's needed. Uploading isn't required to book (book-then-vet). */}
        <div style={{ marginBottom: spacing.md }}>
          <a href={docsHref} style={{ fontSize: typography.sizes.sm, color: colors.primary, textDecoration: 'underline', fontWeight: typography.weights.semibold }}>
            See the documents this park requires and upload them →
          </a>
          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
            You can book now and upload after — but your docs must be current before your rented day.
          </div>
        </div>

        {/* Tab selector — decouple paying for a day from requesting a standing hold. */}
        <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md, borderBottom: `1px solid ${colors.border}` }}>
          {([['book', 'Book a day'], ['hold', 'Weekly hold']] as const).map(([key, label]) => {
            const active = activeTab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${active ? colors.primary : 'transparent'}`,
                  color: active ? colors.textPrimary : colors.textMuted,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* ── Book a day ─────────────────────────────────────────────────── */}
        {activeTab === 'book' && (
          <form onSubmit={handleSubmit}>
            {/* Booking mode toggle */}
            <div style={{ marginBottom: spacing.md }}>
              <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.xs }}>
                Booking
              </div>
              <div style={{ display: 'flex', gap: spacing.xs }}>
                {(['single', 'week'] as const).map((m) => {
                  const active = mode === m
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      disabled={submitting}
                      style={{
                        flex: 1,
                        padding: `${spacing.xs} ${spacing.sm}`,
                        fontSize: typography.sizes.sm,
                        fontWeight: typography.weights.semibold,
                        color: active ? 'white' : colors.textPrimary,
                        backgroundColor: active ? colors.primary : colors.surfaceBase,
                        border: `1px solid ${active ? colors.primary : colors.border}`,
                        borderRadius: radius.sm,
                        cursor: submitting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {m === 'single' ? 'Single day' : 'Prepay a week'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Date picker */}
            {operatingDates.length === 0 ? (
              <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.md }}>
                No operating days are scheduled in the next 8 weeks.
              </div>
            ) : mode === 'single' ? (
              <label style={{ display: 'block', marginBottom: spacing.md }}>
                <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing['2xs'] }}>
                  Day
                </div>
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
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
                  {operatingDates.map((d) => (
                    <option key={d} value={d}>{formatDayLabel(d)}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div style={{ marginBottom: spacing.md }}>
                <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.xs }}>
                  Week
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  {weeks.map((w) => {
                    const selected = w.key === selectedWeekKey
                    const first = w.dates[0]
                    const last = w.dates[w.dates.length - 1]
                    const range = first === last ? formatShort(first) : `${formatShort(first)} – ${formatShort(last)}`
                    return (
                      <label
                        key={w.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.sm,
                          padding: spacing.sm,
                          border: `1px solid ${selected ? colors.primary : colors.border}`,
                          borderRadius: radius.sm,
                          backgroundColor: selected ? colors.surfaceBase : 'transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name="week"
                          value={w.key}
                          checked={selected}
                          onChange={() => setSelectedWeekKey(w.key)}
                          disabled={submitting}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>
                            {range}
                          </div>
                          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                            {w.dates.length} day{w.dates.length === 1 ? '' : 's'}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Total */}
            {selectedSpot && selectedDates.length > 0 && (
              <div style={{
                padding: spacing.sm,
                backgroundColor: colors.surfaceBase,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                marginBottom: spacing.md,
              }}>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing['3xs'] }}>
                  You pay
                </div>
                <div style={{
                  fontSize: typography.sizes['2xl'],
                  fontWeight: typography.weights.bold,
                  color: colors.textPrimary,
                  lineHeight: 1.1,
                }}>
                  {formatPrice(totalCents)}
                  <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.normal, color: colors.textMuted }}>
                    {' '}({selectedDates.length} day{selectedDates.length === 1 ? '' : 's'})
                  </span>
                </div>
                {belowMinimum && (
                  <div style={{ fontSize: typography.sizes.xs, color: '#856404', marginTop: spacing['3xs'] }}>
                    Minimum booking is $5 — add more days.
                  </div>
                )}
              </div>
            )}

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
              disabled={submitting || belowMinimum || selectedDates.length === 0 || !agreementAccepted || !docAckAccepted}
              style={{
                padding: `${spacing.sm} ${spacing.md}`,
                backgroundColor: colors.primary,
                color: 'white',
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold,
                cursor: (submitting || belowMinimum || selectedDates.length === 0 || !agreementAccepted || !docAckAccepted) ? 'not-allowed' : 'pointer',
                opacity: (submitting || belowMinimum || selectedDates.length === 0 || !agreementAccepted || !docAckAccepted) ? 0.6 : 1,
              }}
            >
              {submitting ? 'Starting checkout…' : `Book & pay at ${marketName}`}
            </button>
          </form>
        )}

        {/* ── Weekly hold ────────────────────────────────────────────────── */}
        {activeTab === 'hold' && (
          <div>
            {/* Approved occurrences awaiting payment (P4b) — belong with the
                standing-hold concept, so they live on this tab. */}
            {pendingOccurrences.length > 0 && (
              <div style={{
                padding: spacing.md,
                marginBottom: spacing.md,
                backgroundColor: colors.surfaceElevated,
                border: `2px solid ${colors.primary}`,
                borderRadius: radius.md,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}>
                <div style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: colors.textPrimary, marginBottom: spacing['3xs'] }}>
                  Pay to keep your recurring spot{pendingOccurrences.length === 1 ? '' : 's'}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm }}>
                  These weekly holds are approved and waiting on payment. Pay now to lock in each date.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  {pendingOccurrences.map((occ) => (
                    <div key={occ.id}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: spacing.sm,
                        padding: spacing.sm,
                        backgroundColor: colors.surfaceBase,
                        border: `1px solid ${colors.border}`,
                        borderRadius: radius.sm,
                        flexWrap: 'wrap',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                            {occ.spotLabel || 'Your spot'} · {formatDayLabel(occ.bookingDate)}
                          </div>
                          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                            from {formatPrice(occ.priceCents)} (fees added at checkout)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePay(occ.id)}
                          disabled={payingId === occ.id}
                          style={{
                            padding: `${spacing.xs} ${spacing.md}`,
                            backgroundColor: colors.primary,
                            color: 'white',
                            border: 'none',
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.sm,
                            fontWeight: typography.weights.semibold,
                            cursor: payingId === occ.id ? 'not-allowed' : 'pointer',
                            opacity: payingId === occ.id ? 0.6 : 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {payingId === occ.id ? 'Starting…' : 'Pay now'}
                        </button>
                      </div>
                      {payError?.id === occ.id && (
                        <div style={{ fontSize: typography.sizes.xs, color: '#721c24', marginTop: spacing['3xs'] }}>
                          {payError.message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* C1 — the request itself unlocks only after a paid rental here. */}
            {!hasPriorPaidRental ? (
              <div style={{ padding: spacing.md, backgroundColor: colors.surfaceBase, border: `1px dashed ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, color: colors.textMuted, lineHeight: 1.5 }}>
                <strong style={{ color: colors.textPrimary }}>Weekly holds unlock after your first paid booking here.</strong>
                {' '}Book a day on the <strong>Book a day</strong> tab first. Once you&apos;ve rented at
                this park, you can ask the operator to reserve your spot every week.
              </div>
            ) : !holdEligibleSpot ? (
              <div style={{ padding: spacing.md, backgroundColor: colors.surfaceBase, border: `1px dashed ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                This spot isn&apos;t available for weekly holds. Pick a different spot above.
              </div>
            ) : (
              <div style={{
                padding: spacing.sm,
                border: `1px dashed ${colors.border}`,
                borderRadius: radius.sm,
                backgroundColor: colors.surfaceBase,
              }}>
                <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing['3xs'] }}>
                  Request a weekly hold
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing.xs }}>
                  Ask the park to reserve this spot for you every week. This is separate from paying
                  for a single day — it doesn&apos;t charge you now; the operator reviews and approves
                  it, then you pay each week&apos;s date.
                </div>
                <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <label style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing['3xs'] }}>
                      Day of week
                    </div>
                    <select
                      value={recurringDow}
                      onChange={(e) => setRecurringDow(Number(e.target.value))}
                      disabled={recurringSubmitting}
                      style={{
                        width: '100%',
                        padding: spacing.xs,
                        fontSize: typography.sizes.sm,
                        border: `1px solid ${colors.border}`,
                        borderRadius: radius.sm,
                        backgroundColor: colors.surfaceElevated,
                        color: colors.textPrimary,
                      }}
                    >
                      {scheduleDows.map((d) => (
                        <option key={d} value={d}>{WEEKDAYS[d] ?? `Day ${d}`}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={handleRecurringRequest}
                    disabled={recurringSubmitting || !agreementAccepted || !docAckAccepted}
                    style={{
                      padding: `${spacing.xs} ${spacing.md}`,
                      backgroundColor: colors.primary,
                      color: 'white',
                      border: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.sm,
                      fontWeight: typography.weights.semibold,
                      cursor: (recurringSubmitting || !agreementAccepted || !docAckAccepted) ? 'not-allowed' : 'pointer',
                      opacity: (recurringSubmitting || !agreementAccepted || !docAckAccepted) ? 0.6 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {recurringSubmitting ? 'Sending…' : 'Request weekly hold'}
                  </button>
                </div>
                {recurringMessage && (
                  <div style={{ fontSize: typography.sizes.sm, color: '#155724', marginTop: spacing.xs }}>
                    {recurringMessage}
                  </div>
                )}
                {recurringError && (
                  <div style={{ fontSize: typography.sizes.sm, color: '#721c24', marginTop: spacing.xs }}>
                    {recurringError}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
