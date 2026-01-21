'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface OrderDetails {
  id: string
  order_number: string
  status: string
  total_cents: number
  created_at: string
  items: Array<{
    title: string
    quantity: number
    subtotal_cents: number
    vendor_name: string
  }>
}

export default function CheckoutSuccessPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const vertical = params.vertical as string
  const orderId = searchParams.get('order')
  const sessionId = searchParams.get('session_id')

  const [order, setOrder] = useState<OrderDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchOrder() {
      try {
        // Try to get order details
        let url = '/api/buyer/orders'
        if (orderId) {
          url = `/api/buyer/orders/${orderId}`
        } else if (sessionId) {
          url = `/api/buyer/orders?session_id=${sessionId}`
        }

        const response = await fetch(url)
        if (response.ok) {
          const data = await response.json()
          setOrder(data.order || data)
        }
      } catch (err) {
        console.error('Failed to fetch order:', err)
        setError('Could not load order details')
      } finally {
        setLoading(false)
      }
    }

    if (orderId || sessionId) {
      fetchOrder()
    } else {
      setLoading(false)
    }
  }, [orderId, sessionId])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: `4px solid ${colors.border}`,
            borderTop: `4px solid ${colors.primary}`,
            borderRadius: radius.full,
            animation: 'spin 1s linear infinite',
            margin: `0 auto ${spacing.sm}`,
          }} />
          <p style={{ color: colors.textSecondary }}>Loading order details...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      padding: spacing.xl,
    }}>
      <div style={{
        maxWidth: containers.lg,
        margin: '0 auto',
      }}>
        {/* Success Banner */}
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          padding: spacing.xl,
          textAlign: 'center',
          marginBottom: spacing.lg,
          boxShadow: shadows.md,
        }}>
          <div style={{
            width: 80,
            height: 80,
            backgroundColor: colors.primaryLight,
            borderRadius: radius.full,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: `0 auto ${spacing.md}`,
            fontSize: 40,
            color: colors.primary,
          }}>
            ✓
          </div>

          <h1 style={{
            margin: `0 0 ${spacing['2xs']} 0`,
            fontSize: typography.sizes['2xl'],
            color: colors.textPrimary,
          }}>
            Order Confirmed!
          </h1>
          <p style={{ color: colors.textSecondary, marginBottom: 0 }}>
            Thank you for your purchase. Your order has been placed successfully.
          </p>
        </div>

        {/* Order Details */}
        {order && (
          <div style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            padding: spacing.md,
            marginBottom: spacing.lg,
            boxShadow: shadows.sm,
          }}>
            <h2 style={{
              marginTop: 0,
              marginBottom: spacing.md,
              fontSize: typography.sizes.lg,
              color: colors.textPrimary,
            }}>
              Order Details
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: spacing.sm,
              marginBottom: spacing.md,
              padding: spacing.sm,
              backgroundColor: colors.surfaceMuted,
              borderRadius: radius.sm,
            }}>
              <div>
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: `0 0 ${spacing['3xs']} 0` }}>Order Number</p>
                <p style={{ fontWeight: typography.weights.semibold, margin: 0, color: colors.textPrimary }}>{order.order_number}</p>
              </div>
              <div>
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: `0 0 ${spacing['3xs']} 0` }}>Date</p>
                <p style={{ fontWeight: typography.weights.semibold, margin: 0, color: colors.textPrimary }}>
                  {new Date(order.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: `0 0 ${spacing['3xs']} 0` }}>Status</p>
                <span style={{
                  display: 'inline-block',
                  padding: `${spacing['3xs']} ${spacing['2xs']}`,
                  backgroundColor: order.status === 'paid' ? colors.primaryLight : colors.surfaceSubtle,
                  color: order.status === 'paid' ? colors.primaryDark : colors.textSecondary,
                  borderRadius: radius.full,
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.semibold,
                }}>
                  {order.status === 'paid' ? 'Paid' : order.status}
                </span>
              </div>
              <div>
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: `0 0 ${spacing['3xs']} 0` }}>Total</p>
                <p style={{ fontWeight: typography.weights.semibold, margin: 0, fontSize: typography.sizes.lg, color: colors.primary }}>
                  ${(order.total_cents / 100).toFixed(2)}
                </p>
              </div>
            </div>

            {order.items && order.items.length > 0 && (
              <>
                <h3 style={{ fontSize: typography.sizes.base, marginBottom: spacing.sm, color: colors.textPrimary }}>Items</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                  {order.items.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: `${spacing.xs} ${spacing.sm}`,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: radius.sm,
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: typography.weights.medium, color: colors.textPrimary }}>{item.title}</p>
                        <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                          {item.vendor_name} • Qty: {item.quantity}
                        </p>
                      </div>
                      <p style={{ margin: 0, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                        ${(item.subtotal_cents / 100).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceSubtle,
            border: `1px solid ${colors.accent}`,
            borderRadius: radius.md,
            color: colors.textSecondary,
            marginBottom: spacing.lg,
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Next Steps */}
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          padding: spacing.md,
          marginBottom: spacing.lg,
          boxShadow: shadows.sm,
        }}>
          <h2 style={{
            marginTop: 0,
            marginBottom: spacing.sm,
            fontSize: typography.sizes.lg,
            color: colors.textPrimary,
          }}>
            What&apos;s Next?
          </h2>
          <ul style={{ margin: 0, paddingLeft: spacing.md, color: colors.textSecondary, lineHeight: typography.leading.loose }}>
            <li>You&apos;ll receive a confirmation email with your order details</li>
            <li>The vendor will be notified of your order</li>
            <li>Pick up your items at the designated market location</li>
            <li>Track your order status in your dashboard</li>
          </ul>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: spacing.sm,
          justifyContent: 'center',
        }}>
          <Link
            href={`/${vertical}/buyer/orders`}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: colors.primary,
              color: colors.textInverse,
              textDecoration: 'none',
              borderRadius: radius.sm,
              fontWeight: typography.weights.semibold,
              boxShadow: shadows.primary,
            }}
          >
            View My Orders
          </Link>
          <Link
            href={`/${vertical}/browse`}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              textDecoration: 'none',
              borderRadius: radius.sm,
              fontWeight: typography.weights.semibold,
              border: `2px solid ${colors.primary}`,
            }}
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  )
}
