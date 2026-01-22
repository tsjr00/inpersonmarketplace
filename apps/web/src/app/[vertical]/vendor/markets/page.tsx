'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

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
  day_of_week?: number
  start_time?: string
  end_time?: string
  season_start?: string
  season_end?: string
  isHomeMarket?: boolean
  canUse?: boolean
  homeMarketRestricted?: boolean
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
  const [privatePickupMarkets, setPrivatePickupMarkets] = useState<Market[]>([])
  const [marketSuggestions, setMarketSuggestions] = useState<MarketSuggestion[]>([])
  const [limits, setLimits] = useState<MarketLimits | null>(null)
  const [homeMarketId, setHomeMarketId] = useState<string | null>(null)
  const [vendorTier, setVendorTier] = useState<string>('standard')
  const [isPremium, setIsPremium] = useState(false)
  const [changingHomeMarket, setChangingHomeMarket] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showSuggestionForm, setShowSuggestionForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    season_start: '',
    season_end: '',
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMarkets()
  }, [vertical])

  const fetchMarkets = async () => {
    try {
      const res = await fetch(`/api/vendor/markets?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        setFixedMarkets(data.fixedMarkets || [])
        setPrivatePickupMarkets(data.privatePickupMarkets || [])
        setMarketSuggestions(data.marketSuggestions || [])
        setLimits(data.limits)
        setHomeMarketId(data.homeMarketId || null)
        setVendorTier(data.vendorTier || 'standard')
        setIsPremium(data.isPremium || false)
      } else if (res.status === 404) {
        // Vendor profile not found - redirect to signup
        router.push(`/${vertical}/vendor-signup`)
      }
    } catch (err) {
      console.error('Error fetching markets:', err)
      setError('Failed to load markets')
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
        setError(data.error || 'Failed to change home market')
        return
      }

      // Refresh markets to update UI
      await fetchMarkets()
    } catch (err) {
      console.error('Error changing home market:', err)
      setError('Failed to change home market')
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
      setError('At least one pickup window is required')
      setSubmitting(false)
      return
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
            season_start: formData.season_start || null,
            season_end: formData.season_end || null,
            pickup_windows: validWindows
          })
        })

        if (res.ok) {
          await fetchMarkets()
          resetForm()
        } else {
          const errData = await res.json()
          setError(errData.error || 'Failed to update market')
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
            season_start: formData.season_start || null,
            season_end: formData.season_end || null,
            pickup_windows: validWindows
          })
        })

        if (res.ok) {
          await fetchMarkets()
          resetForm()
        } else {
          const errData = await res.json()
          setError(errData.error || 'Failed to create market')
        }
      }
    } catch (err) {
      console.error('Error saving market:', err)
      setError('Failed to save market')
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
      season_start: market.season_start || '',
      season_end: market.season_end || '',
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
        setError(errData.error || 'Failed to delete market')
      }
    } catch (err) {
      console.error('Error deleting market:', err)
      setError('Failed to delete market')
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
      season_start: '',
      season_end: '',
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
      setError('At least one market day/time is required')
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
        setError(errData.error || 'Failed to submit market suggestion')
      }
    } catch (err) {
      console.error('Error submitting market suggestion:', err)
      setError('Failed to submit market suggestion')
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

  // Helper to calculate cutoff time for traditional markets (18 hours before)
  const getTraditionalCutoffTime = (dayOfWeek: number, startTime: string): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const [hours, minutes] = startTime.split(':').map(Number)

    // Calculate cutoff: 18 hours before market
    let cutoffHours = hours - 18
    let cutoffDay = dayOfWeek

    if (cutoffHours < 0) {
      cutoffHours += 24
      cutoffDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    }

    const cutoffDayName = days[cutoffDay]
    const cutoffTime = `${cutoffHours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${cutoffHours >= 12 ? 'PM' : 'AM'}`
    return `${cutoffDayName} at ${cutoffTime}`
  }

  // Helper to calculate cutoff time from a pickup window
  // Private pickup has 10-hour cutoff before pickup start time
  const getCutoffTime = (dayOfWeek: number, startTime: string): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const [hours, minutes] = startTime.split(':').map(Number)

    // Calculate cutoff: 10 hours before pickup
    let cutoffHours = hours - 10
    let cutoffDay = dayOfWeek

    if (cutoffHours < 0) {
      cutoffHours += 24
      cutoffDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    }

    const cutoffDayName = days[cutoffDay]
    const cutoffTime = `${cutoffHours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${cutoffHours >= 12 ? 'PM' : 'AM'}`
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
        backgroundColor: '#f8f9fa'
      }}>
        <p>Loading markets...</p>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
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
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 'bold' }}>My Markets</h1>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
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
          <div style={{
            padding: 16,
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: 8,
            color: '#721c24',
            marginBottom: 20
          }}>
            {error}
          </div>
        )}

        {/* Traditional Markets Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          padding: 24,
          marginBottom: 24
        }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 600 }}>
              Traditional Markets
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
              Traditional schedule farmers markets.
              {limits && ` You can join ${limits.traditionalMarkets} market${limits.traditionalMarkets > 1 ? 's' : ''} (${limits.currentFixedMarketCount} of ${limits.traditionalMarkets} used).`}
              {limits && !limits.canAddFixed && (
                <span style={{ color: '#dc2626', marginLeft: 8 }}>
                  Limit reached. <a href={`/${vertical}/settings`} style={{ color: '#2563eb' }}>Upgrade</a> for more markets.
                </span>
              )}
            </p>
          </div>

          {fixedMarkets.length === 0 ? (
            <p style={{ color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>
              No traditional markets available yet. Check back soon!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {fixedMarkets.map(market => (
                <div
                  key={market.id}
                  style={{
                    padding: 16,
                    border: market.isHomeMarket ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    borderRadius: 8,
                    backgroundColor: market.isHomeMarket ? '#eff6ff' : 'white'
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
                            backgroundColor: '#2563eb',
                            color: 'white',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600
                          }}>
                            🏠 Home Market
                          </span>
                        )}
                      </div>
                      <p style={{ margin: '0 0 4px 0', fontSize: 14, color: '#6b7280' }}>
                        {market.address}, {market.city}, {market.state} {market.zip}
                      </p>
                      {market.day_of_week !== null && market.day_of_week !== undefined && (
                        <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#6b7280' }}>
                          {DAYS[market.day_of_week]} {market.start_time} - {market.end_time}
                        </p>
                      )}
                      {/* Cutoff time for traditional markets (18 hours before) */}
                      {market.day_of_week !== null && market.day_of_week !== undefined && market.start_time && (
                        <div style={{
                          padding: '6px 10px',
                          backgroundColor: '#fef3c7',
                          borderRadius: 4,
                          fontSize: 12,
                          color: '#92400e',
                          marginBottom: 12,
                          display: 'inline-block'
                        }}>
                          <strong>Order cutoff:</strong> {getTraditionalCutoffTime(market.day_of_week, market.start_time)}
                        </div>
                      )}
                    </div>
                    {/* Set as Home Market button - only for standard vendors, not on current home market */}
                    {!isPremium && !market.isHomeMarket && (
                      <button
                        onClick={() => handleSetHomeMarket(market.id)}
                        disabled={changingHomeMarket}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: changingHomeMarket ? '#9ca3af' : '#f3f4f6',
                          color: '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: changingHomeMarket ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {changingHomeMarket ? 'Changing...' : 'Set as Home Market'}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => router.push(`/${vertical}/vendor/listings?market=${market.id}`)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Manage Listings at This Market
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Suggest a Farmers Market Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
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
                Suggest a Farmers Market
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
                Know of a farmers market that isn&apos;t listed? Submit it for review and help grow our community.
              </p>
            </div>
            {!showSuggestionForm && (
              <button
                onClick={() => setShowSuggestionForm(true)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Suggest a Market
              </button>
            )}
          </div>

          {/* Info Notice */}
          <div style={{
            padding: 16,
            backgroundColor: '#f5f3ff',
            border: '1px solid #ddd6fe',
            borderRadius: 8,
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 20 }}>ℹ️</span>
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600, color: '#5b21b6' }}>
                  How Market Suggestions Work
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: '#6b21a8', lineHeight: 1.5 }}>
                  When you suggest a farmers market, our team will review it to verify the information.
                  Once approved, the market will appear in the public markets list and all vendors can join it.
                  This helps ensure we only list real, verified markets.
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
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                backgroundColor: '#f9fafb',
                marginBottom: 20
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>
                New Market Suggestion
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Market Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={suggestionFormData.name}
                    onChange={(e) => setSuggestionFormData({ ...suggestionFormData, name: e.target.value })}
                    placeholder="e.g., Downtown Saturday Market"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Do you sell at this market? */}
                <div style={{
                  padding: 16,
                  backgroundColor: suggestionFormData.vendor_sells_at_market ? '#f0fdf4' : '#fef3c7',
                  border: `1px solid ${suggestionFormData.vendor_sells_at_market ? '#86efac' : '#fcd34d'}`,
                  borderRadius: 8
                }}>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#374151' }}>
                    Do you sell at this market? *
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      backgroundColor: suggestionFormData.vendor_sells_at_market ? '#dcfce7' : 'white',
                      border: `2px solid ${suggestionFormData.vendor_sells_at_market ? '#16a34a' : '#e5e7eb'}`,
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
                        <div style={{ fontWeight: 500, color: '#166534' }}>Yes, I sell at this market</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>I&apos;ll be associated with this market when approved</div>
                      </div>
                    </label>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      backgroundColor: !suggestionFormData.vendor_sells_at_market ? '#fef9c3' : 'white',
                      border: `2px solid ${!suggestionFormData.vendor_sells_at_market ? '#ca8a04' : '#e5e7eb'}`,
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
                        <div style={{ fontWeight: 500, color: '#854d0e' }}>No, but I think it should be on the platform</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>This is a lead/referral for the platform to pursue</div>
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
                      border: '1px solid #d1d5db',
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
                        border: '1px solid #d1d5db',
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
                        border: '1px solid #d1d5db',
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
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Description <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span>
                  </label>
                  <textarea
                    value={suggestionFormData.description}
                    onChange={(e) => setSuggestionFormData({ ...suggestionFormData, description: e.target.value })}
                    placeholder="Any additional details about this market..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: 'border-box',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Website <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={suggestionFormData.website}
                    onChange={(e) => setSuggestionFormData({ ...suggestionFormData, website: e.target.value })}
                    placeholder="https://..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
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
                      Season Start <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={suggestionFormData.season_start}
                      onChange={(e) => setSuggestionFormData({ ...suggestionFormData, season_start: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                      When does this market&apos;s season begin?
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      Season End <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={suggestionFormData.season_end}
                      onChange={(e) => setSuggestionFormData({ ...suggestionFormData, season_end: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                      When does this market&apos;s season end?
                    </p>
                  </div>
                </div>
                <p style={{ margin: '4px 0 12px 0', fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>
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
                          backgroundColor: '#e0f2fe',
                          color: '#0369a1',
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
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        backgroundColor: 'white',
                        marginBottom: 8
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 120px', minWidth: 120 }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                            Day
                          </label>
                          <select
                            value={schedule.day_of_week}
                            onChange={(e) => updateSuggestionSchedule(index, 'day_of_week', e.target.value)}
                            required
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: '1px solid #d1d5db',
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
                          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
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
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        <div style={{ flex: '0 0 100px' }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
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
                              border: '1px solid #d1d5db',
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
                              backgroundColor: '#fee2e2',
                              color: '#991b1b',
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
                    backgroundColor: submittingSuggestion ? '#9ca3af' : '#7c3aed',
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
                    backgroundColor: '#e5e7eb',
                    color: '#374151',
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
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      backgroundColor: suggestion.approval_status === 'rejected' ? '#fef2f2' :
                                       suggestion.approval_status === 'approved' ? '#f0fdf4' : '#fffbeb'
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
                            backgroundColor: suggestion.approval_status === 'rejected' ? '#dc2626' :
                                           suggestion.approval_status === 'approved' ? '#16a34a' : '#d97706',
                            color: 'white',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            textTransform: 'capitalize'
                          }}>
                            {suggestion.approval_status === 'pending' ? 'Pending Review' : suggestion.approval_status}
                          </span>
                        </div>
                        <p style={{ margin: '0 0 4px 0', fontSize: 14, color: '#6b7280' }}>
                          {suggestion.address}, {suggestion.city}, {suggestion.state} {suggestion.zip}
                        </p>
                        {suggestion.schedules && suggestion.schedules.length > 0 && (
                          <p style={{ margin: '0 0 4px 0', fontSize: 14, color: '#6b7280' }}>
                            {suggestion.schedules.map((s, i) => (
                              <span key={i}>
                                {i > 0 && ', '}
                                {DAYS[s.day_of_week]} {formatTime12h(s.start_time)} - {formatTime12h(s.end_time)}
                              </span>
                            ))}
                          </p>
                        )}
                        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
                          Submitted {new Date(suggestion.submitted_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {suggestion.approval_status === 'rejected' && suggestion.rejection_reason && (
                      <div style={{
                        marginTop: 12,
                        padding: '10px 12px',
                        backgroundColor: '#fee2e2',
                        borderRadius: 6,
                        fontSize: 13,
                        color: '#991b1b'
                      }}>
                        <strong>Reason:</strong> {suggestion.rejection_reason}
                      </div>
                    )}
                    {suggestion.approval_status === 'approved' && (
                      <div style={{
                        marginTop: 12,
                        padding: '10px 12px',
                        backgroundColor: '#dcfce7',
                        borderRadius: 6,
                        fontSize: 13,
                        color: '#166534'
                      }}>
                        This market has been approved and is now available in the Traditional Markets list above.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Private Pickup Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
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
                Private Pickup Locations
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
                Your own pickup locations with flexible scheduling.
                {limits && ` (${limits.currentPrivatePickupCount} of ${limits.privatePickupLocations} used)`}
                {limits && !limits.canAddPrivatePickup && (
                  <span style={{ color: '#dc2626', marginLeft: 8 }}>
                    Limit reached. <a href={`/${vertical}/settings`} style={{ color: '#2563eb' }}>Upgrade</a> for more locations.
                  </span>
                )}
              </p>
            </div>
            {!showForm && limits?.canAddPrivatePickup && (
              <button
                onClick={() => setShowForm(true)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Add Pickup Location
              </button>
            )}
            {!showForm && limits && !limits.canAddPrivatePickup && (
              <button
                disabled
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'not-allowed'
                }}
                title="Upgrade to add more pickup locations"
              >
                Add Pickup Location (Limit Reached)
              </button>
            )}
          </div>

          {/* Auto-Cutoff Notice */}
          <div style={{
            padding: 16,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600, color: '#991b1b' }}>
                  Notice: Automatic Order Cutoff
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: '#7f1d1d', lineHeight: 1.5 }}>
                  All pre-order sales automatically close <strong>10 hours before your pickup time</strong>. This gives you time to prepare orders and know exactly what to bring. When you set your pickup day and time below, your cutoff time will be calculated automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          {showForm && (
            <form
              onSubmit={handleSubmit}
              style={{
                padding: 20,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                backgroundColor: '#f9fafb',
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
                    placeholder="e.g., My Farm Stand"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
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
                      border: '1px solid #d1d5db',
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
                        border: '1px solid #d1d5db',
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
                        border: '1px solid #d1d5db',
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
                        border: '1px solid #d1d5db',
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
                      Season Start <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={formData.season_start}
                      onChange={(e) => setFormData({ ...formData, season_start: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                      When does this location open for the season?
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                      Season End <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span>
                    </label>
                    <input
                      type="date"
                      value={formData.season_end}
                      onChange={(e) => setFormData({ ...formData, season_end: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                      When does this location close for the season?
                    </p>
                  </div>
                </div>
                <p style={{ margin: '4px 0 12px 0', fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>
                  Leave blank if open year-round.
                </p>

                {/* Pickup Windows Section */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 14, fontWeight: 500 }}>
                      Pickup Windows * <span style={{ fontWeight: 400, color: '#6b7280' }}>(max {maxPickupWindows} per week)</span>
                    </label>
                    {formData.pickup_windows.length < maxPickupWindows && (
                      <button
                        type="button"
                        onClick={addPickupWindow}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: '#e0f2fe',
                          color: '#0369a1',
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
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        backgroundColor: 'white',
                        marginBottom: 8
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 120px', minWidth: 120 }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                            Day
                          </label>
                          <select
                            value={window.day_of_week}
                            onChange={(e) => updatePickupWindow(index, 'day_of_week', e.target.value)}
                            required
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: '1px solid #d1d5db',
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
                          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
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
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              fontSize: 14,
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                        <div style={{ flex: '0 0 100px' }}>
                          <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
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
                              border: '1px solid #d1d5db',
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
                              backgroundColor: '#fee2e2',
                              color: '#991b1b',
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
                      {/* Show calculated cutoff time */}
                      {window.day_of_week !== '' && window.start_time && (
                        <div style={{
                          marginTop: 8,
                          padding: '6px 10px',
                          backgroundColor: '#fef3c7',
                          borderRadius: 4,
                          fontSize: 12,
                          color: '#92400e'
                        }}>
                          <strong>Cutoff:</strong> {getCutoffTime(parseInt(window.day_of_week), window.start_time)}
                        </div>
                      )}
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
                    backgroundColor: submitting ? '#9ca3af' : '#059669',
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
                    backgroundColor: '#e5e7eb',
                    color: '#374151',
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
            <p style={{ color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>
              No pickup locations yet. Create one above!
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {privatePickupMarkets.map(market => (
                <div
                  key={market.id}
                  style={{
                    padding: 16,
                    border: '1px solid #e5e7eb',
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
                      <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 600 }}>
                        {market.name}
                      </h3>
                      <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#6b7280' }}>
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
                                backgroundColor: '#f3f4f6',
                                borderRadius: 6,
                                marginBottom: 6,
                                fontSize: 13
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <strong>{DAYS[schedule.day_of_week]}</strong>{' '}
                                {formatTime12h(schedule.start_time)} - {formatTime12h(schedule.end_time)}
                              </div>
                              <div style={{
                                padding: '4px 8px',
                                backgroundColor: '#fef3c7',
                                borderRadius: 4,
                                fontSize: 12,
                                color: '#92400e'
                              }}>
                                Cutoff: {getCutoffTime(schedule.day_of_week, schedule.start_time)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Warning if no schedules */}
                      {(!market.schedules || market.schedules.length === 0) && (
                        <div style={{
                          marginTop: 8,
                          padding: '8px 12px',
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: 6,
                          fontSize: 13,
                          color: '#991b1b'
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
                          backgroundColor: '#2563eb',
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
                          backgroundColor: '#dc2626',
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
                      backgroundColor: '#2563eb',
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
