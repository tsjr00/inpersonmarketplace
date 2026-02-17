'use client'

import { useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface OrderData {
  order_id: string
  order_number: string
  payment_method: string
  payment_link: string | null
  subtotal_cents: number
  buyer_fee_cents: number
  total_cents: number
  vendor_name: string
}

export default function ExternalCheckoutPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const vertical = params?.vertical as string

  // Derive order data from URL params (passed from checkout)
  const { orderData, error } = useMemo(() => {
    const orderId = searchParams.get('order_id')
    const orderNumber = searchParams.get('order_number')
    const paymentMethod = searchParams.get('payment_method')
    const paymentLink = searchParams.get('payment_link')
    const subtotal = searchParams.get('subtotal')
    const buyerFee = searchParams.get('buyer_fee')
    const total = searchParams.get('total')
    const vendorName = searchParams.get('vendor_name')

    if (!orderId || !orderNumber || !paymentMethod) {
      return { orderData: null, error: 'Missing order information' }
    }

    return {
      orderData: {
        order_id: orderId,
        order_number: orderNumber,
        payment_method: paymentMethod,
        payment_link: paymentLink ? decodeURIComponent(paymentLink) : null,
        subtotal_cents: parseInt(subtotal || '0', 10),
        buyer_fee_cents: parseInt(buyerFee || '0', 10),
        total_cents: parseInt(total || '0', 10),
        vendor_name: vendorName ? decodeURIComponent(vendorName) : 'Vendor'
      } as OrderData,
      error: null
    }
  }, [searchParams])

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'venmo': return 'Venmo'
      case 'cashapp': return 'Cash App'
      case 'paypal': return 'PayPal'
      case 'cash': return 'Cash'
      default: return method
    }
  }

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`
  }

  if (error || !orderData) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: colors.surfaceBase,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.md
      }}>
        <p style={{ color: '#dc2626', marginBottom: spacing.md }}>{error || 'Order not found'}</p>
        <Link
          href={`/${vertical}/checkout`}
          style={{
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: colors.primary,
            color: colors.textInverse,
            textDecoration: 'none',
            borderRadius: radius.md
          }}
        >
          Return to Checkout
        </Link>
      </div>
    )
  }

  const isCash = orderData.payment_method === 'cash'

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      padding: spacing.md
    }}>
      <div style={{
        maxWidth: containers.sm,
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: spacing.lg
        }}>
          <div style={{
            fontSize: '3rem',
            marginBottom: spacing.sm
          }}>
            {isCash ? '💵' : '📱'}
          </div>
          <h1 style={{
            color: colors.primary,
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            margin: `0 0 ${spacing.xs} 0`
          }}>
            {isCash ? 'Order Placed!' : 'Complete Your Payment'}
          </h1>
          <p style={{
            color: colors.textSecondary,
            margin: 0
          }}>
            Order #{orderData.order_number}
          </p>
        </div>

        {/* Order Summary */}
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          padding: spacing.md,
          marginBottom: spacing.md,
          border: `1px solid ${colors.border}`,
          boxShadow: shadows.md
        }}>
          <h2 style={{
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            margin: `0 0 ${spacing.sm} 0`,
            color: colors.textPrimary
          }}>
            Order Summary
          </h2>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: typography.weights.bold,
            fontSize: typography.sizes.lg
          }}>
            <span>Total</span>
            <span style={{ color: colors.primary }}>{formatCurrency(orderData.total_cents)}</span>
          </div>

          <div style={{
            marginTop: spacing.sm,
            padding: spacing.xs,
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm
          }}>
            <span style={{ color: colors.textSecondary }}>Paying to: </span>
            <span style={{ fontWeight: typography.weights.medium }}>{orderData.vendor_name}</span>
          </div>
        </div>

        {/* Payment Instructions */}
        {isCash ? (
          <div style={{
            backgroundColor: colors.primaryLight,
            borderRadius: radius.lg,
            padding: spacing.md,
            marginBottom: spacing.md,
            border: `1px solid ${colors.primary}`
          }}>
            <h3 style={{
              color: colors.primaryDark,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              margin: `0 0 ${spacing.xs} 0`
            }}>
              Pay Cash at Pickup
            </h3>
            <p style={{
              color: colors.primaryDark,
              fontSize: typography.sizes.sm,
              margin: 0
            }}>
              Bring <strong>{formatCurrency(orderData.total_cents)}</strong> cash when you pick up your order.
              The vendor will confirm your order when you arrive.
            </p>
          </div>
        ) : (
          <div style={{
            backgroundColor: colors.primaryLight,
            borderRadius: radius.lg,
            padding: spacing.md,
            marginBottom: spacing.md,
            border: `1px solid ${colors.primary}`
          }}>
            <h3 style={{
              color: colors.primaryDark,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              margin: `0 0 ${spacing.xs} 0`
            }}>
              Pay with {getPaymentMethodLabel(orderData.payment_method)}
            </h3>
            <p style={{
              color: colors.primaryDark,
              fontSize: typography.sizes.sm,
              margin: `0 0 ${spacing.sm} 0`
            }}>
              Tap the button below to open {getPaymentMethodLabel(orderData.payment_method)} and send{' '}
              <strong>{formatCurrency(orderData.total_cents)}</strong> to {orderData.vendor_name}.
            </p>

            {orderData.payment_link && (
              <a
                href={orderData.payment_link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: spacing.sm,
                  backgroundColor: colors.primary,
                  color: colors.textInverse,
                  textAlign: 'center',
                  textDecoration: 'none',
                  borderRadius: radius.md,
                  fontWeight: typography.weights.semibold,
                  fontSize: typography.sizes.lg
                }}
              >
                Pay {formatCurrency(orderData.total_cents)} with {getPaymentMethodLabel(orderData.payment_method)}
              </a>
            )}
          </div>
        )}

        {/* Refund Policy Notice */}
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          marginBottom: spacing.sm,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.md,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          lineHeight: 1.5
        }}>
          <strong style={{ color: colors.textSecondary }}>Refund policy for external payments:</strong>{' '}
          Refunds for orders paid via {getPaymentMethodLabel(orderData.payment_method)} are handled directly
          between you and the vendor. The platform cannot process refunds for external payments.
        </div>

        {/* What's Next */}
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          marginBottom: spacing.md,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.md,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          lineHeight: 1.5
        }}>
          <strong style={{ color: colors.textSecondary }}>
            {isCash ? 'What\'s next?' : 'Completed your payment?'}
          </strong>{' '}
          {isCash
            ? 'Your order has been placed. You can continue shopping or monitor your order status from your orders page.'
            : 'Once you\'ve completed your payment, you can continue shopping or monitor your order status from your orders page.'
          }
        </div>

        {/* Navigation Buttons */}
        <div style={{
          display: 'flex',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          <Link
            href={`/${vertical}/buyer/orders`}
            style={{
              flex: 1,
              display: 'block',
              padding: spacing.sm,
              backgroundColor: colors.primary,
              color: colors.textInverse,
              textAlign: 'center',
              textDecoration: 'none',
              borderRadius: radius.md,
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.base
            }}
          >
            My Orders
          </Link>
          <Link
            href={`/${vertical}/browse`}
            style={{
              flex: 1,
              display: 'block',
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              textAlign: 'center',
              textDecoration: 'none',
              borderRadius: radius.md,
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.base,
              border: `1px solid ${colors.border}`
            }}
          >
            Continue Shopping
          </Link>
        </div>

        {/* Help text */}
        <p style={{
          textAlign: 'center',
          fontSize: typography.sizes.xs,
          color: colors.textMuted,
          marginTop: spacing.sm
        }}>
          Questions? Contact the vendor directly or check your order status.
        </p>
      </div>
    </div>
  )
}
