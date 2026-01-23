'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface LocationSearchInlineProps {
  onLocationSet?: (lat: number, lng: number, source: 'gps' | 'manual') => void
  hasLocation?: boolean
  locationText?: string
  onClear?: () => void
}

export default function LocationSearchInline({
  onLocationSet,
  hasLocation,
  locationText,
  onClear
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
            body: JSON.stringify({ latitude, longitude, source: 'gps' })
          })
          if (!response.ok) throw new Error('Failed to save location')
          setMode('input')
          onLocationSet?.(latitude, longitude, 'gps')
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

      const saveResponse = await fetch('/api/buyer/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: data.latitude,
          longitude: data.longitude,
          source: 'manual'
        })
      })
      if (!saveResponse.ok) throw new Error('Failed to save')

      setZipCode('')
      setMode('input')
      onLocationSet?.(data.latitude, data.longitude, 'manual')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid ZIP code'
      setError(message)
      setMode('input')
    }
  }

  // Show current location with change option
  if (hasLocation && locationText) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: `${spacing.xs} ${spacing.sm}`,
        backgroundColor: '#f0fdf4',
        border: '1px solid #86efac',
        borderRadius: radius.md,
        fontSize: typography.sizes.sm
      }}>
        <span style={{ color: '#166534' }}>📍 {locationText} (25mi)</span>
        <button
          onClick={onClear}
          style={{
            background: 'none',
            border: 'none',
            color: '#16a34a',
            cursor: 'pointer',
            fontSize: typography.sizes.sm,
            textDecoration: 'underline',
            padding: 0
          }}
        >
          Change
        </button>
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
      <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs, marginLeft: 'auto' }}>
        25mi radius
      </span>
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
