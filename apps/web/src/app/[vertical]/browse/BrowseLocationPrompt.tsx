'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LocationSearchInline from '@/components/location/LocationSearchInline'
import { term, getRadiusOptions } from '@/lib/vertical'
import { spacing, typography, getVerticalColors } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

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
  const locale = getClientLocale()
  const router = useRouter()
  const colors = getVerticalColors(vertical)
  const radiusOptions = getRadiusOptions(vertical)
  // Local state for optimistic UI — shows selected radius immediately
  const [radius, setRadius] = useState(currentRadius ?? 25)

  const handleRadiusChange = async (newRadius: number) => {
    setRadius(newRadius) // Optimistic update
    // Save radius to cookie via PATCH — cookie is the source of truth
    try {
      await fetch('/api/buyer/location', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radius: newRadius })
      })
    } catch {
      // Ignore errors - radius will still work on next page load
    }
    // Re-fetch server component — reads updated cookie for new radius
    // Page uses force-dynamic so no ISR cache to worry about
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
          {t('browse.enter_location', locale, { vendors: term(vertical, 'vendors', locale).toLowerCase() })}
        </p>
        <LocationSearchInline
          onLocationSet={() => {
            router.refresh()
          }}
          labelPrefix={t('browse.listings_near', locale, { listings: term(vertical, 'listings', locale) })}
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
        radius={radius}
        onLocationSet={() => {
          router.refresh()
        }}
        onClear={handleClear}
        onRadiusChange={handleRadiusChange}
        labelPrefix={t('browse.listings_near', locale, { listings: term(vertical, 'listings', locale) })}
        radiusOptions={radiusOptions}
      />
    </div>
  )
}
