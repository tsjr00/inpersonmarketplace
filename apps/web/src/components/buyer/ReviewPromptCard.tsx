'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { getVerticalColors } from '@/lib/design-tokens'
import { formatPrice } from '@/lib/pricing'

interface UnratedOrder {
  id: string
  order_number: string
  created_at: string
  total_cents: number
  unrated_vendors: { id: string; name: string }[]
}

const DISMISS_KEY = 'review_prompt_dismissed'
const DISMISS_DAYS = 7

export default function ReviewPromptCard({ vertical }: { vertical: string }) {
  const [orders, setOrders] = useState<UnratedOrder[]>([])
  const [dismissed, setDismissed] = useState(true) // Start hidden to prevent flash
  const [loading, setLoading] = useState(true)
  const verticalColors = getVerticalColors(vertical)

  useEffect(() => {
    // Check localStorage for recent dismissal
    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24)
      if (daysSince < DISMISS_DAYS) {
        setLoading(false)
        return
      }
    }
    setDismissed(false)
    fetchUnrated()
  }, [vertical])

  async function fetchUnrated() {
    try {
      const res = await fetch(`/api/buyer/orders/unrated?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders || [])
      }
    } catch {
      // Silent fail — not critical
    } finally {
      setLoading(false)
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  if (dismissed || loading || orders.length === 0) return null

  return (
    <div style={{
      backgroundColor: colors.surfaceElevated,
      border: `2px solid ${verticalColors.primary}`,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
      boxShadow: shadows.md,
      position: 'relative',
    }}>
      {/* Dismiss button */}
      <button
        onClick={dismiss}
        aria-label="Dismiss review prompt"
        style={{
          position: 'absolute',
          top: spacing.xs,
          right: spacing.xs,
          background: 'none',
          border: 'none',
          fontSize: typography.sizes.xl,
          color: colors.textMuted,
          cursor: 'pointer',
          padding: spacing['3xs'],
          lineHeight: 1,
        }}
      >
        &times;
      </button>

      <h3 style={{
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
        color: verticalColors.primary,
        margin: `0 0 ${spacing.xs}`,
      }}>
        Rate Your Recent Orders
      </h3>
      <p style={{
        fontSize: typography.sizes.sm,
        color: colors.textSecondary,
        margin: `0 0 ${spacing.sm}`,
      }}>
        Your feedback helps other buyers and supports great vendors!
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {orders.slice(0, 3).map(order => (
          <div key={order.id} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: spacing.xs,
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.md,
          }}>
            <div>
              <span style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: colors.textPrimary,
              }}>
                Order #{order.order_number}
              </span>
              <span style={{
                fontSize: typography.sizes.xs,
                color: colors.textMuted,
                marginLeft: spacing.xs,
              }}>
                {formatPrice(order.total_cents)} &middot; {order.unrated_vendors.map(v => v.name).join(', ')}
              </span>
            </div>
            <Link
              href={`/${vertical}/buyer/orders/${order.id}`}
              style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: verticalColors.primary,
                textDecoration: 'none',
                padding: `${spacing['3xs']} ${spacing.xs}`,
                borderRadius: radius.sm,
                border: `1px solid ${verticalColors.primary}`,
              }}
            >
              Rate
            </Link>
          </div>
        ))}
      </div>

      {orders.length > 3 && (
        <p style={{
          fontSize: typography.sizes.xs,
          color: colors.textMuted,
          margin: `${spacing.xs} 0 0`,
          textAlign: 'center',
        }}>
          +{orders.length - 3} more orders to rate
        </p>
      )}
    </div>
  )
}
