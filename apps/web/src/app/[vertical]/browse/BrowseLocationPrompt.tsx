'use client'

import { useState, useEffect } from 'react'
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

export default function BrowseLocationPrompt({ vertical, hasLocation: serverHasLocation, locationText: serverLocationText, currentRadius: serverRadius }: BrowseLocationPromptProps) {
  const locale = getClientLocale()
  const router = useRouter()
  const colors = getVerticalColors(vertical)
  const radiusOptions = getRadiusOptions(vertical)

  // Client-side location state — fetched from GET /api/buyer/location
  // This is needed because the ISR-cached server can't read the httpOnly location cookie.
  const [hasLocation, setHasLocation] = useState(serverHasLocation ?? false)
  const [locationText, setLocationText] = useState(serverLocationText)
  const [radius, setRadius] = useState(serverRadius ?? 25)
  const [loaded, setLoaded] = useState(!!serverHasLocation)

  // On mount: fetch location from API (reads httpOnly cookie server-side)
  useEffect(() => {
    // If server already provided location data (e.g. via ?zip= param), skip
    if (serverHasLocation) return

    async function fetchLocation() {
      try {
        const res = await fetch('/api/buyer/location')
        if (!res.ok) return
        const data = await res.json()
        if (data.hasLocation) {
          setHasLocation(true)
          setLocationText(data.locationText)
          setRadius(data.radius ?? 25)
        }
      } catch {
        // No location available, stay in input mode
      }
      setLoaded(true)
    }

    fetchLocation()
  }, [serverHasLocation])

  const handleRadiusChange = async (newRadius: number) => {
    setRadius(newRadius) // Optimistic update
    // Save radius to cookie via PATCH, then hard reload to bypass ISR cache
    try {
      await fetch('/api/buyer/location', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ radius: newRadius })
      })
    } catch {
      // Ignore errors - radius will still work on next page load
    }
    // Full reload bypasses revalidate=300 ISR cache
    window.location.reload()
  }

  const handleClear = async () => {
    try {
      await fetch('/api/buyer/location', { method: 'DELETE' })
    } catch {
      // Ignore
    }
    setHasLocation(false)
    setLocationText(undefined)
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
            // After setting location, reload to apply server-side filtering
            window.location.reload()
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
          window.location.reload()
        }}
        onClear={handleClear}
        onRadiusChange={handleRadiusChange}
        labelPrefix={t('browse.listings_near', locale, { listings: term(vertical, 'listings', locale) })}
        radiusOptions={radiusOptions}
      />
    </div>
  )
}
