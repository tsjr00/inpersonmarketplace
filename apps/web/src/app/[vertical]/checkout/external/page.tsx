'use client'

import { useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface OrderData {
  order_id: string
  order_number: string
  payment_method: string
  payment_link: string | null
  subtotal_cents: number
  buyer_fee_cents: number
  small_order_fee_cents: number
  total_cents: number
  vendor_name: string
}

export default function ExternalCheckoutPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const vertical = params?.vertical as string
  const locale = getClientLocale()

  // Derive order data from URL params (passed from checkout)
  const { orderData, error } = useMemo(() => {
    const orderId = searchParams.get('order_id')
    const orderNumber = searchParams.get('order_number')
    const paymentMethod = searchParams.get('payment_method')
    const paymentLink = searchParams.get('payment_link')
    const subtotal = searchParams.get('subtotal')
    const buyerFee = searchParams.get('buyer_fee')
    const smallOrderFee = searchParams.get('small_order_fee')
    const total = searchParams.get('total')
    const vendorName = searchParams.get('vendor_name')

    if (!orderId || !orderNumber || !paymentMethod) {
      return { orderData: null, error: t('ext_checkout.missing_info', locale) }
    }

    return {
      orderData: {
        order_id: orderId,
        order_number: orderNumber,
        payment_method: paymentMethod,
        payment_link: paymentLink ? decodeURIComponent(paymentLink) : null,
        subtotal_cents: parseInt(subtotal || '0', 10),
        buyer_fee_cents: parseInt(buyerFee || '0', 10),
        small_order_fee_cents: parseInt(smallOrderFee || '0', 10),
        total_cents: parseInt(total || '0', 10),
        vendor_name: vendorName ? decodeURIComponent(vendorName) : t('ext_checkout.vendor_fallback', locale)
      } as OrderData,
      error: null
    }
  }, [searchParams, locale])

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'venmo': return 'Venmo'
      case 'cashapp': return 'Cash App'
      case 'paypal': return 'PayPal'
      case 'cash': return locale === 'es' ? 'Efectivo' : 'Cash'
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
        <p style={{ color: '#dc2626', marginBottom: spacing.md }}>{error || t('ext_checkout.order_not_found', locale)}</p>
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
          {t('ext_checkout.return_to_checkout', locale)}
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
            {isCash ? t('ext_checkout.order_placed', locale) : t('ext_checkout.complete_payment', locale)}
          </h1>
          <p style={{
            color: colors.textSecondary,
            margin: 0
          }}>
            {t('ext_checkout.order_number', locale, { number: orderData.order_number })}
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
            {t('ext_checkout.order_summary', locale)}
          </h2>

          {orderData.small_order_fee_cents > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: spacing.xs,
              fontSize: typography.sizes.sm,
              color: colors.textMuted,
            }}>
              <span>{t('ext_checkout.small_order_fee', locale)}</span>
              <span>{formatCurrency(orderData.small_order_fee_cents)}</span>
            </div>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: typography.weights.bold,
            fontSize: typography.sizes.lg
          }}>
            <span>{t('ext_checkout.total', locale)}</span>
            <span style={{ color: colors.primary }}>{formatCurrency(orderData.total_cents)}</span>
          </div>

          <div style={{
            marginTop: spacing.sm,
            padding: spacing.xs,
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm
          }}>
            <span style={{ color: colors.textSecondary }}>{t('ext_checkout.paying_to', locale)}</span>
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
              {t('ext_checkout.pay_cash', locale)}
            </h3>
            <p style={{
              color: colors.primaryDark,
              fontSize: typography.sizes.sm,
              margin: 0
            }}>
              {t('ext_checkout.cash_instructions', locale, { amount: formatCurrency(orderData.total_cents) })}
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
              {t('ext_checkout.pay_with', locale, { method: getPaymentMethodLabel(orderData.payment_method) })}
            </h3>
            <p style={{
              color: colors.primaryDark,
              fontSize: typography.sizes.sm,
              margin: `0 0 ${spacing.sm} 0`
            }}>
              {t('ext_checkout.send_instructions', locale, { method: getPaymentMethodLabel(orderData.payment_method), amount: formatCurrency(orderData.total_cents), vendor: orderData.vendor_name })}
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
                {t('ext_checkout.pay_button', locale, { amount: formatCurrency(orderData.total_cents), method: getPaymentMethodLabel(orderData.payment_method) })}
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
          <strong style={{ color: colors.textSecondary }}>{t('ext_checkout.refund_policy', locale)}</strong>{' '}
          {t('ext_checkout.refund_details', locale, { method: getPaymentMethodLabel(orderData.payment_method) })}
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
            {isCash ? t('ext_checkout.whats_next', locale) : t('ext_checkout.completed_payment', locale)}
          </strong>{' '}
          {isCash
            ? t('ext_checkout.cash_next', locale)
            : t('ext_checkout.digital_next', locale)
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
            {t('ext_checkout.my_orders', locale)}
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
            {t('ext_checkout.continue_shopping', locale)}
          </Link>
        </div>

        {/* Help text */}
        <p style={{
          textAlign: 'center',
          fontSize: typography.sizes.xs,
          color: colors.textMuted,
          marginTop: spacing.sm
        }}>
          {t('ext_checkout.help_text', locale)}
        </p>
      </div>
    </div>
  )
}
