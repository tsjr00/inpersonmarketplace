'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import Toast, { type ToastType } from '@/components/shared/Toast'

interface UnratedOrder {
  id: string
  order_number: string
  created_at: string
  total_cents: number
  unrated_vendors: Array<{
    id: string
    name: string
  }>
}

interface RateOrderCardProps {
  vertical: string
}

export default function RateOrderCard({ vertical }: RateOrderCardProps) {
  const [orders, setOrders] = useState<UnratedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [ratingOrder, setRatingOrder] = useState<UnratedOrder | null>(null)
  const [ratingVendor, setRatingVendor] = useState<{ id: string; name: string } | null>(null)
  const [selectedRating, setSelectedRating] = useState<number>(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  useEffect(() => {
    fetchUnratedOrders()
  }, [])

  const fetchUnratedOrders = async () => {
    try {
      const res = await fetch('/api/buyer/orders/unrated')
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders || [])
      }
    } catch (err) {
      console.error('Error fetching unrated orders:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitRating = async () => {
    if (!ratingOrder || !ratingVendor || selectedRating === 0) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/buyer/orders/${ratingOrder.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: selectedRating,
          comment: comment.trim() || undefined,
          vendor_profile_id: ratingVendor.id
        })
      })

      if (res.ok) {
        // Close modal and refresh list
        setRatingOrder(null)
        setRatingVendor(null)
        setSelectedRating(0)
        setComment('')
        fetchUnratedOrders()
      } else {
        const data = await res.json()
        setToast({ message: data.error || 'Failed to submit rating', type: 'error' })
      }
    } catch (err) {
      setToast({ message: 'Failed to submit rating', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null
  if (orders.length === 0) return null

  // Get the first unrated order/vendor combo
  const firstOrder = orders[0]
  const firstVendor = firstOrder?.unrated_vendors[0]

  return (
    <>
      {/* Rate Order Card */}
      <div
        onClick={() => {
          if (firstOrder && firstVendor) {
            setRatingOrder(firstOrder)
            setRatingVendor(firstVendor)
          }
        }}
        style={{
          padding: spacing.md,
          backgroundColor: '#fef3c7',
          border: '2px solid #f59e0b',
          borderRadius: radius.lg,
          cursor: 'pointer',
          transition: 'box-shadow 0.2s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
          <span style={{ fontSize: typography.sizes['2xl'] }}>⭐</span>
          <h3 style={{
            margin: 0,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: '#92400e'
          }}>
            Rate Your Recent Order
          </h3>
          {orders.length > 1 && (
            <span style={{
              backgroundColor: '#f59e0b',
              color: 'white',
              padding: `${spacing['3xs']} ${spacing.xs}`,
              borderRadius: radius.full,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.bold
            }}>
              {orders.length}
            </span>
          )}
        </div>
        <p style={{
          margin: 0,
          fontSize: typography.sizes.sm,
          color: '#92400e'
        }}>
          How was your order from <strong>{firstVendor?.name}</strong>? Tap to rate.
        </p>
      </div>

      {/* Rating Modal */}
      {ratingOrder && ratingVendor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.md,
            zIndex: 1000
          }}
          onClick={() => {
            setRatingOrder(null)
            setRatingVendor(null)
            setSelectedRating(0)
            setComment('')
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: radius.lg,
              maxWidth: 400,
              width: '100%',
              boxShadow: shadows.xl
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: spacing.lg,
              borderBottom: `1px solid ${colors.border}`,
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '3rem', display: 'block', marginBottom: spacing.xs }}>⭐</span>
              <h2 style={{
                margin: 0,
                fontSize: typography.sizes.xl,
                fontWeight: typography.weights.bold,
                color: colors.textPrimary
              }}>
                Rate {ratingVendor.name}
              </h2>
              <p style={{
                margin: `${spacing.xs} 0 0`,
                fontSize: typography.sizes.sm,
                color: colors.textMuted
              }}>
                Order {ratingOrder.order_number}
              </p>
            </div>

            {/* Rating Stars */}
            <div style={{ padding: spacing.lg }}>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: spacing.sm,
                marginBottom: spacing.md
              }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setSelectedRating(star)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '2.5rem',
                      cursor: 'pointer',
                      padding: spacing['2xs'],
                      opacity: star <= selectedRating ? 1 : 0.3,
                      transform: star <= selectedRating ? 'scale(1.1)' : 'scale(1)',
                      transition: 'all 0.15s ease'
                    }}
                    aria-label={`${star} star${star !== 1 ? 's' : ''}`}
                  >
                    ⭐
                  </button>
                ))}
              </div>

              <p style={{
                textAlign: 'center',
                fontSize: typography.sizes.sm,
                color: colors.textSecondary,
                marginBottom: spacing.md
              }}>
                {selectedRating === 0 && 'Tap a star to rate'}
                {selectedRating === 1 && 'Poor'}
                {selectedRating === 2 && 'Fair'}
                {selectedRating === 3 && 'Good'}
                {selectedRating === 4 && 'Very Good'}
                {selectedRating === 5 && 'Excellent!'}
              </p>

              {/* Optional Comment */}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment (optional)"
                rows={3}
                style={{
                  width: '100%',
                  padding: spacing.sm,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.md,
                  fontSize: typography.sizes.base,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Actions */}
            <div style={{
              padding: spacing.md,
              borderTop: `1px solid ${colors.border}`,
              display: 'flex',
              gap: spacing.sm
            }}>
              <button
                onClick={() => {
                  setRatingOrder(null)
                  setRatingVendor(null)
                  setSelectedRating(0)
                  setComment('')
                }}
                style={{
                  flex: 1,
                  padding: spacing.sm,
                  backgroundColor: colors.surfaceMuted,
                  color: colors.textSecondary,
                  border: 'none',
                  borderRadius: radius.md,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.medium,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRating}
                disabled={selectedRating === 0 || submitting}
                style={{
                  flex: 1,
                  padding: spacing.sm,
                  backgroundColor: selectedRating === 0 || submitting ? colors.textMuted : '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: radius.md,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  cursor: selectedRating === 0 || submitting ? 'not-allowed' : 'pointer'
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Rating'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}
