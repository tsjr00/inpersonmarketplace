'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  order_id: string
  orders: {
    id: string
    order_number: string
    created_at: string
  } | null
}

interface ReviewSummary {
  averageRating: number | null
  totalReviews: number
  newReviewsCount: number
}

export default function VendorReviewsPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string

  const [reviews, setReviews] = useState<Review[]>([])
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchReviews()
  }, [vertical])

  const fetchReviews = async () => {
    try {
      const response = await fetch(`/api/vendor/reviews?vertical=${vertical}`)
      if (!response.ok) {
        if (response.status === 401) {
          router.push(`/${vertical}/login`)
          return
        }
        throw new Error('Failed to fetch reviews')
      }
      const data = await response.json()
      setReviews(data.reviews || [])
      setSummary(data.summary || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews')
    } finally {
      setLoading(false)
    }
  }

  const renderStars = (rating: number) => {
    return (
      <div style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            style={{
              fontSize: typography.sizes.lg,
              color: star <= rating ? '#f59e0b' : '#d1d5db'
            }}
          >
            ★
          </span>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase
      }}>
        <p style={{ color: colors.textSecondary }}>Loading reviews...</p>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      color: colors.textPrimary
    }}>
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        padding: `${spacing.md} ${spacing.sm}`
      }}>
        {/* Header */}
        <div style={{
          marginBottom: spacing.md,
          paddingBottom: spacing.sm,
          borderBottom: `2px solid ${colors.primary}`
        }}>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              color: colors.textMuted,
              textDecoration: 'none',
              fontSize: typography.sizes.sm,
              display: 'inline-block',
              marginBottom: spacing.xs
            }}
          >
            ← Back to Dashboard
          </Link>
          <h1 style={{
            color: colors.primary,
            margin: 0,
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold
          }}>
            Customer Reviews
          </h1>
        </div>

        {error && (
          <div style={{
            padding: spacing.sm,
            marginBottom: spacing.md,
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: radius.md,
            color: '#991b1b'
          }}>
            {error}
          </div>
        )}

        {/* Summary Card */}
        {summary && (
          <div style={{
            padding: spacing.md,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            marginBottom: spacing.md,
            boxShadow: shadows.sm
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.lg,
              flexWrap: 'wrap'
            }}>
              {/* Average Rating */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: typography.sizes['3xl'],
                  fontWeight: typography.weights.bold,
                  color: colors.primary
                }}>
                  {summary.averageRating ? summary.averageRating.toFixed(1) : '—'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: spacing['2xs'] }}>
                  {renderStars(Math.round(summary.averageRating || 0))}
                </div>
                <div style={{
                  fontSize: typography.sizes.sm,
                  color: colors.textMuted,
                  marginTop: spacing['2xs']
                }}>
                  Average Rating
                </div>
              </div>

              {/* Stats */}
              <div style={{
                display: 'flex',
                gap: spacing.lg,
                flex: 1,
                justifyContent: 'center'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: typography.sizes['2xl'],
                    fontWeight: typography.weights.bold,
                    color: colors.textPrimary
                  }}>
                    {summary.totalReviews}
                  </div>
                  <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
                    Total Reviews
                  </div>
                </div>
                {summary.newReviewsCount > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: typography.sizes['2xl'],
                      fontWeight: typography.weights.bold,
                      color: colors.primary
                    }}>
                      {summary.newReviewsCount}
                    </div>
                    <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
                      New This Week
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reviews List */}
        {reviews.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {reviews.map((review) => (
              <div
                key={review.id}
                style={{
                  padding: spacing.md,
                  backgroundColor: colors.surfaceElevated,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.md,
                  boxShadow: shadows.sm
                }}
              >
                {/* Review Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: spacing.sm,
                  flexWrap: 'wrap',
                  gap: spacing.xs
                }}>
                  <div>
                    {renderStars(review.rating)}
                    <div style={{
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                      marginTop: spacing['3xs']
                    }}>
                      {new Date(review.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                  </div>
                  {review.orders && (
                    <div style={{
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                      backgroundColor: colors.surfaceMuted,
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      borderRadius: radius.sm
                    }}>
                      Order #{review.orders.order_number || review.order_id.slice(0, 8)}
                    </div>
                  )}
                </div>

                {/* Review Comment */}
                {review.comment ? (
                  <p style={{
                    margin: 0,
                    fontSize: typography.sizes.base,
                    color: colors.textPrimary,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap'
                  }}>
                    &ldquo;{review.comment}&rdquo;
                  </p>
                ) : (
                  <p style={{
                    margin: 0,
                    fontSize: typography.sizes.sm,
                    color: colors.textMuted,
                    fontStyle: 'italic'
                  }}>
                    No written feedback provided
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: spacing['3xl'],
            backgroundColor: colors.surfaceElevated,
            border: `1px dashed ${colors.border}`,
            borderRadius: radius.md,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 48, marginBottom: spacing.sm, opacity: 0.5 }}>⭐</div>
            <h3 style={{
              margin: `0 0 ${spacing.xs} 0`,
              color: colors.textSecondary,
              fontSize: typography.sizes.lg
            }}>
              No Reviews Yet
            </h3>
            <p style={{
              margin: 0,
              color: colors.textMuted,
              fontSize: typography.sizes.base
            }}>
              Reviews will appear here after customers complete orders and leave feedback.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
