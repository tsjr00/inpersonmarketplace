'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { MarketBoxImageUpload } from '@/components/vendor/MarketBoxImageUpload'

interface MarketSchedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

interface Market {
  id: string
  name: string
  market_type: string
  address: string
  city: string
  state: string
  isHomeMarket?: boolean
  canUse?: boolean
  homeMarketRestricted?: boolean
  market_schedules?: MarketSchedule[]
}

interface MarketBoxOffering {
  id: string
  name: string
  description: string | null
  price_cents: number
  price_4week_cents: number
  price_8week_cents: number | null
  pickup_market_id: string
  pickup_day_of_week: number
  pickup_start_time: string
  pickup_end_time: string
  active: boolean
  active_subscribers: number
  image_urls: string[] | null
  quantity_amount: number | null
  quantity_unit: string | null
}

const QUANTITY_UNITS: { value: string; label: string; verticals: string[] }[] = [
  { value: 'lb', label: 'lb', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'oz', label: 'oz', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'count', label: 'count', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'dozen', label: 'dozen', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'pack', label: 'pack', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'pint', label: 'pint', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'quart', label: 'quart', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'bag', label: 'bag', verticals: ['farmers_market'] },
  { value: 'bunch', label: 'bunch', verticals: ['farmers_market'] },
  { value: 'bouquet', label: 'bouquet', verticals: ['farmers_market'] },
  { value: 'box', label: 'box', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'serving', label: 'serving', verticals: ['food_trucks'] },
  { value: 'feeds', label: 'feeds', verticals: ['food_trucks'] },
  { value: 'other', label: 'other', verticals: ['farmers_market', 'food_trucks'] },
]

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

export default function EditMarketBoxPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const offeringId = params.id as string
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  const [markets, setMarkets] = useState<Market[]>([])
  const [offering, setOffering] = useState<MarketBoxOffering | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price_4week_dollars: '',
    offer_8week: false,
    price_8week_dollars: '',
    pickup_market_id: '',
    pickup_day_of_week: '',
    pickup_start_time: '08:00',
    pickup_end_time: '12:00',
    quantity_amount: '',
    quantity_unit: '',
  })

  // Get selected market and determine if it's traditional
  const selectedMarket = markets.find(m => m.id === formData.pickup_market_id)
  const isTraditionalMarket = selectedMarket?.market_type === 'traditional'
  const marketSchedules = selectedMarket?.market_schedules?.filter(s => s.active) || []

  // Handle market selection change
  const handleMarketChange = (marketId: string) => {
    const market = markets.find(m => m.id === marketId)
    if (market?.market_type === 'traditional' && market.market_schedules?.length) {
      // For traditional markets, auto-select first schedule
      const firstSchedule = market.market_schedules.find(s => s.active)
      if (firstSchedule) {
        setFormData({
          ...formData,
          pickup_market_id: marketId,
          pickup_day_of_week: String(firstSchedule.day_of_week),
          pickup_start_time: firstSchedule.start_time.slice(0, 5),
          pickup_end_time: firstSchedule.end_time.slice(0, 5),
        })
        return
      }
    }
    // For private pickup or no schedules, just set the market and clear day/time
    setFormData({
      ...formData,
      pickup_market_id: marketId,
      pickup_day_of_week: '',
      pickup_start_time: '08:00',
      pickup_end_time: '12:00',
    })
  }

  // Handle schedule selection for traditional markets
  const handleScheduleChange = (scheduleId: string) => {
    const schedule = marketSchedules.find(s => s.id === scheduleId)
    if (schedule) {
      setFormData({
        ...formData,
        pickup_day_of_week: String(schedule.day_of_week),
        pickup_start_time: schedule.start_time.slice(0, 5),
        pickup_end_time: schedule.end_time.slice(0, 5),
      })
    }
  }

  const fetchMarkets = useCallback(async () => {
    const res = await fetch(`/api/vendor/markets?vertical=${vertical}`)
    const data = await res.json()
    if (res.ok) {
      const allMarkets = [
        ...(data.fixedMarkets || []),
        ...(data.privatePickupMarkets || [])
      ]
      setMarkets(allMarkets)
    }
  }, [vertical])

  const fetchOffering = useCallback(async () => {
    const res = await fetch(`/api/vendor/market-boxes/${offeringId}`)
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch offering')
    }

    const o = data.offering
    setOffering(o)
    setImageUrl(o.image_urls?.[0] || null)
    const price4Week = o.price_4week_cents || o.price_cents
    setFormData({
      name: o.name,
      description: o.description || '',
      price_4week_dollars: (price4Week / 100).toFixed(2),
      offer_8week: !!o.price_8week_cents,
      price_8week_dollars: o.price_8week_cents ? (o.price_8week_cents / 100).toFixed(2) : '',
      pickup_market_id: o.pickup_market_id,
      pickup_day_of_week: String(o.pickup_day_of_week),
      pickup_start_time: o.pickup_start_time.slice(0, 5),
      pickup_end_time: o.pickup_end_time.slice(0, 5),
      quantity_amount: o.quantity_amount != null ? String(o.quantity_amount) : '',
      quantity_unit: o.quantity_unit || '',
    })
  }, [offeringId])

  useEffect(() => {
    Promise.all([fetchMarkets(), fetchOffering()])
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [fetchMarkets, fetchOffering])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const price4WeekCents = Math.round(parseFloat(formData.price_4week_dollars) * 100)

      if (isNaN(price4WeekCents) || price4WeekCents <= 0) {
        throw new Error('Please enter a valid 1-month price')
      }

      let price8WeekCents: number | null = null
      if (formData.offer_8week) {
        price8WeekCents = Math.round(parseFloat(formData.price_8week_dollars) * 100)
        if (isNaN(price8WeekCents) || price8WeekCents <= 0) {
          throw new Error('Please enter a valid 2-month price')
        }
      }

      const res = await fetch(`/api/vendor/market-boxes/${offeringId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          price_4week_cents: price4WeekCents,
          price_8week_cents: price8WeekCents,
          pickup_market_id: formData.pickup_market_id,
          pickup_day_of_week: parseInt(formData.pickup_day_of_week),
          pickup_start_time: formData.pickup_start_time,
          pickup_end_time: formData.pickup_end_time,
          image_urls: imageUrl ? [imageUrl] : [],
          quantity_amount: formData.quantity_amount ? parseFloat(formData.quantity_amount) : null,
          quantity_unit: formData.quantity_unit || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update market box')
      }

      router.push(`/${vertical}/vendor/market-boxes/${offeringId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update market box')
    } finally {
      setSubmitting(false)
    }
  }

  const hasActiveSubscribers = !!(offering && offering.active_subscribers > 0)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, padding: 24 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', paddingTop: 100 }}>
          Loading...
        </div>
      </div>
    )
  }

  if (!offering) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, padding: 24 }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{
            padding: 24,
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b',
            textAlign: 'center'
          }}>
            Offering not found
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, color: branding.colors.text }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link
            href={`/${vertical}/vendor/market-boxes/${offeringId}`}
            style={{ color: branding.colors.primary, textDecoration: 'none', fontSize: 14 }}
          >
            ← Back to {offering.name}
          </Link>
          <h1 style={{ color: branding.colors.primary, margin: '16px 0 8px 0', fontSize: 28 }}>
            Edit Market Box
          </h1>
        </div>

        {error && (
          <div style={{
            padding: 16,
            marginBottom: 24,
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b'
          }}>
            {error}
          </div>
        )}

        {hasActiveSubscribers && (
          <div style={{
            padding: 16,
            marginBottom: 24,
            backgroundColor: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: 8,
            color: '#92400e',
            fontSize: 14
          }}>
            <strong>Note:</strong> This offering has {offering.active_subscribers} active subscriber{offering.active_subscribers !== 1 ? 's' : ''}.
            You cannot change the pickup location, day, or time while subscribers are active.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{
            padding: 24,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 8
          }}>
            {/* Name */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                Box Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Weekly Veggie Box, Farm Fresh Bundle"
                required
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

            {/* Description */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what's typically included in each weekly box..."
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

            {/* Image Upload */}
            <MarketBoxImageUpload
              imageUrl={imageUrl}
              onImageChange={setImageUrl}
              disabled={submitting}
            />

            {/* Size / Amount */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                Size / Amount
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={formData.quantity_amount}
                  onChange={(e) => setFormData({ ...formData, quantity_amount: e.target.value })}
                  placeholder="e.g. 1"
                  style={{
                    width: 100,
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
                <select
                  value={formData.quantity_unit}
                  onChange={(e) => setFormData({ ...formData, quantity_unit: e.target.value })}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="">Select unit...</option>
                  {QUANTITY_UNITS
                    .filter(u => u.verticals.includes(vertical))
                    .map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))
                  }
                </select>
              </div>
              {formData.quantity_amount && formData.quantity_unit && (
                <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  Buyers will see: <strong>
                    {formData.quantity_unit === 'feeds'
                      ? `feeds ${formData.quantity_amount}`
                      : `${formData.quantity_amount} ${formData.quantity_unit}`}
                  </strong>
                </p>
              )}
            </div>

            {/* 4-Week Price */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                1-Month Price (4 weeks) *
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#6b7280'
                }}>$</span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={formData.price_4week_dollars}
                  onChange={(e) => setFormData({ ...formData, price_4week_dollars: e.target.value })}
                  placeholder="100.00"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 28px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                Total charged for 4 weekly pickups
              </p>
            </div>

            {/* 8-Week Price Option */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.offer_8week}
                  onChange={(e) => setFormData({ ...formData, offer_8week: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontWeight: 500, color: '#374151' }}>
                  Also offer 2-month (8 week) option
                </span>
              </label>
              {formData.offer_8week && (
                <div style={{ marginTop: 12, paddingLeft: 26 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                    2-Month Price (8 weeks) *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#6b7280'
                    }}>$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={formData.price_8week_dollars}
                      onChange={(e) => setFormData({ ...formData, price_8week_dollars: e.target.value })}
                      placeholder="180.00"
                      required={formData.offer_8week}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 28px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  {formData.price_4week_dollars && (
                    <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      Suggested: ${(parseFloat(formData.price_4week_dollars) * 2 * 0.9).toFixed(2)} (10% discount)
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Pickup Location */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                Pickup Location *
              </label>
              <select
                value={formData.pickup_market_id}
                onChange={(e) => handleMarketChange(e.target.value)}
                required
                disabled={hasActiveSubscribers}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  backgroundColor: hasActiveSubscribers ? '#f3f4f6' : 'white'
                }}
              >
                <option value="">Select a location...</option>
                {markets.map(market => {
                  // Allow current selection even if restricted
                  const isCurrentSelection = market.id === formData.pickup_market_id
                  const isDisabled = market.homeMarketRestricted === true && !isCurrentSelection
                  return (
                    <option
                      key={market.id}
                      value={market.id}
                      disabled={isDisabled}
                      style={{ color: isDisabled ? '#9ca3af' : 'inherit' }}
                    >
                      {market.market_type === 'private_pickup' ? 'Private: ' : 'Market: '}
                      {market.name} - {market.city}, {market.state}
                      {market.isHomeMarket && ' 🏠'}
                      {isDisabled && ' (Upgrade for multiple markets)'}
                    </option>
                  )
                })}
              </select>
            </div>

            {/* Pickup Day & Time - Different UI based on market type */}
            {isTraditionalMarket && marketSchedules.length > 0 ? (
              // Traditional market: Select from market's operating schedule
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                  Market Day & Hours *
                </label>
                <select
                  value={marketSchedules.find(s =>
                    s.day_of_week === parseInt(formData.pickup_day_of_week) &&
                    s.start_time.slice(0, 5) === formData.pickup_start_time
                  )?.id || ''}
                  onChange={(e) => handleScheduleChange(e.target.value)}
                  required
                  disabled={hasActiveSubscribers}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    backgroundColor: hasActiveSubscribers ? '#f3f4f6' : 'white'
                  }}
                >
                  {marketSchedules.length === 1 ? null : <option value="">Select market day...</option>}
                  {marketSchedules.map(schedule => (
                    <option key={schedule.id} value={schedule.id}>
                      {DAYS.find(d => d.value === schedule.day_of_week)?.label} - {formatTime(schedule.start_time)} to {formatTime(schedule.end_time)}
                    </option>
                  ))}
                </select>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                  Pickup times are set by the market&apos;s operating schedule
                </p>
              </div>
            ) : (
              // Private pickup: Vendor chooses day and time
              <>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                    Pickup Day *
                  </label>
                  <select
                    value={formData.pickup_day_of_week}
                    onChange={(e) => setFormData({ ...formData, pickup_day_of_week: e.target.value })}
                    required
                    disabled={hasActiveSubscribers}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: 'border-box',
                      backgroundColor: hasActiveSubscribers ? '#f3f4f6' : 'white'
                    }}
                  >
                    <option value="">Select a day...</option>
                    {DAYS.map(day => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                    Pickup Window *
                  </label>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <input
                      type="time"
                      value={formData.pickup_start_time}
                      onChange={(e) => setFormData({ ...formData, pickup_start_time: e.target.value })}
                      required
                      disabled={hasActiveSubscribers}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        backgroundColor: hasActiveSubscribers ? '#f3f4f6' : 'white'
                      }}
                    />
                    <span style={{ color: '#6b7280' }}>to</span>
                    <input
                      type="time"
                      value={formData.pickup_end_time}
                      onChange={(e) => setFormData({ ...formData, pickup_end_time: e.target.value })}
                      required
                      disabled={hasActiveSubscribers}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        backgroundColor: hasActiveSubscribers ? '#f3f4f6' : 'white'
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '14px 24px',
                backgroundColor: submitting ? '#9ca3af' : branding.colors.primary,
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
