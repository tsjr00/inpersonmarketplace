'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { getMapsUrl } from '@/lib/utils/maps-link'
import LocationSearchInline from '@/components/location/LocationSearchInline'
import { getRadiusOptions } from '@/lib/vertical'
import { FullPageLoading } from '@/components/shared/Spinner'

interface TruckSchedule {
  vendor_id: string
  truck_name: string
  profile_image_url: string | null
  location_name: string
  address: string
  city: string
  start_time: string | null
  end_time: string | null
  distance_miles: number | null
  market_id: string
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

export default function WhereTodayPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const isFT = vertical === 'food_trucks'

  const [trucks, setTrucks] = useState<TruckSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [dayOffset, setDayOffset] = useState(0)
  const [dayName, setDayName] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [hasLocation, setHasLocation] = useState(false)
  const [userLat, setUserLat] = useState(0)
  const [userLng, setUserLng] = useState(0)
  const [currentRadius, setCurrentRadius] = useState(25)
  const radiusOptions = getRadiusOptions(vertical)

  useEffect(() => {
    // Check for saved location
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('user_location='))
    if (cookie) {
      try {
        const data = JSON.parse(decodeURIComponent(cookie.split('=').slice(1).join('=')))
        if (data.latitude && data.longitude) {
          setUserLat(data.latitude)
          setUserLng(data.longitude)
          setHasLocation(true)
          if (data.radius) setCurrentRadius(data.radius)
        }
      } catch { /* ignore */ }
    }
  }, [])

  const fetchTrucks = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        vertical,
        offset: String(dayOffset),
        radius: String(currentRadius),
      })
      if (hasLocation) {
        params.set('lat', String(userLat))
        params.set('lng', String(userLng))
      }
      const res = await fetch(`/api/trucks/where-today?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTrucks(data.trucks || [])
        setDayName(DAY_NAMES[data.day_of_week] || '')
        setDateStr(data.date || '')
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTrucks() }, [dayOffset, hasLocation, userLat, userLng, currentRadius])

  const handleLocationSet = (lat: number, lng: number) => {
    setUserLat(lat)
    setUserLng(lng)
    setHasLocation(true)
  }

  const title = isFT ? 'Where Are Trucks Today?' : 'What Markets Are Open?'

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.surfaceBase }}>
      <div style={{ maxWidth: containers.md, margin: '0 auto', padding: `${spacing.lg} ${spacing.md}` }}>

        {/* Header */}
        <Link href={`/${vertical}/dashboard`} style={{ color: colors.primary, textDecoration: 'none', fontSize: typography.sizes.sm }}>
          ← Dashboard
        </Link>
        <h1 style={{ margin: `${spacing.xs} 0 ${spacing.sm}`, fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary }}>
          {title}
        </h1>

        {/* Location */}
        {!hasLocation ? (
          <div style={{ marginBottom: spacing.md }}>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, marginBottom: spacing.xs }}>
              Enter your location to find {isFT ? 'food trucks' : 'markets'} near you
            </p>
            <LocationSearchInline
              onLocationSet={handleLocationSet}
              radiusOptions={radiusOptions}
            />
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: spacing.xs,
            marginBottom: spacing.md, padding: `${spacing.xs} ${spacing.sm}`,
            backgroundColor: colors.primaryLight, border: `1px solid ${colors.primary}`,
            borderRadius: radius.md, fontSize: typography.sizes.sm, flexWrap: 'wrap'
          }}>
            <span style={{ color: colors.primaryDark }}>📍 Showing {isFT ? 'trucks' : 'markets'} within {currentRadius} miles</span>
            {radiusOptions.map(r => (
              <button key={r} onClick={() => setCurrentRadius(r)} style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: currentRadius === r ? colors.textMuted : 'white',
                color: currentRadius === r ? 'white' : colors.textPrimary,
                border: `1px solid ${currentRadius === r ? colors.textMuted : colors.border}`,
                borderRadius: radius.sm, fontSize: typography.sizes.xs, cursor: 'pointer',
              }}>
                {r}mi
              </button>
            ))}
          </div>
        )}

        {/* Day Selector */}
        <div style={{ display: 'flex', gap: spacing['2xs'], marginBottom: spacing.md, flexWrap: 'wrap' }}>
          {[0, 1, 2, 3, 4, 5, 6].map(offset => {
            const d = new Date()
            d.setDate(d.getDate() + offset)
            const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : DAY_NAMES[d.getDay()]
            return (
              <button key={offset} onClick={() => setDayOffset(offset)} style={{
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: dayOffset === offset ? colors.textMuted : 'white',
                color: dayOffset === offset ? 'white' : colors.textPrimary,
                border: `1px solid ${dayOffset === offset ? colors.textMuted : colors.border}`,
                borderRadius: radius.md, fontSize: typography.sizes.sm,
                fontWeight: dayOffset === offset ? typography.weights.semibold : typography.weights.normal,
                cursor: 'pointer',
              }}>
                {label}
              </button>
            )
          })}
        </div>

        {/* Results */}
        {loading ? (
          <FullPageLoading message="Finding trucks..." />
        ) : trucks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: spacing.xl }}>
            <p style={{ fontSize: typography.sizes.xl, margin: `0 0 ${spacing.xs}`, color: colors.textMuted }}>
              No {isFT ? 'trucks' : 'markets'} scheduled for {dayName}
            </p>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: 0 }}>
              {dayOffset === 0 ? 'Check tomorrow or later this week!' : 'Try another day.'}
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing.sm}` }}>
              {trucks.length} {isFT ? 'truck' : 'market'}{trucks.length !== 1 ? 's' : ''} on {dayName}{dateStr ? `, ${new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              {trucks.map((t, i) => (
                <div key={`${t.vendor_id}-${t.market_id}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: spacing.sm,
                  padding: spacing.sm, backgroundColor: colors.surfaceElevated,
                  border: `1px solid ${colors.border}`, borderRadius: radius.md,
                }}>
                  {/* Truck info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/${vertical}/vendor/${t.vendor_id}/profile`} style={{
                      fontSize: typography.sizes.base, fontWeight: typography.weights.semibold,
                      color: colors.textPrimary, textDecoration: 'none',
                    }}>
                      {t.truck_name}
                    </Link>
                    <div style={{ marginTop: spacing['3xs'] }}>
                      <a
                        href={getMapsUrl(t.address.split(',')[0], t.city, '', null)}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: typography.sizes.sm, color: colors.primary, textDecoration: 'none' }}
                      >
                        📍 {t.location_name}
                      </a>
                      <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginLeft: spacing.xs }}>
                        {t.address}
                      </span>
                    </div>
                  </div>

                  {/* Time + distance */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, color: colors.textPrimary }}>
                      {formatTime(t.start_time)}{t.end_time ? ` – ${formatTime(t.end_time)}` : ''}
                    </div>
                    {t.distance_miles !== null && (
                      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                        {t.distance_miles} mi
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
