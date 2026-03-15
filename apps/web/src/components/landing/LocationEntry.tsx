'use client'

import { useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { spacing, typography, radius, getVerticalColors, getVerticalShadows } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

interface LocationEntryProps {
  vertical: string
  initialCity?: string | null
  onLocationSet?: (zipCode: string) => void
  locale?: string
}

const STORAGE_KEY = 'user_location'

interface StoredLocation {
  zipCode: string
  city?: string
  state?: string
  timestamp: number
}

export function LocationEntry({ vertical, initialCity, onLocationSet, locale }: LocationEntryProps) {
  const colors = getVerticalColors(vertical)
  const shadows = getVerticalShadows(vertical)
  const [savedLocation, setSavedLocation] = useState<StoredLocation | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredLocation
        const thirtyDays = 30 * 24 * 60 * 60 * 1000
        if (Date.now() - parsed.timestamp < thirtyDays) return parsed
      } catch { /* invalid stored data */ }
    }
    return null
  })
  const [zipCode, setZipCode] = useState(() => {
    if (typeof window === 'undefined') return ''
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredLocation
        const thirtyDays = 30 * 24 * 60 * 60 * 1000
        if (Date.now() - parsed.timestamp < thirtyDays) return parsed.zipCode
      } catch { /* invalid stored data */ }
    }
    return ''
  })
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState('')

  const validateZipCode = (zip: string): boolean => {
    // US zip code: 5 digits or 5+4 format
    return /^\d{5}(-\d{4})?$/.test(zip)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedZip = zipCode.trim()
    if (!validateZipCode(trimmedZip)) {
      setError('Please enter a valid 5-digit zip code')
      return
    }

    // Save to localStorage (immediate — for pill display on this page)
    // eslint-disable-next-line react-hooks/purity -- Date.now() is safe in event handler
    const locationData: StoredLocation = { zipCode: trimmedZip, timestamp: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locationData))
    setSavedLocation(locationData)
    setIsEditing(false)

    if (onLocationSet) {
      onLocationSet(trimmedZip)
    }

    // Set server-side cookie in background (for persistence across pages)
    // This geocodes the zip and sets the httpOnly user_location cookie
    setLocationCookie(trimmedZip)
  }

  /** Geocode zip → set httpOnly cookie so markets/vendors/browse pages pick it up */
  const setLocationCookie = async (zip: string) => {
    try {
      // Step 1: Geocode zip to lat/lng
      const geocodeRes = await fetch('/api/buyer/location/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zipCode: zip }),
      })
      if (!geocodeRes.ok) return // Silent fail — URL param fallback still works

      const { latitude, longitude, locationText } = await geocodeRes.json()

      // Step 2: Set the cookie via location API
      await fetch('/api/buyer/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude,
          longitude,
          source: 'manual',
          zipCode: zip,
          locationText,
        }),
      })
    } catch {
      // Silent fail — the zip still works via URL params on CTA buttons
    }
  }

  // If we have a saved location and not editing, show the saved state
  if (savedLocation && !isEditing) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing.xs,
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.full,
            fontSize: typography.sizes.sm,
            color: colors.textSecondary,
          }}
        >
          <MapPin style={{ width: 16, height: 16, color: colors.primary }} />
          <span>
            Showing results near <strong style={{ color: colors.textPrimary }}>{savedLocation.zipCode}</strong>
          </span>
          <button
            onClick={() => setIsEditing(true)}
            style={{
              background: 'none',
              border: 'none',
              color: colors.primary,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              cursor: 'pointer',
              padding: `${spacing['3xs']} ${spacing.xs}`,
              marginLeft: spacing['2xs'],
            }}
          >
            Change
          </button>
        </div>
      </div>
    )
  }

  // Show entry form
  return (
    <div
      style={{
        marginBottom: spacing.md,
        textAlign: 'center',
      }}
    >
      {/* Explanatory text */}
      <p
        style={{
          fontSize: typography.sizes.sm,
          color: colors.textPrimary,
          marginBottom: spacing.sm,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          fontWeight: typography.weights.medium,
          whiteSpace: 'nowrap',
        }}
      >
        <MapPin style={{ width: 16, height: 16, color: colors.primary, flexShrink: 0 }} />
        {`Enter your zip code to find local ${term(vertical, 'vendors', locale).toLowerCase()} near you`}
      </p>

      {/* Zip code form */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
          gap: spacing.xs,
        }}
      >
        <input
          type="text"
          value={zipCode}
          onChange={(e) => {
            setZipCode(e.target.value)
            setError('')
          }}
          placeholder="Enter zip code"
          maxLength={10}
          style={{
            padding: `${spacing.xs} ${spacing.sm}`,
            fontSize: typography.sizes.sm,
            border: error ? `2px solid #ef4444` : `2px solid ${colors.border}`,
            borderRadius: radius.full,
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            width: 160,
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            boxSizing: 'border-box',
            textAlign: 'center',
          }}
          onFocus={(e) => {
            if (!error) {
              e.currentTarget.style.borderColor = colors.primary
              e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primaryLight}`
            }
          }}
          onBlur={(e) => {
            if (!error) {
              e.currentTarget.style.borderColor = colors.border
              e.currentTarget.style.boxShadow = 'none'
            }
          }}
        />
        <button
          type="submit"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: `${spacing.xs} ${spacing.sm}`,
            backgroundColor: colors.primary,
            color: colors.textInverse,
            border: '2px solid transparent',
            borderRadius: radius.full,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: 'pointer',
            transition: 'background-color 0.2s, transform 0.2s',
            boxShadow: shadows.sm,
            width: 150,
            boxSizing: 'border-box',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colors.primaryDark
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = colors.primary
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <Search style={{ width: 16, height: 16, flexShrink: 0 }} />
          Find Local
        </button>
      </form>

      {/* Error message */}
      {error && (
        <p
          style={{
            fontSize: typography.sizes.xs,
            color: '#ef4444',
            marginTop: spacing.xs,
          }}
        >
          {error}
        </p>
      )}

      {/* Privacy note */}
      <p
        style={{
          fontSize: typography.sizes.xs,
          color: colors.textMuted,
          marginTop: spacing.sm,
        }}
      >
        We store this locally on your device. We don&apos;t track your location.
      </p>

      {/* Show IP-based suggestion if available */}
      {initialCity && !savedLocation && (
        <p
          style={{
            fontSize: typography.sizes.xs,
            color: colors.textMuted,
            marginTop: spacing['2xs'],
          }}
        >
          Or browse all vendors in the <strong>{initialCity}</strong> area
        </p>
      )}
    </div>
  )
}

// Utility function to get stored location (can be used by other components)
export function getStoredLocation(): StoredLocation | null {
  if (typeof window === 'undefined') return null

  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored) as StoredLocation
    const thirtyDays = 30 * 24 * 60 * 60 * 1000
    if (Date.now() - parsed.timestamp < thirtyDays) {
      return parsed
    }
  } catch {
    // Invalid stored data
  }
  return null
}
