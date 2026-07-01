'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { calculateBoothRentalFees } from '@/lib/pricing'

/**
 * Vendor food-truck park-spot booking form (FT-only).
 *
 * Client component rendered by /[vertical]/markets/[id]/book-spot. The
 * server page does all the park-readiness checks; this form collects a
 * spot, a booking mode (single day vs prepay a week), and the day(s),
 * then posts to the booking API which returns a Stripe Checkout URL.
 */
interface SpotRow {
  id: string
  label: string
  max_length_ft: number | null
  power: 'shore' | 'generator_ok' | 'none'
  has_water: boolean
  base_price_cents: number
}

interface BookParkSpotFormProps {
  marketId: string
  vertical: string
  marketName: string
  timezone: string
  spots: SpotRow[]
  scheduleDows: number[]
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
  marketName,
  timezone,
  spots,
  scheduleDows,
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

    setSubmitting(true)
    try {
      const res = await fetch(`/api/vendor/markets/${marketId}/book-park-spot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spot_id: selectedSpotId,
          booking_dates: selectedDates,
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
      {sessionFlag === 'success' && (
        <div style={{
          padding: spacing.sm,
          marginBottom: spacing.md,
          fontSize: typography.sizes.sm,
          color: '#155724',
          backgroundColor: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: radius.sm,
        }}>
          Booking confirmed — you&apos;re set for your spot.
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

      {/* Spot picker */}
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
        disabled={submitting || belowMinimum || selectedDates.length === 0}
        style={{
          padding: `${spacing.sm} ${spacing.md}`,
          backgroundColor: colors.primary,
          color: 'white',
          border: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          cursor: (submitting || belowMinimum || selectedDates.length === 0) ? 'not-allowed' : 'pointer',
          opacity: (submitting || belowMinimum || selectedDates.length === 0) ? 0.6 : 1,
        }}
      >
        {submitting ? 'Starting checkout…' : `Book & pay at ${marketName}`}
      </button>
    </form>
  )
}
