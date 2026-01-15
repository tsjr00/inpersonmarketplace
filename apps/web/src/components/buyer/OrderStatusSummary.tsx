'use client'

interface OrderStatusSummaryProps {
  status: string
  updatedAt: string
}

const STATUS_INFO: Record<string, { icon: string; color: string; bg: string; title: string; message: string }> = {
  pending: {
    icon: '⏳',
    color: '#f59e0b',
    bg: '#fef3c7',
    title: 'Order Pending',
    message: 'Waiting for vendor confirmation'
  },
  confirmed: {
    icon: '✓',
    color: '#3b82f6',
    bg: '#dbeafe',
    title: 'Order Confirmed',
    message: 'Vendor is preparing your items'
  },
  ready: {
    icon: '📦',
    color: '#10b981',
    bg: '#d1fae5',
    title: 'Ready for Pickup',
    message: 'Your order is ready! Pick up at the market'
  },
  fulfilled: {
    icon: '✓',
    color: '#8b5cf6',
    bg: '#e0e7ff',
    title: 'Order Fulfilled',
    message: 'You picked up your order'
  },
  completed: {
    icon: '✓',
    color: '#8b5cf6',
    bg: '#e0e7ff',
    title: 'Order Complete',
    message: 'Order has been completed'
  },
  cancelled: {
    icon: '✕',
    color: '#ef4444',
    bg: '#fee2e2',
    title: 'Order Cancelled',
    message: 'This order was cancelled'
  },
  expired: {
    icon: '⏱',
    color: '#6b7280',
    bg: '#f3f4f6',
    title: 'Pickup Expired',
    message: 'Pickup window has passed'
  }
}

export default function OrderStatusSummary({ status, updatedAt }: OrderStatusSummaryProps) {
  const info = STATUS_INFO[status] || STATUS_INFO.pending
  const lastUpdated = new Date(updatedAt).toLocaleString()

  return (
    <div style={{
      padding: 20,
      backgroundColor: info.bg,
      borderRadius: 8,
      border: `2px solid ${info.color}`,
      marginBottom: 24
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 32 }}>{info.icon}</span>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: info.color }}>
            {info.title}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 14, color: info.color }}>
            {info.message}
          </p>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
        Last updated: {lastUpdated}
      </p>
    </div>
  )
}
