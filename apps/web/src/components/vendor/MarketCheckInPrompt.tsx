'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface EligibleMarket {
  marketId: string
  marketName: string | null
  marketType: string
  boothNumber: string | null
  checkedInAt: string | null
  checkedOutAt: string | null
}

const ATTESTATION =
  'By checking in you confirm you are present and operating at this market today in compliance with your applicable permits and the vendor terms.'

function fmtTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

/**
 * Phase D — vendor market-day check-in, surfaced inside the dashboard
 * "Manage Locations" card. Renders nothing unless the vendor has a market
 * operating today. Geolocation is opt-in (advisory); check-in always works
 * via self-attestation even if location is denied.
 */
export default function MarketCheckInPrompt({ vertical }: { vertical: string }) {
  const [markets, setMarkets] = useState<EligibleMarket[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch(`/api/vendor/checkins?vertical=${vertical}`)
      if (!res.ok) return
      const data = await res.json()
      setMarkets(Array.isArray(data.markets) ? data.markets : [])
    } catch {
      // non-blocking — prompt just doesn't appear
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertical])

  function getPosition(): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        () => resolve(null), // denied/unavailable → self-attest only
        // Advisory 250m geofence — coarse + forgiving beats a precise GPS fix
        // that times out on a first "allow this time" grant (esp. mobile).
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
      )
    })
  }

  async function checkIn(marketId: string) {
    setBusy(marketId)
    setError(null)
    const pos = await getPosition()
    try {
      const res = await fetch('/api/vendor/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkin', vertical, marketId, ...(pos ?? {}) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Could not check in. Please try again.')
      } else {
        await load()
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(null)
    }
  }

  async function checkOut(marketId: string) {
    setBusy(marketId)
    setError(null)
    const pos = await getPosition()
    try {
      const res = await fetch('/api/vendor/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkout', vertical, marketId, ...(pos ?? {}) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Could not check out. Please try again.')
      } else {
        await load()
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(null)
    }
  }

  if (markets.length === 0) return null

  return (
    <div style={{
      marginBottom: spacing.xs,
      padding: spacing.xs,
      backgroundColor: colors.primaryLight,
      border: `1px solid ${colors.primary}`,
      borderRadius: radius.sm,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
        {markets.map((m) => {
          const label = m.marketName || (m.marketType === 'event' ? 'your event' : 'your market')
          const isBusy = busy === m.marketId
          if (!m.checkedInAt) {
            return (
              <button
                key={m.marketId}
                onClick={() => checkIn(m.marketId)}
                disabled={isBusy}
                style={{
                  width: '100%',
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: colors.primary,
                  color: colors.surfaceElevated,
                  border: 'none',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  cursor: isBusy ? 'wait' : 'pointer',
                  opacity: isBusy ? 0.7 : 1,
                  textAlign: 'left',
                }}
              >
                📍 {isBusy ? 'Checking in…' : `Check in to ${label} now`}
                {m.boothNumber ? ` (booth ${m.boothNumber})` : ''}
              </button>
            )
          }
          if (!m.checkedOutAt) {
            return (
              <div key={m.marketId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.xs }}>
                <span style={{ fontSize: typography.sizes.sm, color: colors.primaryDark }}>
                  ✓ Checked in {fmtTime(m.checkedInAt)} — {label}
                </span>
                <button
                  onClick={() => checkOut(m.marketId)}
                  disabled={isBusy}
                  style={{
                    padding: `${spacing['3xs']} ${spacing.xs}`,
                    backgroundColor: colors.surfaceElevated,
                    color: colors.primary,
                    border: `1px solid ${colors.primary}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.semibold,
                    cursor: isBusy ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isBusy ? '…' : 'Check out'}
                </button>
              </div>
            )
          }
          return (
            <span key={m.marketId} style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
              ✓ {label}: {fmtTime(m.checkedInAt)} – {fmtTime(m.checkedOutAt)}
            </span>
          )
        })}
        {error && (
          <span style={{ fontSize: typography.sizes.xs, color: statusDanger }}>{error}</span>
        )}
        <span style={{ fontSize: typography.sizes.xs, color: colors.primaryDark, lineHeight: 1.3 }}>
          {ATTESTATION}
        </span>
      </div>
    </div>
  )
}

const statusDanger = '#dc2626'
