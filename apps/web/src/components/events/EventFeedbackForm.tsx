'use client'

import { useState } from 'react'
import { spacing, typography, radius } from '@/lib/design-tokens'

interface EventFeedbackFormProps {
  eventToken: string
  vendors: Array<{ id: string; business_name: string }>
}

export default function EventFeedbackForm({ eventToken, vendors }: EventFeedbackFormProps) {
  const [selectedVendor, setSelectedVendor] = useState('')
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!selectedVendor || rating === 0) {
      setError('Please select a vendor and a rating')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/buyer/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_profile_id: selectedVendor,
          rating,
          comment: comment.trim() || null,
          source: 'event',
          event_token: eventToken,
        })
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to submit feedback')
      }
    } catch {
      setError('Network error — please try again')
    }
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div style={{
        padding: spacing.md,
        backgroundColor: '#f0fdf4',
        border: '1px solid #86efac',
        borderRadius: radius.lg,
        textAlign: 'center',
      }}>
        <p style={{ fontSize: typography.sizes.base, fontWeight: 600, color: '#166534', margin: 0 }}>
          Thank you for your feedback!
        </p>
        <button
          onClick={() => { setSubmitted(false); setRating(0); setComment(''); setSelectedVendor('') }}
          style={{
            marginTop: 10,
            padding: `6px 16px`,
            backgroundColor: 'white',
            color: '#166534',
            border: '1px solid #86efac',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            cursor: 'pointer',
          }}
        >
          Rate another vendor
        </button>
      </div>
    )
  }

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: '#fffbeb',
      border: '1px solid #fbbf24',
      borderRadius: radius.lg,
    }}>
      <h3 style={{ fontSize: typography.sizes.lg, fontWeight: 700, color: '#92400e', margin: `0 0 ${spacing.xs}` }}>
        How was the food?
      </h3>
      <p style={{ fontSize: typography.sizes.sm, color: '#78350f', margin: `0 0 ${spacing.sm}` }}>
        Leave a quick review for the vendors you ordered from.
      </p>

      {error && (
        <p style={{ color: '#dc2626', fontSize: typography.sizes.sm, margin: `0 0 ${spacing.xs}` }}>{error}</p>
      )}

      {/* Vendor picker */}
      <select
        value={selectedVendor}
        onChange={e => setSelectedVendor(e.target.value)}
        style={{
          width: '100%',
          padding: `${spacing['2xs']} ${spacing.xs}`,
          border: '1px solid #d1d5db',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          marginBottom: spacing.sm,
          backgroundColor: 'white',
        }}
      >
        <option value="">Select a vendor...</option>
        {vendors.map(v => (
          <option key={v.id} value={v.id}>{v.business_name}</option>
        ))}
      </select>

      {/* Star rating */}
      <div style={{ display: 'flex', gap: 4, marginBottom: spacing.sm }}>
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 28,
              color: star <= (hoverRating || rating) ? '#f59e0b' : '#d1d5db',
              padding: 0,
              lineHeight: 1,
            }}
          >
            ★
          </button>
        ))}
        {rating > 0 && (
          <span style={{ fontSize: typography.sizes.sm, color: '#92400e', alignSelf: 'center', marginLeft: 8 }}>
            {rating}/5
          </span>
        )}
      </div>

      {/* Comment */}
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Tell us about your experience (optional)"
        rows={3}
        style={{
          width: '100%',
          padding: spacing['2xs'],
          border: '1px solid #d1d5db',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          resize: 'vertical',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          marginBottom: spacing.sm,
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={submitting || !selectedVendor || rating === 0}
        style={{
          width: '100%',
          padding: `${spacing['2xs']} ${spacing.sm}`,
          backgroundColor: submitting || !selectedVendor || rating === 0 ? '#d1d5db' : '#f59e0b',
          color: submitting || !selectedVendor || rating === 0 ? '#6b7280' : '#78350f',
          border: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          fontWeight: 600,
          cursor: submitting || !selectedVendor || rating === 0 ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Submitting...' : 'Submit Review'}
      </button>
    </div>
  )
}
