'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface ExternalOrderItem {
  id: string
  listing_title: string
  vendor_name: string
  status: string
}

interface ExternalOrder {
  id: string
  order_number: string
  payment_method: string
  status: string
  items: ExternalOrderItem[]
}

interface ExternalOrderFollowUpProps {
  vertical: string
}

export default function ExternalOrderFollowUp({ vertical }: ExternalOrderFollowUpProps) {
  const [orders, setOrders] = useState<ExternalOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  useEffect(() => {
    fetchExternalOrders()
  }, [])

  const fetchExternalOrders = async () => {
    try {
      const res = await fetch(`/api/buyer/orders?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        // External payment orders where vendor fulfilled but buyer hasn't confirmed
        const external = (data.orders || []).filter((o: ExternalOrder) =>
          o.payment_method &&
          o.payment_method !== 'stripe' &&
          o.status === 'handed_off'
        )
        setOrders(external)
      }
    } catch (err) {
      console.error('Error fetching external orders:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmAll = async (order: ExternalOrder) => {
    setConfirmingId(order.id)
    try {
      // Confirm each fulfilled item that buyer hasn't confirmed yet
      const fulfilledItems = order.items.filter(i => i.status === 'fulfilled')
      for (const item of fulfilledItems) {
        await fetch(`/api/buyer/orders/${order.id}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderItemId: item.id })
        })
      }
      // Remove from list after successful confirmation
      setOrders(prev => prev.filter(o => o.id !== order.id))
    } catch (err) {
      console.error('Error confirming order:', err)
    } finally {
      setConfirmingId(null)
    }
  }

  if (loading || orders.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm,
      marginBottom: spacing.md,
    }}>
      {orders.map(order => {
        const vendorName = order.items[0]?.vendor_name || 'Vendor'
        const methodLabel = order.payment_method === 'cashapp' ? 'Cash App'
          : order.payment_method === 'cash' ? 'Cash'
          : order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1)
        const isConfirming = confirmingId === order.id

        return (
          <div
            key={order.id}
            style={{
              padding: spacing.md,
              backgroundColor: '#ecfdf5',
              border: '2px solid #10b981',
              borderRadius: radius.lg,
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              marginBottom: spacing.xs,
            }}>
              <span style={{ fontSize: typography.sizes.xl }}>&#x2705;</span>
              <h3 style={{
                margin: 0,
                fontSize: typography.sizes.lg,
                fontWeight: typography.weights.semibold,
                color: '#065f46',
              }}>
                Did you get your order?
              </h3>
            </div>
            <p style={{
              margin: `0 0 ${spacing.sm} 0`,
              fontSize: typography.sizes.sm,
              color: '#065f46',
            }}>
              Your order <strong>{order.order_number}</strong> from <strong>{vendorName}</strong> (paid via {methodLabel}) was marked as complete. Did everything go well?
            </p>

            <div style={{
              display: 'flex',
              gap: spacing.sm,
              flexWrap: 'wrap',
            }}>
              <button
                onClick={() => handleConfirmAll(order)}
                disabled={isConfirming}
                style={{
                  padding: `${spacing.xs} ${spacing.md}`,
                  backgroundColor: isConfirming ? colors.textMuted : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: radius.md,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  cursor: isConfirming ? 'not-allowed' : 'pointer',
                  minHeight: 44,
                }}
              >
                {isConfirming ? 'Confirming...' : 'Yes, everything was great!'}
              </button>

              <Link
                href={`/${vertical}/buyer/orders/${order.id}`}
                style={{
                  padding: `${spacing.xs} ${spacing.md}`,
                  backgroundColor: 'transparent',
                  color: '#065f46',
                  border: '1px solid #10b981',
                  borderRadius: radius.md,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.medium,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 44,
                }}
              >
                I have an issue
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
