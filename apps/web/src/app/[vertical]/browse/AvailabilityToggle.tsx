'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { spacing, typography, radius } from '@/lib/design-tokens'

interface AvailabilityToggleProps {
  vertical: string
  isAvailableNow: boolean
  primaryColor: string
}

export default function AvailabilityToggle({
  vertical,
  isAvailableNow,
  primaryColor
}: AvailabilityToggleProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleToggle = (available: boolean) => {
    const params = new URLSearchParams(searchParams.toString())
    if (available) {
      params.set('available', 'true')
    } else {
      params.delete('available')
    }
    // Reset to page 1 on toggle
    params.delete('page')
    router.push(`/${vertical}/browse?${params.toString()}`)
  }

  const activeStyle = {
    padding: `${spacing['2xs']} ${spacing.sm}`,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold as number,
    border: 'none',
    borderRadius: radius.md,
    cursor: 'pointer' as const,
    backgroundColor: primaryColor,
    color: 'white',
  }

  const inactiveStyle = {
    ...activeStyle,
    backgroundColor: 'transparent',
    color: '#6b7280',
  }

  return (
    <div style={{
      display: 'inline-flex',
      backgroundColor: '#f3f4f6',
      borderRadius: radius.md,
      padding: 2,
      marginBottom: spacing.sm,
    }}>
      <button
        onClick={() => handleToggle(false)}
        style={!isAvailableNow ? activeStyle : inactiveStyle}
      >
        All Listings
      </button>
      <button
        onClick={() => handleToggle(true)}
        style={isAvailableNow ? activeStyle : inactiveStyle}
      >
        Available Now
      </button>
    </div>
  )
}
