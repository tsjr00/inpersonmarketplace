'use client'

interface OrderTimelineProps {
  status: string
  createdAt: string
  updatedAt: string
}

const TIMELINE_STEPS = [
  { key: 'pending', label: 'Order Placed' },
  { key: 'confirmed', label: 'Confirmed by Vendor' },
  { key: 'ready', label: 'Ready for Pickup' },
  { key: 'fulfilled', label: 'Picked Up' }
]

const STATUS_ORDER = ['pending', 'confirmed', 'ready', 'fulfilled', 'completed', 'cancelled', 'expired']

export default function OrderTimeline({ status, createdAt, updatedAt }: OrderTimelineProps) {
  const currentIndex = STATUS_ORDER.indexOf(status)
  const isCancelled = status === 'cancelled'
  const isExpired = status === 'expired'

  if (isCancelled || isExpired) {
    return (
      <div style={{
        padding: 16,
        backgroundColor: '#fee2e2',
        borderRadius: 8,
        marginBottom: 24
      }}>
        <p style={{ margin: 0, fontSize: 14, color: '#991b1b' }}>
          {isCancelled ? 'Order was cancelled' : 'Pickup window expired'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, marginTop: 0, color: '#374151' }}>
        Order Timeline
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TIMELINE_STEPS.map((step, index) => {
          const isComplete = STATUS_ORDER.indexOf(step.key) <= currentIndex
          const isCurrent = step.key === status || (status === 'completed' && step.key === 'fulfilled')

          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Circle indicator */}
              <div style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: isComplete ? '#10b981' : '#e5e7eb',
                border: isCurrent ? '3px solid #10b981' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {isComplete && (
                  <span style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>✓</span>
                )}
              </div>

              {/* Label */}
              <div>
                <p style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: isCurrent ? 600 : 400,
                  color: isComplete ? '#111827' : '#9ca3af'
                }}>
                  {step.label}
                </p>
                {isCurrent && (
                  <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                    {new Date(updatedAt).toLocaleString()}
                  </p>
                )}
                {index === 0 && !isCurrent && (
                  <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                    {new Date(createdAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
