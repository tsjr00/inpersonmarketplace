'use client'

import { useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface LocationEntryProps {
  vertical: string
  initialCity?: string | null
  onLocationSet?: (zipCode: string) => void
}

const STORAGE_KEY = 'user_location'

interface StoredLocation {
  zipCode: string
  city?: string
  state?: string
  timestamp: number
}

export function LocationEntry({ vertical: _vertical, initialCity, onLocationSet }: LocationEntryProps) {
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

    // Save to localStorage
    const locationData: StoredLocation = {
      zipCode: trimmedZip,
      timestamp: Date.now(),
    }

    // Optionally look up city/state (could add API call here)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locationData))
    setSavedLocation(locationData)
    setIsEditing(false)

    if (onLocationSet) {
      onLocationSet(trimmedZip)
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
          gap: spacing.xs,
          fontWeight: typography.weights.medium,
        }}
      >
        <MapPin style={{ width: 16, height: 16, color: colors.primary }} />
        Enter your zip code to find local vendors near you
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
            padding: `${spacing.xs} ${spacing.md}`,
            fontSize: typography.sizes.base,
            border: error ? `2px solid #ef4444` : `2px solid ${colors.border}`,
            borderRadius: radius.full,
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            width: 180,
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            boxSizing: 'border-box',
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
            gap: spacing.xs,
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: colors.primary,
            color: colors.textInverse,
            border: '2px solid transparent',
            borderRadius: radius.full,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            cursor: 'pointer',
            transition: 'background-color 0.2s, transform 0.2s',
            boxShadow: shadows.sm,
            width: 180,
            boxSizing: 'border-box',
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
          <Search style={{ width: 18, height: 18 }} />
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
