'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { term, isBuyerPremiumEnabled } from '@/lib/vertical'
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

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const CHEF_BOX_TYPES = [
  { value: 'weekly_dinner', label: 'Weekly Dinner' },
  { value: 'family_kit', label: 'Family Kit' },
  { value: 'mystery_box', label: 'Mystery Box' },
  { value: 'meal_prep', label: 'Meal Prep' },
  { value: 'office_lunch', label: 'Office Lunch' },
]

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

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

export default function NewMarketBoxPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [homeMarketId, setHomeMarketId] = useState<string | null>(null)
  const [isPremium, setIsPremium] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    box_type: '',
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

  const [imageUrl, setImageUrl] = useState<string | null>(null)

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

  useEffect(() => {
    if (vertical) {
      fetchMarkets()
    }
  }, [vertical])

  const fetchMarkets = async () => {
    try {
      const res = await fetch(`/api/vendor/markets?vertical=${vertical}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch markets')
      }

      // Combine fixed markets and private pickup markets
      const allMarkets = [
        ...(data.fixedMarkets || []),
        ...(data.privatePickupMarkets || [])
      ]
      setMarkets(allMarkets)
      setHomeMarketId(data.homeMarketId || null)
      setIsPremium(data.isPremium || false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load markets')
    } finally {
      setLoading(false)
    }
  }

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

      if (vertical === 'food_trucks' && !formData.box_type) {
        throw new Error('Please select a plan type')
      }

      if (!formData.pickup_market_id) {
        throw new Error('Please select a pickup location')
      }

      if (formData.pickup_day_of_week === '') {
        throw new Error('Please select a pickup day')
      }

      const res = await fetch('/api/vendor/market-boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vertical,
          name: formData.name,
          description: formData.description || null,
          box_type: formData.box_type || null,
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
        throw new Error(data.error || 'Failed to create market box')
      }

      router.push(`/${vertical}/vendor/market-boxes`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create market box')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, padding: 24 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', paddingTop: 100 }}>
          Loading...
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
            href={`/${vertical}/vendor/market-boxes`}
            style={{ color: branding.colors.primary, textDecoration: 'none', fontSize: 14 }}
          >
            {`← Back to ${term(vertical, 'market_boxes')}`}
          </Link>
          <h1 style={{ color: branding.colors.primary, margin: '16px 0 8px 0', fontSize: 28 }}>
            {`Create ${term(vertical, 'market_box')}`}
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Set up a weekly subscription bundle for {isBuyerPremiumEnabled(vertical) ? 'premium buyers' : 'your customers'} (1 or 2 month terms)
          </p>
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

        {markets.length === 0 ? (
          <div style={{
            padding: 24,
            backgroundColor: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: 8,
            textAlign: 'center'
          }}>
            <p style={{ margin: '0 0 16px 0', color: '#92400e' }}>
              You need to select at least one pickup location before creating a market box.
            </p>
            <Link
              href={`/${vertical}/vendor/markets`}
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 600
              }}
            >
              Select A Market
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{
              padding: 24,
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 8
            }}>
              {/* Box Type - FT only */}
              {vertical === 'food_trucks' && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                    Plan Type *
                  </label>
                  <select
                    value={formData.box_type}
                    onChange={(e) => setFormData({ ...formData, box_type: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: 'border-box',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="">Select a type...</option>
                    {CHEF_BOX_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Name */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                  {`${term(vertical, 'market_box')} Name *`}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={vertical === 'food_trucks' ? 'e.g., Weekly Dinner Box, Family Meal Kit' : 'e.g., Weekly Veggie Box, Farm Fresh Bundle'}
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

              {/* Box Image */}
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

              {/* 1-Month Price */}
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
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                  Total for 4 weekly pickups ({formData.price_4week_dollars ? `$${(parseFloat(formData.price_4week_dollars) / 4).toFixed(2)}/week` : '$0.00/week'})
                </p>
              </div>

              {/* 2-Month Option */}
              <div style={{ marginBottom: 20 }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  marginBottom: formData.offer_8week ? 12 : 0
                }}>
                  <input
                    type="checkbox"
                    checked={formData.offer_8week}
                    onChange={(e) => setFormData({ ...formData, offer_8week: e.target.checked })}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 500, color: '#374151' }}>
                    Also offer 2-month (8 weeks) option
                  </span>
                </label>

                {formData.offer_8week && (
                  <div style={{ marginLeft: 26 }}>
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
                    <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                      Total for 8 weekly pickups ({formData.price_8week_dollars ? `$${(parseFloat(formData.price_8week_dollars) / 8).toFixed(2)}/week` : '$0.00/week'})
                    </p>
                    {formData.price_4week_dollars && (
                      <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#059669' }}>
                        Suggested: ${(parseFloat(formData.price_4week_dollars) * 1.8).toFixed(2)} (10% discount from 2x 1-month price)
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
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">Select a location...</option>
                  {markets.map(market => {
                    const isDisabled = market.homeMarketRestricted === true
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
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                  This location will be fixed for all weeks of the subscription
                </p>
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
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      fontSize: 14,
                      boxSizing: 'border-box',
                      backgroundColor: 'white'
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
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        fontSize: 14,
                        boxSizing: 'border-box',
                        backgroundColor: 'white'
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
                        style={{
                          padding: '10px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          fontSize: 14
                        }}
                      />
                      <span style={{ color: '#6b7280' }}>to</span>
                      <input
                        type="time"
                        value={formData.pickup_end_time}
                        onChange={(e) => setFormData({ ...formData, pickup_end_time: e.target.value })}
                        required
                        style={{
                          padding: '10px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          fontSize: 14
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Info Box */}
              <div style={{
                padding: 16,
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                marginBottom: 24
              }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#1e40af', fontSize: 14 }}>{`How ${term(vertical, 'market_boxes')} Work`}</h4>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#1e40af', fontSize: 13 }}>
                  <li>Offer 1-month (4 weeks) or 2-month (8 weeks) subscriptions</li>
                  <li>{isBuyerPremiumEnabled(vertical) ? 'Premium buyers pay' : 'Customers pay'} the full price upfront</li>
                  <li>They pick up one box each week</li>
                  <li>Same day, time, and location every week</li>
                  <li>If you need to skip a week (weather, etc.), their subscription extends automatically</li>
                </ul>
              </div>

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
                {submitting ? 'Creating...' : `Create ${term(vertical, 'market_box')}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
