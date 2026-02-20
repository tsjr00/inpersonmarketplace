'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import MarketScheduleSelector from '@/components/vendor/MarketScheduleSelector'
import ErrorDisplay from '@/components/shared/ErrorDisplay'
import { term } from '@/lib/vertical'
import { colors, statusColors, spacing, radius } from '@/lib/design-tokens'

type Schedule = {
  id?: string
  day_of_week: number
  start_time: string
  end_time: string
  active?: boolean
}

type Market = {
  id: string
  name: string
  market_type: string
  address: string
  city: string
  state: string
  zip: string
  latitude?: number | null
  longitude?: number | null
  day_of_week?: number
  start_time?: string
  end_time?: string
  season_start?: string
  season_end?: string
  event_start_date?: string | null
  event_end_date?: string | null
  event_url?: string | null
  expires_at?: string | null
  cutoff_hours?: number | null
  isHomeMarket?: boolean
  canUse?: boolean
  homeMarketRestricted?: boolean
  hasAttendance?: boolean
  schedules?: Schedule[]
}

type MarketSuggestion = {
  id: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  description?: string
  website?: string
  approval_status: 'pending' | 'approved' | 'rejected'
  rejection_reason?: string
  submitted_at: string
  schedules?: Schedule[]
}

type MarketLimits = {
  traditionalMarkets: number
  privatePickupLocations: number
  currentFixedMarketCount: number
  currentPrivatePickupCount: number
  canAddFixed: boolean
  canAddPrivatePickup: boolean
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function VendorMarketsPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string

  const [fixedMarkets, setFixedMarkets] = useState<Market[]>([])
  const [eventMarkets, setEventMarkets] = useState<Market[]>([])
  const [privatePickupMarkets, setPrivatePickupMarkets] = useState<Market[]>([])
  const [marketSuggestions, setMarketSuggestions] = useState<MarketSuggestion[]>([])
  const [limits, setLimits] = useState<MarketLimits | null>(null)
  const [homeMarketId, setHomeMarketId] = useState<string | null>(null)
  const [vendorTier, setVendorTier] = useState<string>('standard')
  const [vendorStatus, setVendorStatus] = useState<string>('pending')
  const [isPremium, setIsPremium] = useState(false)
  const [changingHomeMarket, setChangingHomeMarket] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showSuggestionForm, setShowSuggestionForm] = useState(false)
  const [showEventSuggestionForm, setShowEventSuggestionForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    latitude: '',
    longitude: '',
    season_start: '',
    season_end: '',
    expires_at: '',
    pickup_windows: [{ day_of_week: '', start_time: '09:00', end_time: '12:00' }] as { day_of_week: string; start_time: string; end_time: string }[]
  })
  const [suggestionFormData, setSuggestionFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    description: '',
    website: '',
    season_start: '',
    season_end: '',
    schedules: [{ day_of_week: '', start_time: '08:00', end_time: '13:00' }] as { day_of_week: string; start_time: string; end_time: string }[],
    vendor_sells_at_market: true
  })
  const [editingMarket, setEditingMarket] = useState<Market | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false)
  const [error, setError] = useState<{ error: string; code?: string; traceId?: string; details?: string } | null>(null)
  const [selectedMarketForSchedule, setSelectedMarketForSchedule] = useState<Market | null>(null)

  useEffect(() => {
    fetchMarkets()
  }, [vertical])

  const fetchMarkets = async () => {
    try {
      const res = await fetch(`/api/vendor/markets?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        setFixedMarkets(data.fixedMarkets || [])
        setEventMarkets(data.eventMarkets || [])
        setPrivatePickupMarkets(data.privatePickupMarkets || [])
        setMarketSuggestions(data.marketSuggestions || [])
        setLimits(data.limits)
        setHomeMarketId(data.homeMarketId || null)
        setVendorTier(data.vendorTier || 'standard')
        setVendorStatus(data.vendorStatus || 'pending')
        setIsPremium(data.isPremium || false)
      } else if (res.status === 404) {
        // Vendor profile not found - redirect to signup
        router.push(`/${vertical}/vendor-signup`)
      }
    } catch (err) {
      console.error('Error fetching markets:', err)
      setError({ error: 'Failed to load markets' })
    } finally {
      setLoading(false)
    }
  }

  const handleSetHomeMarket = async (marketId: string) => {
    if (isPremium) return // Premium vendors don't need home market

    setChangingHomeMarket(true)
    setError(null)

    try {
      const res = await fetch('/api/vendor/home-market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical, marketId })
      })

      const data = await res.json()

      if (!res.ok) {
        setError({
          error: data.error || 'Failed to change home market',
          code: data.code,
          traceId: data.traceId,
          details: data.details
        })
        return
      }

      // Refresh markets to update UI
      await fetchMarkets()
    } catch (err) {
      console.error('Error changing home market:', err)
      setError({ error: 'Failed to change home market' })
    } finally {
      setChangingHomeMarket(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    // Validate pickup windows
    const validWindows = formData.pickup_windows.filter(w => w.day_of_week !== '' && w.start_time && w.end_time)
    if (validWindows.length === 0) {
      setError({ error: 'At least one pickup window is required' })
      setSubmitting(false)
      return
    }

    // Parse lat/lng if provided
    const latitude = formData.latitude ? parseFloat(formData.latitude) : null
    const longitude = formData.longitude ? parseFloat(formData.longitude) : null

    // Validate coordinates if provided
    if (formData.latitude && formData.longitude) {
      if (isNaN(latitude!) || isNaN(longitude!)) {
        setError({ error: 'Please enter valid numeric values for Latitude and Longitude.' })
        setSubmitting(false)
        return
      }
      if (latitude! < -90 || latitude! > 90 || longitude! < -180 || longitude! > 180) {
        setError({ error: 'Invalid coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.' })
        setSubmitting(false)
        return
      }
    }

    try {
      if (editingMarket) {
        // Update
        const res = await fetch(`/api/vendor/markets/${editingMarket.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            address: formData.address,
            city: formData.city,
            state: formData.state,
            zip: formData.zip,
            latitude,
            longitude,
            season_start: formData.season_start || null,
            season_end: formData.season_end || null,
            expires_at: formData.expires_at || null,
            pickup_windows: validWindows
          })
        })

        if (res.ok) {
          await fetchMarkets()
          resetForm()
        } else {
          const errData = await res.json()
          setError({
            error: errData.error || 'Failed to update market',
            code: errData.code,
            traceId: errData.traceId,
            details: errData.details
          })
        }
      } else {
        // Create
        const res = await fetch('/api/vendor/markets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vertical,
            name: formData.name,
            address: formData.address,
            city: formData.city,
            state: formData.state,
            zip: formData.zip,
            latitude,
            longitude,
            season_start: formData.season_start || null,
            season_end: formData.season_end || null,
            expires_at: formData.expires_at || null,
            pickup_windows: validWindows
          })
        })

        if (res.ok) {
          await fetchMarkets()
          resetForm()
        } else {
          const errData = await res.json()
          setError({
            error: errData.error || 'Failed to create market',
            code: errData.code,
            traceId: errData.traceId,
            details: errData.details
          })
        }
      }
    } catch (err) {
      console.error('Error saving market:', err)
      setError({ error: 'Failed to save market' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (market: Market) => {
    setEditingMarket(market)
    const windows = market.schedules && market.schedules.length > 0
      ? market.schedules.map(s => ({
          day_of_week: String(s.day_of_week),
          start_time: s.start_time,
          end_time: s.end_time
        }))
      : [{ day_of_week: '', start_time: '09:00', end_time: '12:00' }]
    setFormData({
      name: market.name,
      address: market.address,
      city: market.city,
      state: market.state,
      zip: market.zip,
      latitude: market.latitude?.toString() || '',
      longitude: market.longitude?.toString() || '',
      season_start: market.season_start || '',
      season_end: market.season_end || '',
      expires_at: market.expires_at ? market.expires_at.split('T')[0] : '',
      pickup_windows: windows
    })
    setShowForm(true)
    setError(null)
  }

  const handleDelete = async (marketId: string) => {
    if (!confirm('Are you sure you want to delete this pickup location? This cannot be undone.')) {
      return
    }

    try {
      const res = await fetch(`/api/vendor/markets/${marketId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        await fetchMarkets()
      } else {
        const errData = await res.json()
        setError({
          error: errData.error || 'Failed to delete market',
          code: errData.code,
          traceId: errData.traceId,
          details: errData.details
        })
      }
    } catch (err) {
      console.error('Error deleting market:', err)
      setError({ error: 'Failed to delete market' })
    }
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingMarket(null)
    setFormData({
      name: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      latitude: '',
      longitude: '',
      season_start: '',
      season_end: '',
      expires_at: '',
      pickup_windows: [{ day_of_week: '', start_time: '09:00', end_time: '12:00' }]
    })
    setError(null)
  }

  const handleSuggestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmittingSuggestion(true)
    setError(null)

    // Validate schedules
    const validSchedules = suggestionFormData.schedules.filter(s => s.day_of_week !== '' && s.start_time && s.end_time)
    if (validSchedules.length === 0) {
      setError({ error: 'At least one market day/time is required' })
      setSubmittingSuggestion(false)
      return
    }

    try {
      const res = await fetch('/api/vendor/markets/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vertical,
          name: suggestionFormData.name,
          address: suggestionFormData.address,
          city: suggestionFormData.city,
          state: suggestionFormData.state,
          zip: suggestionFormData.zip,
          description: suggestionFormData.description || null,
          website: suggestionFormData.website || null,
          season_start: suggestionFormData.season_start || null,
          season_end: suggestionFormData.season_end || null,
          schedules: validSchedules.map(s => ({
            day_of_week: parseInt(s.day_of_week),
            start_time: s.start_time,
            end_time: s.end_time
          })),
          vendor_sells_at_market: suggestionFormData.vendor_sells_at_market
        })
      })

      if (res.ok) {
        await fetchMarkets()
        resetSuggestionForm()
      } else {
        const errData = await res.json()
        setError({
          error: errData.error || 'Failed to submit market suggestion',
          code: errData.code,
          traceId: errData.traceId,
          details: errData.details
        })
      }
    } catch (err) {
      console.error('Error submitting market suggestion:', err)
      setError({ error: 'Failed to submit market suggestion' })
    } finally {
      setSubmittingSuggestion(false)
    }
  }

  const resetSuggestionForm = () => {
    setShowSuggestionForm(false)
    setSuggestionFormData({
      name: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      description: '',
      website: '',
      season_start: '',
      season_end: '',
      schedules: [{ day_of_week: '', start_time: '08:00', end_time: '13:00' }],
      vendor_sells_at_market: true
    })
    setError(null)
  }

  // Helper to add a suggestion schedule
  const addSuggestionSchedule = () => {
    if (suggestionFormData.schedules.length < 7) {
      setSuggestionFormData({
        ...suggestionFormData,
        schedules: [...suggestionFormData.schedules, { day_of_week: '', start_time: '08:00', end_time: '13:00' }]
      })
    }
  }

  // Helper to remove a suggestion schedule
  const removeSuggestionSchedule = (index: number) => {
    if (suggestionFormData.schedules.length > 1) {
      const newSchedules = suggestionFormData.schedules.filter((_, i) => i !== index)
      setSuggestionFormData({ ...suggestionFormData, schedules: newSchedules })
    }
  }

  // Helper to update a suggestion schedule
  const updateSuggestionSchedule = (index: number, field: string, value: string) => {
    const newSchedules = [...suggestionFormData.schedules]
    newSchedules[index] = { ...newSchedules[index], [field]: value }
    setSuggestionFormData({ ...suggestionFormData, schedules: newSchedules })
  }

  const isFoodTruck = vertical === 'food_trucks'

  // Default cutoff hours by vertical and market type
  const getDefaultCutoffHours = (marketType: string): number => {
    if (marketType === 'event') return 24 // Events always use advance cutoff
    if (isFoodTruck) return 0 // Food trucks prepare on the spot
    return marketType === 'private_pickup' ? 10 : 18
  }

  // Helper to calculate cutoff time display
  // Returns null for 0 cutoff (food trucks — orders accepted until pickup)
  const getCutoffDisplay = (dayOfWeek: number, startTime: string, cutoffHrs: number): string | null => {
    if (cutoffHrs === 0) return null // No cutoff to display

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const [hours, minutes] = startTime.split(':').map(Number)

    let cutoffHour = hours - cutoffHrs
    let cutoffDay = dayOfWeek

    while (cutoffHour < 0) {
      cutoffHour += 24
      cutoffDay = cutoffDay === 0 ? 6 : cutoffDay - 1
    }

    const cutoffDayName = days[cutoffDay]
    const cutoffTime = `${cutoffHour % 12 || 12}:${minutes.toString().padStart(2, '0')} ${cutoffHour >= 12 ? 'PM' : 'AM'}`
    return `${cutoffDayName} at ${cutoffTime}`
  }

  // Helper to format 24h time to 12h
  const formatTime12h = (time24: string): string => {
    if (!time24) return ''
    const [hours, minutes] = time24.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const hours12 = hours % 12 || 12
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  // Max pickup windows based on tier (standard: 2, premium: 6)
  const maxPickupWindows = isPremium ? 6 : 2

  // Helper to add a pickup window
  const addPickupWindow = () => {
    if (formData.pickup_windows.length < maxPickupWindows) {
      setFormData({
        ...formData,
        pickup_windows: [...formData.pickup_windows, { day_of_week: '', start_time: '09:00', end_time: '12:00' }]
      })
    }
  }

  // Helper to remove a pickup window
  const removePickupWindow = (index: number) => {
    if (formData.pickup_windows.length > 1) {
      const newWindows = formData.pickup_windows.filter((_, i) => i !== index)
      setFormData({ ...formData, pickup_windows: newWindows })
    }
  }

  // Helper to update a pickup window
  const updatePickupWindow = (index: number, field: string, value: string) => {
    const newWindows = [...formData.pickup_windows]
    newWindows[index] = { ...newWindows[index], [field]: value }
    setFormData({ ...formData, pickup_windows: newWindows })
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: statusColors.neutral50
      }}>
        <p>Loading markets...</p>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: statusColors.neutral50,
      padding: '24px 16px'
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12
        }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 'bold' }}>My {term(vertical, 'markets')}</h1>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              padding: '10px 20px',
              backgroundColor: statusColors.neutral500,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            Back to Dashboard
          </Link>
        </div>

        {/* Error Message */}
        {error && (
          <ErrorDisplay
            error={error}
            onDismiss={() => setError(null)}
          />
        )}

        {/* Onboarding Banner for Non-Approved Vendors */}
        {vendorStatus !== 'approved' && (
          <div style={{
            padding: 16,
            backgroundColor: statusColors.warningLight,
            border: `1px solid ${statusColors.warningBorder}`,
            borderRadius: 8,
            marginBottom: 24,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12
          }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>!</span>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 600, color: statusColors.warningDark }}>
                Complete Your Setup
              </h3>
              <p style={{ margin: 0, fontSize: 14, color: statusColors.warningDark, lineHeight: 1.5 }}>
                Your vendor account is pending approval. You can browse available {term(vertical, 'markets').toLowerCase()} while you wait.
                Once approved, you&apos;ll be able to join {term(vertical, 'markets').toLowerCase()} and start accepting orders.
              </p>
              <Link
                href={`/${vertical}/vendor/dashboard`}
                style={{
                  display: 'inline-block',
                  marginTop: 8,
                  padding: '8px 16px',
                  backgroundColor: statusColors.warningDark,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Traditional Markets Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: `1px solid ${statusColors.neutral200}`,
          padding: 24,
          marginBottom: 24
        }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 600 }}>
              {term(vertical, 'traditional_markets')}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: statusColors.neutral500 }}>
              {isFoodTruck
                ? 'Food truck parks and event locations where you can set up.'
                : 'Traditional schedule farmers markets.'}
              {limits && ` You can join ${limits.traditionalMarkets} ${limits.traditionalMarkets > 1 ? term(vertical, 'traditional_markets').toLowerCase() : term(vertical, 'traditional_market').toLowerCase()} (${limits.currentFixedMarketCount} of ${limits.traditionalMarkets} used).`}
              {limits && !limits.canAddFixed && (
                <span style={{ color: statusColors.danger, marginLeft: 8 }}>
                  Limit reached. <a href={`/${vertical}/settings`} style={{ color: statusColors.info }}>Upgrade</a> for more markets.
                </span>
              )}
            </p>
          </div>

          {fixedMarkets.length === 0 ? (
            <p style={{ color: statusColors.neutral400, fontStyle: 'italic', margin: 0 }}>
              No {term(vertical, 'traditional_markets').toLowerCase()} available yet. Check back soon!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {fixedMarkets.map(market => (
                <div
                  key={market.id}
                  style={{
                    padding: 16,
                    border: market.isHomeMarket ? `2px solid ${statusColors.info}` : `1px solid ${statusColors.neutral200}`,
                    borderRadius: 8,
                    backgroundColor: market.isHomeMarket ? statusColors.infoLight : 'white'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                          {market.name}
                        </h3>
                        {market.isHomeMarket && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            backgroundColor: statusColors.info,
                            color: 'white',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600
                          }}>
                            🏠 {vertical === 'food_trucks' ? 'Home Park' : 'Home Market'}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: '0 0 4px 0', fontSize: 14, color: statusColors.neutral500 }}>
                        {market.address}, {market.city}, {market.state} {market.zip}
                      </p>
                      {market.day_of_week !== null && market.day_of_week !== undefined && (
                        <p style={{ margin: '0 0 8px 0', fontSize: 14, color: statusColors.neutral500 }}>
                          {DAYS[market.day_of_week]} {market.start_time} - {market.end_time}
                        </p>
                      )}
                      {/* Cutoff time for traditional markets */}
                      {market.day_of_week !== null && market.day_of_week !== undefined && market.start_time && (() => {
                        const cutoffHrs = market.cutoff_hours ?? getDefaultCutoffHours('traditional')
                        const display = getCutoffDisplay(market.day_of_week!, market.start_time!, cutoffHrs)
                        return display ? (
                          <div style={{
                            padding: '6px 10px',
                            backgroundColor: statusColors.warningLight,
                            borderRadius: 4,
                            fontSize: 12,
                            color: statusColors.warningDark,
                            marginBottom: 12,
                            display: 'inline-block'
                          }}>
                            <strong>Order cutoff:</strong> {display}
                          </div>
                        ) : (
                          <div style={{
                            padding: '6px 10px',
                            backgroundColor: colors.primaryLight,
                            borderRadius: 4,
                            fontSize: 12,
                            color: colors.primaryDark,
                            marginBottom: 12,
                            display: 'inline-block'
                          }}>
                            Orders accepted until pickup time
                          </div>
                        )
                      })()}
                    </div>
                    {/* Set as Home Market button - only for standard vendors, not on current home market */}
                    {!isPremium && !market.isHomeMarket && (
                      <button
                        onClick={() => handleSetHomeMarket(market.id)}
                        disabled={changingHomeMarket}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: changingHomeMarket ? statusColors.neutral400 : statusColors.neutral100,
                          color: statusColors.neutral700,
                          border: `1px solid ${statusColors.neutral300}`,
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: changingHomeMarket ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {changingHomeMarket ? 'Changing...' : (vertical === 'food_trucks' ? 'Set as Home Park' : 'Set as Home Market')}
                      </button>
                    )}
                  </div>
                  {/* Attendance prompt for markets without schedule set */}
                  {!market.hasAttendance && (
                    <div style={{
                      marginTop: 8,
                      padding: 10,
                      backgroundColor: statusColors.warningLight,
                      border: `1px solid ${statusColors.warningBorder}`,
                      borderRadius: 6,
                      fontSize: 13,
                      color: statusColors.warningDark,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <span style={{ fontSize: 16 }}>!</span>
                      <span>
                        Set your schedule to start accepting orders at this {vertical === 'food_trucks' ? 'park' : 'market'}.
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <button
                      onClick={() => router.push(`/${vertical}/vendor/listings?market=${market.id}`)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: statusColors.info,
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Manage Listings
                    </button>
                    <button
                      onClick={() => setSelectedMarketForSchedule(market)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: !market.hasAttendance ? statusColors.warning : colors.primary,
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {!market.hasAttendance ? 'Set Schedule' : 'Manage Schedule'}
                    </button>
                    <Link
                      href={`/${vertical}/vendor/markets/${market.id}/prep`}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'transparent',
                        color: colors.primary,
                        border: `1px solid ${colors.primary}`,
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'inline-block'
                      }}
                    >
                      📋 Prep Sheet
                    </Link>
                  </div>

                  {/* Schedule Selector - shown inline when this market is selected */}
                  {selectedMarketForSchedule?.id === market.id && (
                    <div style={{ marginTop: 16 }}>
                      <MarketScheduleSelector
                        marketId={market.id}
                        marketName={market.name}
                        vertical={vertical}
                        onClose={() => setSelectedMarketForSchedule(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Suggest a Farmers Market Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: `1px solid ${statusColors.neutral200}`,
          padding: 24,
          marginBottom: 24
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 600 }}>
                {term(vertical, 'suggest_market_cta')}
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: statusColors.neutral500 }}>
                {isFoodTruck
                  ? "Know of a food truck park or event location that isn't listed? Submit it for review and help grow our community."
                  : "Know of a farmers market that isn't listed? Submit it for review and help grow our community."}
              </p>
            </div>
            {!showSuggestionForm && (
              <button
                onClick={() => setShowSuggestionForm(true)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {term(vertical, 'suggest_market_cta')}
              </button>
            )}
          </div>

          {/* Info Notice */}
          <div style={{
            padding: 16,
            backgroundColor: colors.primaryLight,
            border: '1px solid ${colors.border}',
            borderRadius: 8,
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 20 }}>ℹ️</span>
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600, color: colors.primaryDark }}>
                  How Market Suggestions Work
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: colors.primaryDark, lineHeight: 1.5 }}>
                  {isFoodTruck
                    ? 'When you suggest a location, our team will review it to verify the information. Once approved, the location will appear in the public list and all truck operators can join it. This helps ensure we only list real, verified locations.'
                    : 'When you suggest a farmers market, our team will review it to verify the information. Once approved, the market will appear in the public markets list and all vendors can join it. This helps ensure we only list real, verified markets.'}
                </p>
              </div>
            </div>
          </div>

          {/* Suggestion Form */}
          {showSuggestionForm && (
            <form
              onSubmit={handleSuggestionSubmit}
              style={{
                padding: 20,
                border: `1px solid ${statusColors.neutral200}`,
                borderRadius: 8,
                backgroundColor: statusColors.neutral50,
                marginBottom: 20
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>
                New {term(vertical, 'market')} Suggestion
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    {term(vertical, 'market')} Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={suggestionFormData.name}
                    onChange={(e) => setSuggestionFormData({ ...suggestionFormData, name: e.target.value })}
                    placeholder={isFoodTruck ? 'e.g., Downtown Food Truck Park' : 'e.g., Downtown Saturday Market'}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${statusColors.neutral300}`,
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Do you sell at this market? */}
                <div style={{
                  padding: 16,
                  backgroundColor: suggestionFormData.vendor_sells_at_market ? colors.primaryLight : statusColors.warningLight,
                  border: `1px solid ${suggestionFormData.vendor_sells_at_market ? colors.primary : statusColors.warningBorder}`,
                  borderRadius: 8
                }}>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 12, color: statusColors.neutral700 }}>
                    Do you sell at this market? *
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      backgroundColor: suggestionFormData.vendor_sells_at_market ? colors.primaryLight : 'white',
                      border: `2px solid ${suggestionFormData.vendor_sells_at_market ? colors.primary : statusColors.neutral200}`,
                      borderRadius: 6,
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="vendor_sells_at_market"
                        checked={suggestionFormData.vendor_sells_at_market === true}
                        onChange={() => setSuggestionFormData({ ...suggestionFormData, vendor_sells_at_market: true })}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontWeight: 500, color: colors.primaryDark }}>Yes, I sell at this market</div>
                        <div style={{ fontSize: 12, color: statusColors.neutral500 }}>I&apos;ll be associated with this market when approved</div>
                      </div>
                    </label>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      backgroundColor: !suggestionFormData.vendor_sells_at_market ? statusColors.warningLight : 'white',
                      border: `2px solid ${!suggestionFormData.vendor_sells_at_market ? statusColors.warning : statusColors.neutral200}`,
                      borderRadius: 6,
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="vendor_sells_at_market"
                        checked={suggestionFormData.vendor_sells_at_market === false}
                        onChange={() => setSuggestionFormData({ ...suggestionFormData, vendor_sells_at_market: false })}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontWeight: 500, color: statusColors.warningDark }}>No, but I think it should be on the platform</div>
                        <div style={{ fontSize: 12, color: statusColors.neutral500 }}>This is a lead/referral for the platform to pursue</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={suggestionFormData.address}
                    onChange={(e) => setSuggestionFormData({ ...suggestionFormData, address: e.target.value })}
                    placeholder="Street address or location description"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${statusColors.neutral300}`,
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      value={suggestionFormData.city}
                      onChange={(e) => setSuggestionFormData({ ...suggestionFormData, city: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      State *
                    </label>
                    <input
                      type="text"
                      required
                      value={suggestionFormData.state}
                      onChange={(e) => setSuggestionFormData({ ...suggestionFormData, state: e.target.value })}
                      maxLength={2}
                      placeholder="TX"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      ZIP *
                    </label>
                    <input
                      type="text"
                      required
                      value={suggestionFormData.zip}
                      onChange={(e) => setSuggestionFormData({ ...suggestionFormData, zip: e.target.value })}
                      maxLength={10}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Description <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                  </label>
                  <textarea
                    value={suggestionFormData.description}
                    onChange={(e) => setSuggestionFormData({ ...suggestionFormData, description: e.target.value })}
                    placeholder="Any additional details about this market..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${statusColors.neutral300}`,
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: 'border-box',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Website <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={suggestionFormData.website}
                    onChange={(e) => setSuggestionFormData({ ...suggestionFormData, website: e.target.value })}
                    placeholder="https://..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${statusColors.neutral300}`,
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Season Dates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      Season Start <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={suggestionFormData.season_start}
                      onChange={(e) => setSuggestionFormData({ ...suggestionFormData, season_start: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: statusColors.neutral500 }}>
                      When does this market&apos;s season begin?
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      Season End <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={suggestionFormData.season_end}
                      onChange={(e) => setSuggestionFormData({ ...suggestionFormData, season_end: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: statusColors.neutral500 }}>
                      When does this market&apos;s season end?
                    </p>
                  </div>
                </div>
                <p style={{ margin: '4px 0 12px 0', fontSize: 13, color: statusColors.neutral500, fontStyle: 'italic' }}>
                  Leave blank if the market operates year-round.
                </p>

                {/* Market Schedule Section */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 14, fontWeight: 500 }}>
                      Market Days/Times *
                    </label>
                    {suggestionFormData.schedules.length < 7 && (
                      <button
                        type="button"
                        onClick={addSuggestionSchedule}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: statusColors.infoLight,
                          color: statusColors.infoDark,
                          border: 'none',
                          borderRadius: 4,
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'pointer'
                        }}
                      >
                        + Add Another Day
                      </button>
                    )}
                  </div>

                  {suggestionFormData.schedules.map((schedule, index) => (
                    <div
                      key={index}
                      style={{
                        padding: 12,
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        backgroundColor: 'white',
                        marginBottom: 8
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 120px', minWidth: 120 }}>
                          <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>
                            Day
                          </label>
                          <select
                            value={schedule.day_of_week}
                            onChange={(e) => updateSuggestionSchedule(index, 'day_of_week', e.target.value)}
                            required
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: `1px solid ${statusColors.neutral300}`,
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: 'border-box'
                            }}
                          >
                            <option value="">Select day...</option>
                            {DAYS.map((day, i) => (
                              <option key={day} value={i}>{day}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: '0 0 100px' }}>
                          <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={schedule.start_time}
                            onChange={(e) => updateSuggestionSchedule(index, 'start_time', e.target.value)}
                            required
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: `1px solid ${statusColors.neutral300}`,
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        <div style={{ flex: '0 0 100px' }}>
                          <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>
                            End Time
                          </label>
                          <input
                            type="time"
                            value={schedule.end_time}
                            onChange={(e) => updateSuggestionSchedule(index, 'end_time', e.target.value)}
                            required
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: `1px solid ${statusColors.neutral300}`,
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        {suggestionFormData.schedules.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSuggestionSchedule(index)}
                            style={{
                              padding: '8px',
                              backgroundColor: statusColors.dangerLight,
                              color: statusColors.dangerDark,
                              border: 'none',
                              borderRadius: 4,
                              fontSize: 14,
                              cursor: 'pointer',
                              alignSelf: 'flex-end'
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button
                  type="submit"
                  disabled={submittingSuggestion}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: submittingSuggestion ? statusColors.neutral400 : colors.primary,
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: submittingSuggestion ? 'not-allowed' : 'pointer'
                  }}
                >
                  {submittingSuggestion ? 'Submitting...' : 'Submit for Review'}
                </button>
                <button
                  type="button"
                  onClick={resetSuggestionForm}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: statusColors.neutral200,
                    color: statusColors.neutral700,
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* My Suggestions List */}
          {marketSuggestions.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600 }}>
                My Suggestions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {marketSuggestions.map(suggestion => (
                  <div
                    key={suggestion.id}
                    style={{
                      padding: 16,
                      border: `1px solid ${statusColors.neutral200}`,
                      borderRadius: 8,
                      backgroundColor: suggestion.approval_status === 'rejected' ? statusColors.dangerLight :
                                       suggestion.approval_status === 'approved' ? statusColors.successLight : statusColors.warningLight
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                            {suggestion.name}
                          </h4>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            backgroundColor: suggestion.approval_status === 'rejected' ? statusColors.danger :
                                           suggestion.approval_status === 'approved' ? statusColors.success : statusColors.warning,
                            color: 'white',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            textTransform: 'capitalize'
                          }}>
                            {suggestion.approval_status === 'pending' ? 'Pending Review' : suggestion.approval_status}
                          </span>
                        </div>
                        <p style={{ margin: '0 0 4px 0', fontSize: 14, color: statusColors.neutral500 }}>
                          {suggestion.address}, {suggestion.city}, {suggestion.state} {suggestion.zip}
                        </p>
                        {suggestion.schedules && suggestion.schedules.length > 0 && (
                          <p style={{ margin: '0 0 4px 0', fontSize: 14, color: statusColors.neutral500 }}>
                            {suggestion.schedules.map((s, i) => (
                              <span key={i}>
                                {i > 0 && ', '}
                                {DAYS[s.day_of_week]} {formatTime12h(s.start_time)} - {formatTime12h(s.end_time)}
                              </span>
                            ))}
                          </p>
                        )}
                        <p style={{ margin: 0, fontSize: 12, color: statusColors.neutral400 }}>
                          Submitted {new Date(suggestion.submitted_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {suggestion.approval_status === 'rejected' && suggestion.rejection_reason && (
                      <div style={{
                        marginTop: 12,
                        padding: '10px 12px',
                        backgroundColor: statusColors.dangerLight,
                        borderRadius: 6,
                        fontSize: 13,
                        color: statusColors.dangerDark
                      }}>
                        <strong>Reason:</strong> {suggestion.rejection_reason}
                      </div>
                    )}
                    {suggestion.approval_status === 'approved' && (
                      <div style={{
                        marginTop: 12,
                        padding: '10px 12px',
                        backgroundColor: colors.primaryLight,
                        borderRadius: 6,
                        fontSize: 13,
                        color: colors.primaryDark
                      }}>
                        This {term(vertical, 'traditional_market').toLowerCase()} has been approved and is now available in the {term(vertical, 'traditional_markets')} list above.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Upcoming Events Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: `1px solid ${statusColors.neutral200}`,
          padding: 24
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16
          }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 600,margin: 0 }}>
                🎪 {term(vertical, 'events')}
              </h2>
              <p style={{ fontSize: 14,color: colors.textMuted, margin: '4px 0 0' }}>
                Upcoming festivals, fairs, and special events. Events don&apos;t count against your location limits.
              </p>
            </div>
            <button
              onClick={() => setShowEventSuggestionForm(!showEventSuggestionForm)}
              style={{
                padding: '8px 16px',
                backgroundColor: showEventSuggestionForm ? colors.textMuted : 'white',
                color: showEventSuggestionForm ? 'white' : colors.primary,
                border: `1px solid ${showEventSuggestionForm ? colors.textMuted : colors.primary}`,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                whiteSpace: 'nowrap' as const
              }}
            >
              {showEventSuggestionForm ? 'Cancel' : 'Suggest an Event'}
            </button>
          </div>

          {/* Event Suggestion Form */}
          {showEventSuggestionForm && (
            <div style={{
              backgroundColor: statusColors.infoLight,
              border: `1px solid ${statusColors.infoBorder}`,
              borderRadius: 8,
              padding: 20,
              marginBottom: 16
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600,margin: '0 0 12px' }}>Suggest an Event</h3>
              <p style={{ fontSize: 13,color: colors.textMuted, marginBottom: 16 }}>
                Know about an upcoming event? Submit it for admin approval. Include the event name, location, dates, and schedule.
              </p>
              <form onSubmit={async (e) => {
                e.preventDefault()
                setSubmittingSuggestion(true)
                setError(null)
                const form = e.target as HTMLFormElement
                const formEl = new FormData(form)
                const name = formEl.get('event_name') as string
                const address = formEl.get('event_address') as string
                const city = formEl.get('event_city') as string
                const state = formEl.get('event_state') as string
                const zip = formEl.get('event_zip') as string
                const event_start_date = formEl.get('event_start_date') as string
                const event_end_date = formEl.get('event_end_date') as string
                const event_url = formEl.get('event_url') as string
                const description = formEl.get('event_description') as string
                const scheduleDay = formEl.get('event_schedule_day') as string
                const scheduleStart = formEl.get('event_schedule_start') as string
                const scheduleEnd = formEl.get('event_schedule_end') as string

                if (!name || !address || !city || !state || !zip || !event_start_date || !event_end_date || !scheduleDay) {
                  setError({ error: 'Please fill in all required fields' })
                  setSubmittingSuggestion(false)
                  return
                }

                try {
                  const res = await fetch('/api/vendor/markets/suggest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      vertical,
                      market_type: 'event',
                      name,
                      address,
                      city,
                      state,
                      zip,
                      description: description || undefined,
                      event_start_date,
                      event_end_date,
                      event_url: event_url || undefined,
                      schedules: [{ day_of_week: parseInt(scheduleDay), start_time: scheduleStart || '10:00', end_time: scheduleEnd || '22:00' }],
                      vendor_sells_at_market: true
                    })
                  })
                  const data = await res.json()
                  if (res.ok) {
                    setShowEventSuggestionForm(false)
                    form.reset()
                    fetchMarkets()
                  } else {
                    setError({ error: data.error || 'Failed to submit event suggestion' })
                  }
                } catch {
                  setError({ error: 'Failed to submit event suggestion' })
                } finally {
                  setSubmittingSuggestion(false)
                }
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 13,fontWeight: 600 }}>Event Name *</label>
                    <input name="event_name" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13,fontWeight: 600 }}>Event URL</label>
                    <input name="event_url" type="url" placeholder="https://..." style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 13,fontWeight: 600 }}>Start Date *</label>
                    <input name="event_start_date" type="date" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13,fontWeight: 600 }}>End Date *</label>
                    <input name="event_end_date" type="date" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 13,fontWeight: 600 }}>Address *</label>
                  <input name="event_address" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 13,fontWeight: 600 }}>City *</label>
                    <input name="event_city" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13,fontWeight: 600 }}>State *</label>
                    <input name="event_state" required maxLength={2} style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13,fontWeight: 600 }}>ZIP *</label>
                    <input name="event_zip" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 13,fontWeight: 600 }}>Primary Day *</label>
                    <select name="event_schedule_day" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }}>
                      <option value="">Select...</option>
                      {DAYS.map((day, i) => <option key={i} value={i}>{day}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 13,fontWeight: 600 }}>Start Time</label>
                    <input name="event_schedule_start" type="time" defaultValue="10:00" style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13,fontWeight: 600 }}>End Time</label>
                    <input name="event_schedule_end" type="time" defaultValue="22:00" style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13,fontWeight: 600 }}>Description</label>
                  <textarea name="event_description" rows={2} style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4, resize: 'vertical' }} />
                </div>
                <button
                  type="submit"
                  disabled={submittingSuggestion}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: colors.primary,
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: submittingSuggestion ? 'not-allowed' : 'pointer',
                    opacity: submittingSuggestion ? 0.6 : 1,
                    fontWeight: 600
                  }}
                >
                  {submittingSuggestion ? 'Submitting...' : 'Submit Event Suggestion'}
                </button>
              </form>
            </div>
          )}

          {/* Event Markets List */}
          {eventMarkets.length === 0 && !showEventSuggestionForm ? (
            <p style={{ fontSize: 14,color: colors.textMuted, textAlign: 'center', padding: '20px 0' }}>
              No upcoming events. Suggest an event to get started!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {eventMarkets.map(market => (
                <div key={market.id} style={{
                  border: `1px solid ${statusColors.neutral200}`,
                  borderRadius: 8,
                  padding: 16
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 600,margin: 0 }}>
                        🎪 {market.name}
                      </h3>
                      <p style={{ fontSize: 13,color: colors.textMuted, margin: '4px 0' }}>
                        {market.address}, {market.city}, {market.state}
                      </p>
                      {market.event_start_date && (
                        <p style={{ fontSize: 13,color: colors.primary, fontWeight: 600, margin: '4px 0' }}>
                          {new Date(market.event_start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {market.event_end_date !== market.event_start_date && (
                            <> – {new Date(market.event_end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                          )}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{
                        padding: '4px 10px',
                        backgroundColor: market.hasAttendance ? statusColors.successLight : statusColors.warningLight,
                        color: market.hasAttendance ? statusColors.success : statusColors.warning,
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {market.hasAttendance ? 'Attending' : 'Not Attending'}
                      </span>
                    </div>
                  </div>
                  {!market.hasAttendance && (
                    <button
                      onClick={() => setSelectedMarketForSchedule(market)}
                      style={{
                        marginTop: 8,
                        padding: '6px 14px',
                        backgroundColor: 'white',
                        color: colors.primary,
                        border: `1px solid ${colors.primary}`,
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 500
                      }}
                    >
                      Set Schedule
                    </button>
                  )}
                  {market.hasAttendance && (
                    <button
                      onClick={() => setSelectedMarketForSchedule(market)}
                      style={{
                        marginTop: 8,
                        padding: '6px 14px',
                        backgroundColor: 'transparent',
                        color: colors.textMuted,
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13
                      }}
                    >
                      Manage Schedule
                    </button>
                  )}

                  {/* Schedule Selector - shown inline when this event is selected */}
                  {selectedMarketForSchedule?.id === market.id && (
                    <div style={{ marginTop: 16 }}>
                      <MarketScheduleSelector
                        marketId={market.id}
                        marketName={market.name}
                        vertical={vertical}
                        onClose={() => setSelectedMarketForSchedule(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Private Pickup Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: `1px solid ${statusColors.neutral200}`,
          padding: 24
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 600 }}>
                {term(vertical, 'private_pickups')}
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: statusColors.neutral500 }}>
                {isFoodTruck
                  ? 'Your own service locations with flexible scheduling.'
                  : 'Your own pickup locations with flexible scheduling.'}
                {limits && ` (${limits.currentPrivatePickupCount} of ${limits.privatePickupLocations} used)`}
                {limits && !limits.canAddPrivatePickup && (
                  <span style={{ color: statusColors.danger, marginLeft: 8 }}>
                    Limit reached. <a href={`/${vertical}/settings`} style={{ color: statusColors.info }}>Upgrade</a> for more locations.
                  </span>
                )}
              </p>
            </div>
            {!showForm && limits?.canAddPrivatePickup && (
              <button
                onClick={() => setShowForm(true)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: colors.primary,
                  border: `2px solid ${colors.primary}`,
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Add {term(vertical, 'private_pickup')}
              </button>
            )}
            {!showForm && limits && !limits.canAddPrivatePickup && (
              <button
                disabled
                style={{
                  padding: '10px 20px',
                  backgroundColor: statusColors.neutral400,
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'not-allowed'
                }}
                title="Upgrade to add more pickup locations"
              >
                Add {term(vertical, 'private_pickup')} (Limit Reached)
              </button>
            )}
          </div>

          {/* Auto-Cutoff Notice — only show if this vertical has a cutoff */}
          {getDefaultCutoffHours('private_pickup') > 0 && (
            <div style={{
              padding: 16,
              backgroundColor: statusColors.dangerLight,
              border: `1px solid ${statusColors.dangerBorder}`,
              borderRadius: 8,
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600, color: statusColors.dangerDark }}>
                    Notice: Automatic Order Cutoff
                  </h4>
                  <p style={{ margin: 0, fontSize: 13, color: statusColors.dangerDark, lineHeight: 1.5 }}>
                    All pre-order sales automatically close <strong>{getDefaultCutoffHours('private_pickup')} hours before your pickup time</strong>. This gives you time to prepare orders and know exactly what to bring. When you set your pickup day and time below, your cutoff time will be calculated automatically.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          {showForm && (
            <form
              onSubmit={handleSubmit}
              style={{
                padding: 20,
                border: `1px solid ${statusColors.neutral200}`,
                borderRadius: 8,
                backgroundColor: statusColors.neutral50,
                marginBottom: 20
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>
                {editingMarket ? 'Edit Pickup Location' : 'New Pickup Location'}
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Location Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={isFoodTruck ? 'e.g., Downtown Lunch Spot' : 'e.g., My Farm Stand'}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${statusColors.neutral300}`,
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Street address"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${statusColors.neutral300}`,
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      State *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      maxLength={2}
                      placeholder="TX"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      ZIP *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.zip}
                      onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                      maxLength={10}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                {/* Coordinates Info Notice */}
                <div style={{
                  padding: 16,
                  backgroundColor: statusColors.infoLight,
                  border: `1px solid ${statusColors.infoBorder}`,
                  borderRadius: 8,
                  marginTop: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>📍</span>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600, color: statusColors.infoDark }}>
                        Improve Your Visibility with Coordinates
                      </h4>
                      <p style={{ margin: 0, fontSize: 13, color: statusColors.infoDark, lineHeight: 1.5 }}>
                        Adding coordinates helps buyers find your pickup location more accurately. Without coordinates, buyers searching near the edge of the 25-mile radius may not see your products at this location.
                      </p>
                      <p style={{ margin: '8px 0 0 0', fontSize: 12, color: statusColors.infoBorder }}>
                        Get coordinates from <a href="https://www.latlong.net/" target="_blank" rel="noopener noreferrer" style={{ color: statusColors.info, fontWeight: 500 }}>latlong.net</a> - enter your address to find the coordinates.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Latitude/Longitude Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      Latitude <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(recommended)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      placeholder="e.g., 35.1992"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      Longitude <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(recommended)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      placeholder="e.g., -101.8451"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                {/* Season Dates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      Season Start <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={formData.season_start}
                      onChange={(e) => setFormData({ ...formData, season_start: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: statusColors.neutral500 }}>
                      When does this location open for the season?
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      Season End <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={formData.season_end}
                      onChange={(e) => setFormData({ ...formData, season_end: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: statusColors.neutral500 }}>
                      When does this location close for the season?
                    </p>
                  </div>
                </div>
                <p style={{ margin: '4px 0 12px 0', fontSize: 13, color: statusColors.neutral500, fontStyle: 'italic' }}>
                  Leave blank if open year-round.
                </p>

                {/* Expiration Date (for temporary/one-time events) */}
                <div style={{
                  padding: 16,
                  backgroundColor: statusColors.warningLight,
                  border: `1px solid ${statusColors.warningBorder}`,
                  borderRadius: 8,
                  marginTop: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>📅</span>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 4, color: statusColors.warningDark }}>
                        Expiration Date <span style={{ fontWeight: 400, color: statusColors.warningDark }}>(optional)</span>
                      </label>
                      <p style={{ margin: '0 0 8px 0', fontSize: 13, color: statusColors.warningDark }}>
                        For one-time events or temporary locations. After this date, the location will no longer be visible to buyers.
                      </p>
                      <input
                        type="date"
                        value={formData.expires_at}
                        onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                        min={new Date().toISOString().split('T')[0]}
                        style={{
                          width: '100%',
                          maxWidth: 200,
                          padding: '10px 12px',
                          border: `1px solid ${statusColors.warningBorder}`,
                          borderRadius: 6,
                          fontSize: 14,
                          boxSizing: 'border-box',
                          backgroundColor: 'white'
                        }}
                      />
                      <p style={{ margin: '4px 0 0 0', fontSize: 12, color: statusColors.warningDark }}>
                        Leave blank for recurring/permanent locations.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Pickup Windows Section */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 14, fontWeight: 500 }}>
                      Pickup Windows * <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(max {maxPickupWindows} per week)</span>
                    </label>
                    {formData.pickup_windows.length < maxPickupWindows && (
                      <button
                        type="button"
                        onClick={addPickupWindow}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: statusColors.infoLight,
                          color: statusColors.infoDark,
                          border: 'none',
                          borderRadius: 4,
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'pointer'
                        }}
                      >
                        + Add Another Window
                      </button>
                    )}
                  </div>

                  {formData.pickup_windows.map((window, index) => (
                    <div
                      key={index}
                      style={{
                        padding: 12,
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: 6,
                        backgroundColor: 'white',
                        marginBottom: 8
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 120px', minWidth: 120 }}>
                          <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>
                            Day
                          </label>
                          <select
                            value={window.day_of_week}
                            onChange={(e) => updatePickupWindow(index, 'day_of_week', e.target.value)}
                            required
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: `1px solid ${statusColors.neutral300}`,
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: 'border-box'
                            }}
                          >
                            <option value="">Select day...</option>
                            {DAYS.map((day, i) => (
                              <option key={day} value={i}>{day}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: '0 0 100px' }}>
                          <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={window.start_time}
                            onChange={(e) => updatePickupWindow(index, 'start_time', e.target.value)}
                            required
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: `1px solid ${statusColors.neutral300}`,
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        <div style={{ flex: '0 0 100px' }}>
                          <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>
                            End Time
                          </label>
                          <input
                            type="time"
                            value={window.end_time}
                            onChange={(e) => updatePickupWindow(index, 'end_time', e.target.value)}
                            required
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: `1px solid ${statusColors.neutral300}`,
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        {formData.pickup_windows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePickupWindow(index)}
                            style={{
                              padding: '8px',
                              backgroundColor: statusColors.dangerLight,
                              color: statusColors.dangerDark,
                              border: 'none',
                              borderRadius: 4,
                              fontSize: 14,
                              cursor: 'pointer',
                              alignSelf: 'flex-end'
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {/* Show calculated cutoff time (hidden for 0-cutoff verticals like food trucks) */}
                      {window.day_of_week !== '' && window.start_time && (() => {
                        const cutoffHrs = getDefaultCutoffHours('private_pickup')
                        const display = getCutoffDisplay(parseInt(window.day_of_week), window.start_time, cutoffHrs)
                        return display ? (
                          <div style={{
                            marginTop: 8,
                            padding: '6px 10px',
                            backgroundColor: statusColors.warningLight,
                            borderRadius: 4,
                            fontSize: 12,
                            color: statusColors.warningDark
                          }}>
                            <strong>Cutoff:</strong> {display}
                          </div>
                        ) : null
                      })()}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: submitting ? statusColors.neutral400 : colors.primary,
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: submitting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {submitting ? 'Saving...' : (editingMarket ? 'Update' : 'Create')}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: statusColors.neutral200,
                    color: statusColors.neutral700,
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Private Pickup Markets List */}
          {privatePickupMarkets.length === 0 ? (
            <p style={{ color: statusColors.neutral400, fontStyle: 'italic', margin: 0 }}>
              No pickup locations yet. Create one above!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {privatePickupMarkets.map(market => (
                <div
                  key={market.id}
                  style={{
                    padding: 16,
                    border: `1px solid ${statusColors.neutral200}`,
                    borderRadius: 8
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 12
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                          {market.name}
                        </h3>
                        {market.expires_at && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            backgroundColor: new Date(market.expires_at) < new Date() ? statusColors.dangerLight : statusColors.warningLight,
                            color: new Date(market.expires_at) < new Date() ? statusColors.dangerDark : statusColors.warningDark,
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 500
                          }}>
                            {new Date(market.expires_at) < new Date() ? '⚠️ Expired' : `📅 Expires ${new Date(market.expires_at).toLocaleDateString()}`}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: '0 0 8px 0', fontSize: 14, color: statusColors.neutral500 }}>
                        {market.address}, {market.city}, {market.state} {market.zip}
                      </p>

                      {/* Schedule Display */}
                      {market.schedules && market.schedules.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          {market.schedules.map((schedule, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                                padding: '8px 12px',
                                backgroundColor: statusColors.neutral100,
                                borderRadius: 6,
                                marginBottom: 6,
                                fontSize: 13
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <strong>{DAYS[schedule.day_of_week]}</strong>{' '}
                                {formatTime12h(schedule.start_time)} - {formatTime12h(schedule.end_time)}
                              </div>
                              {(() => {
                                const cutoffHrs = market.cutoff_hours ?? getDefaultCutoffHours('private_pickup')
                                const display = getCutoffDisplay(schedule.day_of_week, schedule.start_time, cutoffHrs)
                                return display ? (
                                  <div style={{
                                    padding: '4px 8px',
                                    backgroundColor: statusColors.warningLight,
                                    borderRadius: 4,
                                    fontSize: 12,
                                    color: statusColors.warningDark
                                  }}>
                                    Cutoff: {display}
                                  </div>
                                ) : null
                              })()}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Warning if no schedules */}
                      {(!market.schedules || market.schedules.length === 0) && (
                        <div style={{
                          marginTop: 8,
                          padding: '8px 12px',
                          backgroundColor: statusColors.dangerLight,
                          border: `1px solid ${statusColors.dangerBorder}`,
                          borderRadius: 6,
                          fontSize: 13,
                          color: statusColors.dangerDark
                        }}>
                          ⚠️ No pickup schedule set. Edit to add pickup times.
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => handleEdit(market)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: statusColors.info,
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(market.id)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: statusColors.danger,
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/${vertical}/vendor/listings?market=${market.id}`)}
                    style={{
                      marginTop: 12,
                      padding: '8px 16px',
                      backgroundColor: statusColors.info,
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Manage Listings at This Location
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
