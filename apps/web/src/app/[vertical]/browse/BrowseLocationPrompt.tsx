'use client'

import { useRouter } from 'next/navigation'
import LocationSearchInline from '@/components/location/LocationSearchInline'
import { term, getRadiusOptions } from '@/lib/vertical'
import { spacing, typography, getVerticalColors } from '@/lib/design-tokens'

interface BrowseLocationPromptProps {
  vertical: string
  /** When true, shows the green "location set" bar with radius controls */
  hasLocation?: boolean
  /** Display text for current location (ZIP or "Current location") */
  locationText?: string
  /** Current radius from cookie */
  currentRadius?: number
}

export default function BrowseLocationPrompt({ vertical, hasLocation, locationText, currentRadius }: BrowseLocationPromptProps) {
  const router = useRouter()
  const colors = getVerticalColors(vertical)
  const radiusOptions = getRadiusOptions(vertical)

  const handleRadiusChange = async (newRadius: number) => {
    // Save radius to cookie via PATCH, then refresh server page
    try {
      await fetch('/api/buyer/location', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radius: newRadius })
      })
    } catch {
      // Ignore errors - radius will still work on next page load
    }
    router.refresh()
  }

  const handleClear = async () => {
    try {
      await fetch('/api/buyer/location', { method: 'DELETE' })
    } catch {
      // Ignore
    }
    router.refresh()
  }

  // No location set — show ZIP/GPS input
  if (!hasLocation) {
    return (
      <div style={{ marginBottom: spacing.md }}>
        <p
          style={{
            fontSize: typography.sizes.sm,
            color: colors.textSecondary,
            marginBottom: spacing.xs,
          }}
        >
          Enter your location to find {term(vertical, 'vendors').toLowerCase()} near you
        </p>
        <LocationSearchInline
          onLocationSet={() => {
            router.refresh()
          }}
          labelPrefix={`${term(vertical, 'listings')} near`}
          radiusOptions={radiusOptions}
        />
      </div>
    )
  }

  // Location is set — show green bar with radius controls
  return (
    <div style={{ marginBottom: spacing.md }}>
      <LocationSearchInline
        hasLocation
        locationText={locationText}
        radius={currentRadius}
        onLocationSet={() => {
          router.refresh()
        }}
        onClear={handleClear}
        onRadiusChange={handleRadiusChange}
        labelPrefix={`${term(vertical, 'listings')} near`}
        radiusOptions={radiusOptions}
      />
    </div>
  )
}
