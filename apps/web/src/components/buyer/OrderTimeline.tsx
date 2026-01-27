'use client'

interface OrderTimelineProps {
  status: string
  createdAt: string
  updatedAt: string
}

// Timeline steps - handed_off inserts between ready and fulfilled
const TIMELINE_STEPS = [
  { key: 'pending', label: 'Order Placed' },
  { key: 'confirmed', label: 'Confirmed by Vendor' },
  { key: 'ready', label: 'Ready for Pickup' },
  { key: 'handed_off', label: 'Vendor Handed Off' },
  { key: 'fulfilled', label: 'Picked Up' }
]

// Order of statuses for comparison
const STATUS_ORDER = ['pending', 'confirmed', 'ready', 'handed_off', 'fulfilled', 'completed', 'cancelled', 'expired']

export default function OrderTimeline({ status, createdAt, updatedAt }: OrderTimelineProps) {
  const currentIndex = STATUS_ORDER.indexOf(status)
  const isCancelled = status === 'cancelled'
  const isExpired = status === 'expired'
  const isHandedOff = status === 'handed_off'

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

  // Filter steps based on status - only show handed_off step when relevant
  const visibleSteps = TIMELINE_STEPS.filter(step => {
    // Always hide handed_off step unless we're in that state or past it
    if (step.key === 'handed_off' && !isHandedOff && status !== 'fulfilled' && status !== 'completed') {
      return false
    }
    return true
  })

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, marginTop: 0, color: '#374151' }}>
        Order Timeline
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visibleSteps.map((step, index) => {
          const stepIndex = STATUS_ORDER.indexOf(step.key)
          const isComplete = stepIndex <= currentIndex
          const isCurrent = step.key === status || (status === 'completed' && step.key === 'fulfilled')
          const isAwaitingAction = step.key === 'handed_off' && isHandedOff

          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Circle indicator */}
              <div style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: isAwaitingAction ? '#f59e0b' : (isComplete ? '#10b981' : '#e5e7eb'),
                border: isCurrent ? `3px solid ${isAwaitingAction ? '#f59e0b' : '#10b981'}` : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {isComplete && !isAwaitingAction && (
                  <span style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>✓</span>
                )}
                {isAwaitingAction && (
                  <span style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>!</span>
                )}
              </div>

              {/* Label */}
              <div>
                <p style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: isCurrent ? 600 : 400,
                  color: isAwaitingAction ? '#b45309' : (isComplete ? '#111827' : '#9ca3af')
                }}>
                  {step.label}
                </p>
                {isAwaitingAction && (
                  <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#b45309', fontWeight: 500 }}>
                    Please confirm you received your items
                  </p>
                )}
                {isCurrent && !isAwaitingAction && (
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
