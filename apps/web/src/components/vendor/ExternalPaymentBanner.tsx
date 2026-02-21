'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { spacing, typography, radius } from '@/lib/design-tokens'

interface ExternalPaymentBannerProps {
  vertical: string
}

export default function ExternalPaymentBanner({ vertical }: ExternalPaymentBannerProps) {
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPendingExternal() {
      try {
        const res = await fetch(`/api/vendor/orders?vertical=${vertical}`)
        if (res.ok) {
          const data = await res.json()
          // Count orders where payment_method is external and status is pending
          const pending = (data.orders || []).filter((o: { payment_method?: string; order_status?: string }) =>
            o.payment_method &&
            o.payment_method !== 'stripe' &&
            o.order_status === 'pending'
          )
          setPendingCount(pending.length)
        }
      } catch {
        // Non-critical — don't block dashboard
      } finally {
        setLoading(false)
      }
    }

    fetchPendingExternal()
  }, [vertical])

  if (loading || pendingCount === 0) return null

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: '#fffbeb',
      border: '2px solid #f59e0b',
      borderRadius: radius.lg,
      marginBottom: spacing.md,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs,
            marginBottom: spacing['2xs'],
          }}>
            <span style={{ fontSize: typography.sizes.xl }}>&#x1F4B0;</span>
            <h3 style={{
              margin: 0,
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.bold,
              color: '#92400e',
            }}>
              {pendingCount} External Payment{pendingCount !== 1 ? 's' : ''} Awaiting Confirmation
            </h3>
          </div>
          <p style={{
            margin: 0,
            fontSize: typography.sizes.sm,
            color: '#92400e',
          }}>
            Check your payment apps and confirm when you&apos;ve received payment.
          </p>
        </div>

        <Link
          href={`/${vertical}/vendor/orders`}
          style={{
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: radius.md,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            whiteSpace: 'nowrap',
          }}
        >
          Review Orders
        </Link>
      </div>
    </div>
  )
}
