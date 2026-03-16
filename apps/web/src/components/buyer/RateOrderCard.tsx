'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import Toast, { type ToastType } from '@/components/shared/Toast'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

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
  const locale = getClientLocale()
  const [orders, setOrders] = useState<UnratedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [ratingOrder, setRatingOrder] = useState<UnratedOrder | null>(null)
  const [ratingVendor, setRatingVendor] = useState<{ id: string; name: string } | null>(null)
  const [selectedRating, setSelectedRating] = useState<number>(0)
  const [comment, setComment] = useState('')
  const [submitting] = useState(false)
  const [showGoogleReview, setShowGoogleReview] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  useEffect(() => {
    fetchUnratedOrders()
  }, [])

  const fetchUnratedOrders = async () => {
    try {
      const res = await fetch(`/api/buyer/orders/unrated?vertical=${vertical}`)
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

    // Capture values before clearing state
    const orderId = ratingOrder.id
    const rating = selectedRating
    const ratingComment = comment.trim() || undefined
    const vendorId = ratingVendor.id

    // Optimistically show success immediately
    const googlePlaceId = process.env.NEXT_PUBLIC_GOOGLE_PLACE_ID
    if (rating >= 4 && googlePlaceId) {
      setShowGoogleReview(true)
    } else {
      setRatingOrder(null)
      setRatingVendor(null)
      setSelectedRating(0)
      setComment('')
    }
    // Remove from unrated list immediately
    setOrders(prev => prev.filter(o => o.id !== orderId))

    // Fire API in background
    try {
      const res = await fetch(`/api/buyer/orders/${orderId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment: ratingComment,
          vendor_profile_id: vendorId
        })
      })

      if (!res.ok) {
        const data = await res.json()
        setToast({ message: data.error || t('feedback.failed', locale), type: 'error' })
        fetchUnratedOrders()
      }
    } catch {
      setToast({ message: t('feedback.failed', locale), type: 'error' })
      fetchUnratedOrders()
    }
  }

  if (loading) return null
  if (orders.length === 0) return null

  // Get the first unrated order/vendor combo
  const firstOrder = orders[0]
  const firstVendor = firstOrder?.unrated_vendors[0]

  const ratingLabels: Record<number, string> = {
    0: t('review.tap_star', locale),
    1: t('review.poor', locale),
    2: t('review.fair', locale),
    3: t('review.good', locale),
    4: t('review.very_good', locale),
    5: t('review.excellent', locale),
  }

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
            {t('review.rate_order', locale)}
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
          {t('review.how_was', locale, { vendor: firstVendor?.name || '' })}
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
            setShowGoogleReview(false)
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
            {showGoogleReview ? (
              <>
                {/* Google Review Prompt */}
                <div style={{
                  padding: spacing.lg,
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: spacing.xs }}>🎉</div>
                  <h2 style={{
                    margin: 0,
                    fontSize: typography.sizes.xl,
                    fontWeight: typography.weights.bold,
                    color: colors.textPrimary
                  }}>
                    {t('review.thanks_great', locale)}
                  </h2>
                  <p style={{
                    margin: `${spacing.sm} 0 0`,
                    fontSize: typography.sizes.sm,
                    color: colors.textSecondary,
                    lineHeight: 1.5
                  }}>
                    {t('review.google_ask', locale, { vendors: term(vertical, 'vendors', locale).toLowerCase() })}
                  </p>
                </div>
                <div style={{
                  padding: spacing.md,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: spacing.sm
                }}>
                  <a
                    href={`https://search.google.com/local/writereview?placeid=${process.env.NEXT_PUBLIC_GOOGLE_PLACE_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: spacing.xs,
                      padding: spacing.sm,
                      backgroundColor: '#4285f4',
                      color: 'white',
                      border: 'none',
                      borderRadius: radius.md,
                      fontSize: typography.sizes.base,
                      fontWeight: typography.weights.semibold,
                      textDecoration: 'none',
                      minHeight: 48,
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      setRatingOrder(null)
                      setRatingVendor(null)
                      setSelectedRating(0)
                      setComment('')
                      setShowGoogleReview(false)
                    }}
                  >
                    {t('review.google_btn', locale)}
                  </a>
                  <button
                    onClick={() => {
                      setRatingOrder(null)
                      setRatingVendor(null)
                      setSelectedRating(0)
                      setComment('')
                      setShowGoogleReview(false)
                    }}
                    style={{
                      padding: spacing.sm,
                      backgroundColor: 'transparent',
                      color: colors.textMuted,
                      border: 'none',
                      fontSize: typography.sizes.sm,
                      cursor: 'pointer'
                    }}
                  >
                    {t('review.not_now', locale)}
                  </button>
                </div>
              </>
            ) : (
              <>
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
                    {t('review.rate_vendor', locale, { vendor: ratingVendor.name })}
                  </h2>
                  <p style={{
                    margin: `${spacing.xs} 0 0`,
                    fontSize: typography.sizes.sm,
                    color: colors.textMuted
                  }}>
                    {t('review.order_label', locale, { number: ratingOrder.order_number })}
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
                    {ratingLabels[selectedRating] || ''}
                  </p>

                  {/* Optional Comment */}
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={t('review.comment_placeholder', locale)}
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
                    {t('feedback.cancel', locale)}
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
                    {submitting ? t('feedback.submitting', locale) : t('review.submit', locale)}
                  </button>
                </div>
              </>
            )}
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
