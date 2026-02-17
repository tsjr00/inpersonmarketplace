'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

const DEFAULT_RADIUS_OPTIONS = [10, 25, 50, 100]

interface LocationSearchInlineProps {
  onLocationSet?: (lat: number, lng: number, source: 'gps' | 'manual', locationText?: string) => void
  hasLocation?: boolean
  locationText?: string
  onClear?: () => void
  /** Label prefix for green bar, e.g., "Markets nearby" or "Vendors nearby" */
  labelPrefix?: string
  /** Current radius in miles */
  radius?: number
  /** Called when user changes radius */
  onRadiusChange?: (radius: number) => void
  /** Custom radius options per vertical (e.g., [2, 5, 10, 25] for food trucks) */
  radiusOptions?: number[]
}

export default function LocationSearchInline({
  onLocationSet,
  hasLocation,
  locationText,
  onClear,
  labelPrefix = 'Nearby',
  radius: currentRadius = 25,
  onRadiusChange,
  radiusOptions = DEFAULT_RADIUS_OPTIONS
}: LocationSearchInlineProps) {
  const [mode, setMode] = useState<'input' | 'loading'>('input')
  const [zipCode, setZipCode] = useState('')
  const [error, setError] = useState('')

  const handleUseMyLocation = async () => {
    setMode('loading')
    setError('')

    if (!navigator.geolocation) {
      setError('Geolocation not supported')
      setMode('input')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          const response = await fetch('/api/buyer/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude,
              longitude,
              source: 'gps',
              locationText: 'Current location'
            })
          })
          if (!response.ok) throw new Error('Failed to save location')
          setMode('input')
          onLocationSet?.(latitude, longitude, 'gps', 'Current location')
        } catch {
          setError('Failed to save location')
          setMode('input')
        }
      },
      () => {
        setError('Location denied - enter ZIP')
        setMode('input')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  }

  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{5}$/.test(zipCode)) {
      setError('Enter valid ZIP')
      return
    }

    setMode('loading')
    setError('')

    try {
      const response = await fetch('/api/buyer/location/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zipCode })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Invalid ZIP')

      // Save with the ZIP code for display
      const saveResponse = await fetch('/api/buyer/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: data.latitude,
          longitude: data.longitude,
          source: 'manual',
          zipCode: zipCode,
          locationText: zipCode // Display the ZIP code in the green bar
        })
      })
      if (!saveResponse.ok) throw new Error('Failed to save')

      const savedZip = zipCode
      setZipCode('')
      setMode('input')
      onLocationSet?.(data.latitude, data.longitude, 'manual', savedZip)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid ZIP code'
      setError(message)
      setMode('input')
    }
  }

  // Radius selector pills component
  const RadiusSelector = ({ showLabel = true }: { showLabel?: boolean }) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing['2xs']
    }}>
      {showLabel && (
        <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs, marginRight: spacing['2xs'] }}>
          Radius:
        </span>
      )}
      {radiusOptions.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onRadiusChange?.(r)}
          style={{
            padding: `${spacing['3xs']} ${spacing.xs}`,
            backgroundColor: currentRadius === r ? '#3b82f6' : 'white',
            color: currentRadius === r ? 'white' : '#374151',
            border: `1px solid ${currentRadius === r ? '#3b82f6' : '#d1d5db'}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
            fontWeight: currentRadius === r ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          {r}mi
        </button>
      ))}
    </div>
  )

  // Show current location with change option (green bar)
  if (hasLocation && locationText) {
    // Check if it's a ZIP code (5 digits)
    const isZipCode = /^\d{5}$/.test(locationText)
    // Format: "Markets nearby ZIP 46746" or "Vendors nearby Current location"
    const locationDisplay = isZipCode ? `ZIP ${locationText}` : locationText

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: `${spacing.xs} ${spacing.sm}`,
        backgroundColor: colors.primaryLight,
        border: `1px solid ${colors.primary}`,
        borderRadius: radius.md,
        fontSize: typography.sizes.sm,
        flexWrap: 'wrap'
      }}>
        <span style={{ color: colors.primaryDark }}>📍 {labelPrefix} {locationDisplay}</span>
        <button
          onClick={onClear}
          style={{
            background: 'none',
            border: 'none',
            color: colors.primary,
            cursor: 'pointer',
            fontSize: typography.sizes.sm,
            textDecoration: 'underline',
            padding: 0
          }}
        >
          Change
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <RadiusSelector showLabel={false} />
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleZipSubmit} style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing.xs,
      padding: `${spacing.xs} ${spacing.sm}`,
      backgroundColor: '#eff6ff',
      border: '1px solid #bfdbfe',
      borderRadius: radius.md,
      flexWrap: 'wrap'
    }}>
      <span style={{ color: '#1e40af', fontSize: typography.sizes.sm, fontWeight: 500 }}>
        📍
      </span>
      <input
        type="text"
        value={zipCode}
        onChange={(e) => { setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5)); setError(''); }}
        placeholder="ZIP code"
        disabled={mode === 'loading'}
        style={{
          width: 80,
          padding: `${spacing['2xs']} ${spacing.xs}`,
          border: `1px solid ${error ? '#fca5a5' : '#d1d5db'}`,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm
        }}
      />
      <button
        type="submit"
        disabled={mode === 'loading'}
        style={{
          padding: `${spacing['2xs']} ${spacing.sm}`,
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          fontWeight: 500,
          cursor: mode === 'loading' ? 'wait' : 'pointer',
          opacity: mode === 'loading' ? 0.7 : 1
        }}
      >
        Go
      </button>
      <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>or</span>
      <button
        type="button"
        onClick={handleUseMyLocation}
        disabled={mode === 'loading'}
        style={{
          padding: `${spacing['2xs']} ${spacing.sm}`,
          backgroundColor: 'white',
          color: '#374151',
          border: '1px solid #d1d5db',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          cursor: mode === 'loading' ? 'wait' : 'pointer',
          opacity: mode === 'loading' ? 0.7 : 1
        }}
      >
        {mode === 'loading' ? '...' : 'Use My Location'}
      </button>
      <div style={{ marginLeft: 'auto' }}>
        <RadiusSelector />
      </div>
      {error && (
        <span style={{
          color: '#dc2626',
          fontSize: typography.sizes.xs,
          width: '100%',
          marginTop: spacing['2xs']
        }}>
          {error}
        </span>
      )}
    </form>
  )
}
