'use client'

interface OrderStatusBadgeProps {
  status: string
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  ready: { bg: '#d1fae5', text: '#065f46' },
  fulfilled: { bg: '#e0e7ff', text: '#4338ca' },
  completed: { bg: '#e0e7ff', text: '#4338ca' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
  expired: { bg: '#f3f4f6', text: '#4b5563' }
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  ready: 'Ready for Pickup',
  fulfilled: 'Fulfilled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired'
}

export default function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.pending
  const label = STATUS_LABELS[status] || status

  return (
    <span style={{
      padding: '4px 12px',
      borderRadius: 12,
      fontSize: 13,
      fontWeight: 600,
      backgroundColor: colors.bg,
      color: colors.text,
      display: 'inline-block'
    }}>
      {label}
    </span>
  )
}
