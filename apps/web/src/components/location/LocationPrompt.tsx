'use client'

import { useState, useEffect } from 'react'
import { colors } from '@/lib/design-tokens'

interface LocationPromptProps {
  onLocationSet?: (lat: number, lng: number, source: 'gps' | 'manual') => void
  onClose?: () => void
  showCloseButton?: boolean
  compact?: boolean
}

export default function LocationPrompt({
  onLocationSet,
  onClose,
  showCloseButton = true,
  compact = false
}: LocationPromptProps) {
  const [mode, setMode] = useState<'prompt' | 'zip' | 'loading' | 'error' | 'success'>('prompt')
  const [zipCode, setZipCode] = useState('')
  const [error, setError] = useState('')
  const [locationText, setLocationText] = useState('')

  const handleUseMyLocation = async () => {
    setMode('loading')
    setError('')

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser')
      setMode('error')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords

        // Save to server
        try {
          const response = await fetch('/api/buyer/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude,
              longitude,
              source: 'gps'
            })
          })

          if (!response.ok) {
            throw new Error('Failed to save location')
          }

          const data = await response.json()
          setLocationText(data.locationText || 'Current location')
          setMode('success')
          onLocationSet?.(latitude, longitude, 'gps')
        } catch (err) {
          setError('Failed to save your location. Please try again.')
          setMode('error')
        }
      },
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('Location access denied. Please enter your ZIP code instead.')
            break
          case err.POSITION_UNAVAILABLE:
            setError('Location unavailable. Please enter your ZIP code instead.')
            break
          case err.TIMEOUT:
            setError('Location request timed out. Please try again or enter your ZIP code.')
            break
          default:
            setError('Unable to get your location. Please enter your ZIP code instead.')
        }
        setMode('error')
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    )
  }

  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!/^\d{5}$/.test(zipCode)) {
      setError('Please enter a valid 5-digit ZIP code')
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

      if (!response.ok) {
        throw new Error(data.error || 'Failed to find location')
      }

      // Save the geocoded location
      const saveResponse = await fetch('/api/buyer/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: data.latitude,
          longitude: data.longitude,
          source: 'manual'
        })
      })

      if (!saveResponse.ok) {
        throw new Error('Failed to save location')
      }

      setLocationText(data.locationText || `ZIP ${zipCode}`)
      setMode('success')
      onLocationSet?.(data.latitude, data.longitude, 'manual')
    } catch (err: any) {
      setError(err.message || 'Failed to find that ZIP code. Please try again.')
      setMode('error')
    }
  }

  if (mode === 'success') {
    return (
      <div style={{
        backgroundColor: colors.primaryLight,
        border: `1px solid ${colors.primary}`,
        borderRadius: 8,
        padding: compact ? 12 : 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: colors.primary }}>📍</span>
          <span style={{ color: colors.primaryDark, fontWeight: 500 }}>
            Showing markets near {locationText}
          </span>
        </div>
        <button
          onClick={() => setMode('prompt')}
          style={{
            background: 'none',
            border: 'none',
            color: colors.primary,
            cursor: 'pointer',
            fontSize: 14,
            textDecoration: 'underline'
          }}
        >
          Change
        </button>
      </div>
    )
  }

  if (mode === 'loading') {
    return (
      <div style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: compact ? 16 : 24,
        textAlign: 'center'
      }}>
        <div style={{
          display: 'inline-block',
          width: 24,
          height: 24,
          border: '3px solid #e2e8f0',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: '#64748b', marginTop: 12, marginBottom: 0 }}>
          Getting your location...
        </p>
      </div>
    )
  }

  if (mode === 'zip') {
    return (
      <div style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: compact ? 16 : 24
      }}>
        <form onSubmit={handleZipSubmit}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: '#334155' }}>
            Enter your ZIP code
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="12345"
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 16
              }}
              autoFocus
            />
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Find
            </button>
          </div>
          {error && (
            <p style={{ color: '#dc2626', fontSize: 14, marginTop: 8, marginBottom: 0 }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => { setMode('prompt'); setError(''); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: 14,
              marginTop: 12,
              textDecoration: 'underline'
            }}
          >
            ← Back
          </button>
        </form>
      </div>
    )
  }

  // Default prompt mode (also used for error recovery)
  return (
    <div style={{
      backgroundColor: '#eff6ff',
      border: '1px solid #bfdbfe',
      borderRadius: 8,
      padding: compact ? 16 : 24,
      position: 'relative'
    }}>
      {showCloseButton && onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6b7280',
            fontSize: 18,
            padding: 4
          }}
          aria-label="Close"
        >
          ×
        </button>
      )}

      <div style={{ textAlign: 'center' }}>
        <h3 style={{
          margin: '0 0 8px 0',
          color: '#1e40af',
          fontSize: compact ? 16 : 18
        }}>
          📍 Find markets near you
        </h3>
        <p style={{
          color: '#3b82f6',
          margin: '0 0 16px 0',
          fontSize: compact ? 13 : 14
        }}>
          See vendors and markets within 25 miles of your location
        </p>

        {error && mode === 'error' && (
          <p style={{
            color: '#dc2626',
            fontSize: 14,
            margin: '0 0 12px 0',
            backgroundColor: '#fef2f2',
            padding: '8px 12px',
            borderRadius: 6
          }}>
            {error}
          </p>
        )}

        <div style={{
          display: 'flex',
          flexDirection: compact ? 'column' : 'row',
          gap: 12,
          justifyContent: 'center'
        }}>
          <button
            onClick={handleUseMyLocation}
            style={{
              padding: '12px 24px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <span>📍</span> Use My Location
          </button>
          <button
            onClick={() => { setMode('zip'); setError(''); }}
            style={{
              padding: '12px 24px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: 15
            }}
          >
            Enter ZIP Code
          </button>
        </div>
      </div>
    </div>
  )
}
