'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { spacing, typography, radius } from '@/lib/design-tokens'

interface EventFeedbackFormProps {
  eventToken: string
  isLoggedIn: boolean
}

interface RateableOrder {
  order_id: string
  vendor_profile_id: string
  vendor_name: string
  existing_rating: { rating: number; comment: string | null } | null
}

interface ExistingEventRating {
  rating: number
  comment: string | null
  status: string
}

interface ReviewStateResponse {
  rateable_orders: RateableOrder[]
  event_rating: ExistingEventRating | null
}

// ── Shared star rating sub-component ──────────────────────────────────
function StarRating({
  value,
  onChange,
  disabled = false,
}: {
  value: number
  onChange: (n: number) => void
  disabled?: boolean
}) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => !disabled && onChange(star)}
          onMouseEnter={() => !disabled && setHover(star)}
          onMouseLeave={() => !disabled && setHover(0)}
          disabled={disabled}
          style={{
            background: 'none',
            border: 'none',
            cursor: disabled ? 'default' : 'pointer',
            fontSize: 28,
            color: star <= (hover || value) ? '#f59e0b' : '#d1d5db',
            padding: 0,
            lineHeight: 1,
          }}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
      {value > 0 && (
        <span style={{ fontSize: typography.sizes.sm, color: '#92400e', alignSelf: 'center', marginLeft: 8 }}>
          {value}/5
        </span>
      )}
    </div>
  )
}

// ── Section A: per-vendor rating card ─────────────────────────────────
function VendorRatingCard({ order }: { order: RateableOrder }) {
  const [rating, setRating] = useState(order.existing_rating?.rating || 0)
  const [comment, setComment] = useState(order.existing_rating?.comment || '')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please choose a star rating')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/buyer/orders/${order.order_id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_profile_id: order.vendor_profile_id,
          rating,
          comment: comment.trim() || undefined,
        }),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to submit rating')
      }
    } catch {
      setError('Network error — please try again')
    }
    setSubmitting(false)
  }

  return (
    <div
      style={{
        padding: spacing.sm,
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: radius.md,
        marginBottom: spacing.xs,
      }}
    >
      <p style={{ fontSize: typography.sizes.base, fontWeight: 600, margin: `0 0 ${spacing['2xs']}`, color: '#1f2937' }}>
        {order.vendor_name}
      </p>

      {submitted ? (
        <p style={{ fontSize: typography.sizes.sm, color: '#166534', margin: 0 }}>
          ✓ Review submitted
        </p>
      ) : (
        <>
          {error && (
            <p style={{ color: '#dc2626', fontSize: typography.sizes.sm, margin: `0 0 ${spacing['2xs']}` }}>{error}</p>
          )}
          <div style={{ marginBottom: spacing['2xs'] }}>
            <StarRating value={rating} onChange={setRating} disabled={submitting} />
          </div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Optional — tell us about your experience with this vendor"
            rows={2}
            disabled={submitting}
            style={{
              width: '100%',
              padding: spacing['2xs'],
              border: '1px solid #d1d5db',
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              marginBottom: spacing['2xs'],
            }}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || rating === 0}
            style={{
              padding: `${spacing['2xs']} ${spacing.sm}`,
              backgroundColor: submitting || rating === 0 ? '#d1d5db' : '#f59e0b',
              color: submitting || rating === 0 ? '#6b7280' : '#78350f',
              border: 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: 600,
              cursor: submitting || rating === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Submitting...' : order.existing_rating ? 'Update review' : 'Submit review'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Section B: event-general rating ───────────────────────────────────
function EventOverallRating({
  eventToken,
  existing,
}: {
  eventToken: string
  existing: ExistingEventRating | null
}) {
  const locked = existing?.status && existing.status !== 'pending'
  const [rating, setRating] = useState(existing?.rating || 0)
  const [comment, setComment] = useState(existing?.comment || '')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please choose a star rating')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/buyer/events/${eventToken}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
        }),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to submit rating')
      }
    } catch {
      setError('Network error — please try again')
    }
    setSubmitting(false)
  }

  if (locked) {
    return (
      <div
        style={{
          padding: spacing.sm,
          backgroundColor: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: radius.md,
        }}
      >
        <p style={{ fontSize: typography.sizes.sm, fontWeight: 600, color: '#166534', margin: 0 }}>
          ✓ Thanks for rating this event
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: spacing.sm,
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: radius.md,
      }}
    >
      {submitted ? (
        <p style={{ fontSize: typography.sizes.sm, color: '#166534', margin: 0 }}>
          ✓ Thanks — your feedback will be reviewed before it&apos;s shared with the organizer.
        </p>
      ) : (
        <>
          {error && (
            <p style={{ color: '#dc2626', fontSize: typography.sizes.sm, margin: `0 0 ${spacing['2xs']}` }}>{error}</p>
          )}
          <div style={{ marginBottom: spacing['2xs'] }}>
            <StarRating value={rating} onChange={setRating} disabled={submitting} />
          </div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Optional — share your thoughts on the event (logistics, venue, organization)"
            rows={3}
            disabled={submitting}
            style={{
              width: '100%',
              padding: spacing['2xs'],
              border: '1px solid #d1d5db',
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              marginBottom: spacing['2xs'],
            }}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || rating === 0}
            style={{
              padding: `${spacing['2xs']} ${spacing.sm}`,
              backgroundColor: submitting || rating === 0 ? '#d1d5db' : '#f59e0b',
              color: submitting || rating === 0 ? '#6b7280' : '#78350f',
              border: 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: 600,
              cursor: submitting || rating === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Submitting...' : existing ? 'Update rating' : 'Submit rating'}
          </button>
          <p style={{ fontSize: typography.sizes.xs, color: '#6b7280', margin: `${spacing['2xs']} 0 0` }}>
            Your rating will be reviewed before it&apos;s shared with the organizer.
          </p>
        </>
      )}
    </div>
  )
}

// ── Main container ────────────────────────────────────────────────────
export default function EventFeedbackForm({
  eventToken,
  isLoggedIn,
}: EventFeedbackFormProps) {
  // Initial loading state is derived from isLoggedIn: if the user isn't
  // logged in there is no fetch to wait for, so we skip the loading
  // state entirely. The fetch runs inside an async IIFE so setState
  // calls don't happen synchronously in the effect body (which the
  // react-hooks/set-state-in-effect rule forbids).
  const [state, setState] = useState<ReviewStateResponse | null>(null)
  const [loading, setLoading] = useState(isLoggedIn)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    if (!isLoggedIn) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/buyer/events/${eventToken}/review-state`)
        if (cancelled) return
        if (res.ok) {
          const data: ReviewStateResponse = await res.json()
          if (cancelled) return
          setState(data)
        } else if (res.status === 401) {
          setFetchError('unauth')
        } else {
          setFetchError('generic')
        }
      } catch {
        if (cancelled) return
        setFetchError('network')
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [isLoggedIn, eventToken])

  const panelStyle = {
    padding: spacing.md,
    backgroundColor: '#fffbeb',
    border: '1px solid #fbbf24',
    borderRadius: radius.lg,
  } as const

  const headingStyle = {
    fontSize: typography.sizes.lg,
    fontWeight: 700,
    color: '#92400e',
    margin: `0 0 ${spacing.xs}`,
  } as const

  const subheadingStyle = {
    fontSize: typography.sizes.sm,
    color: '#78350f',
    margin: `0 0 ${spacing.sm}`,
  } as const

  // Not logged in — prompt to log in
  if (!isLoggedIn) {
    return (
      <div style={panelStyle}>
        <h3 style={headingStyle}>How was your experience?</h3>
        <p style={subheadingStyle}>
          <Link
            href={`/${typeof window !== 'undefined' ? window.location.pathname.split('/')[1] || 'farmers_market' : 'farmers_market'}/login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')}`}
            style={{ color: '#92400e', fontWeight: 600 }}
          >
            Log in
          </Link>{' '}
          to rate the event and the vendors you ordered from.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={panelStyle}>
        <p style={{ fontSize: typography.sizes.sm, color: '#78350f', margin: 0 }}>Loading your review options…</p>
      </div>
    )
  }

  if (fetchError === 'unauth') {
    return (
      <div style={panelStyle}>
        <h3 style={headingStyle}>How was your experience?</h3>
        <p style={subheadingStyle}>
          Your session expired.{' '}
          <Link
            href={`/${typeof window !== 'undefined' ? window.location.pathname.split('/')[1] || 'farmers_market' : 'farmers_market'}/login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '')}`}
            style={{ color: '#92400e', fontWeight: 600 }}
          >
            Log in
          </Link>{' '}
          to rate this event.
        </p>
      </div>
    )
  }

  if (fetchError || !state) {
    return (
      <div style={panelStyle}>
        <h3 style={headingStyle}>How was your experience?</h3>
        <p style={subheadingStyle}>Couldn&apos;t load review options. Please refresh the page.</p>
      </div>
    )
  }

  const hasRateableOrders = state.rateable_orders.length > 0

  return (
    <div style={panelStyle}>
      <h3 style={headingStyle}>How was your experience?</h3>
      <p style={subheadingStyle}>
        {hasRateableOrders
          ? 'Rate the vendors you ordered from and let the organizer know how the event itself went.'
          : 'Share how the event itself went — your feedback goes to the organizer.'}
      </p>

      {/* Section A — vendor ratings (only if the user has completed orders) */}
      {hasRateableOrders && (
        <div style={{ marginBottom: spacing.md }}>
          <p
            style={{
              fontSize: typography.sizes.sm,
              fontWeight: 700,
              color: '#92400e',
              margin: `0 0 ${spacing.xs}`,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Rate the vendors you ordered from
          </p>
          {state.rateable_orders.map(order => (
            <VendorRatingCard key={`${order.order_id}:${order.vendor_profile_id}`} order={order} />
          ))}
        </div>
      )}

      {/* Section B — event-general rating (always shown to logged-in users) */}
      <div>
        <p
          style={{
            fontSize: typography.sizes.sm,
            fontWeight: 700,
            color: '#92400e',
            margin: `0 0 ${spacing.xs}`,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          How was the event overall?
        </p>
        <EventOverallRating eventToken={eventToken} existing={state.event_rating} />
      </div>
    </div>
  )
}
