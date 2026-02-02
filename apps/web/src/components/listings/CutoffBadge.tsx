'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface CutoffBadgeProps {
  listingId: string
  style?: React.CSSProperties
}

interface AvailabilityResponse {
  is_accepting_orders: boolean
  closing_soon?: boolean
  hours_until_cutoff?: number | null
}

/**
 * Lightweight badge to show cutoff status on listing cards.
 * Fetches availability asynchronously without blocking initial render.
 */
export default function CutoffBadge({ listingId, style }: CutoffBadgeProps) {
  const [status, setStatus] = useState<'loading' | 'open' | 'closing-soon' | 'closed'>('loading')
  const [hoursLeft, setHoursLeft] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchStatus() {
      try {
        const response = await fetch(`/api/listings/${listingId}/availability`)
        if (response.ok && !cancelled) {
          const data: AvailabilityResponse = await response.json()

          if (!data.is_accepting_orders) {
            setStatus('closed')
          } else if (data.closing_soon && data.hours_until_cutoff != null) {
            setStatus('closing-soon')
            setHoursLeft(data.hours_until_cutoff)
          } else {
            setStatus('open')
          }
        }
      } catch {
        // Silently fail - don't block the UI
        setStatus('open')
      }
    }

    fetchStatus()
    return () => { cancelled = true }
  }, [listingId])

  // Don't show anything while loading or if orders are open (no urgency)
  if (status === 'loading' || status === 'open') {
    return null
  }

  // Format time remaining
  const formatTime = (hours: number): string => {
    if (hours < 1) {
      const minutes = Math.max(1, Math.round(hours * 60))
      return `${minutes}m`
    }
    return `${Math.floor(hours)}h`
  }

  // Closed badge
  if (status === 'closed') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing['3xs'],
          padding: `${spacing['3xs']} ${spacing.xs}`,
          backgroundColor: '#fef2f2',
          color: '#991b1b',
          borderRadius: radius.lg,
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.semibold,
          ...style
        }}
        title="Orders are closed for the upcoming market"
      >
        <span>Closed</span>
      </span>
    )
  }

  // Closing soon badge
  if (status === 'closing-soon') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing['3xs'],
          padding: `${spacing['3xs']} ${spacing.xs}`,
          backgroundColor: '#fef3c7',
          color: '#92400e',
          borderRadius: radius.lg,
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.semibold,
          ...style
        }}
        title={`Orders close in ${hoursLeft ? formatTime(hoursLeft) : 'soon'}`}
      >
        <span>Closes {hoursLeft ? formatTime(hoursLeft) : 'soon'}</span>
      </span>
    )
  }

  return null
}
