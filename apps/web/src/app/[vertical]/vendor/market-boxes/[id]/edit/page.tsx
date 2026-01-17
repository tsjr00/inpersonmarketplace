'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'

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
}

interface MarketBoxOffering {
  id: string
  name: string
  description: string | null
  price_cents: number
  pickup_market_id: string
  pickup_day_of_week: number
  pickup_start_time: string
  pickup_end_time: string
  active: boolean
  active_subscribers: number
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

export default function EditMarketBoxPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const offeringId = params.id as string
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  const [markets, setMarkets] = useState<Market[]>([])
  const [offering, setOffering] = useState<MarketBoxOffering | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price_dollars: '',
    pickup_market_id: '',
    pickup_day_of_week: '',
    pickup_start_time: '08:00',
    pickup_end_time: '12:00',
  })

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
    setFormData({
      name: o.name,
      description: o.description || '',
      price_dollars: (o.price_cents / 100).toFixed(2),
      pickup_market_id: o.pickup_market_id,
      pickup_day_of_week: String(o.pickup_day_of_week),
      pickup_start_time: o.pickup_start_time.slice(0, 5),
      pickup_end_time: o.pickup_end_time.slice(0, 5),
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
      const priceCents = Math.round(parseFloat(formData.price_dollars) * 100)

      if (isNaN(priceCents) || priceCents <= 0) {
        throw new Error('Please enter a valid price')
      }

      const res = await fetch(`/api/vendor/market-boxes/${offeringId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          price_cents: priceCents,
          pickup_market_id: formData.pickup_market_id,
          pickup_day_of_week: parseInt(formData.pickup_day_of_week),
          pickup_start_time: formData.pickup_start_time,
          pickup_end_time: formData.pickup_end_time,
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

            {/* Price */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                Total Price (for all 4 weeks) *
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
                  value={formData.price_dollars}
                  onChange={(e) => setFormData({ ...formData, price_dollars: e.target.value })}
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
            </div>

            {/* Pickup Location */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
                Pickup Location *
              </label>
              <select
                value={formData.pickup_market_id}
                onChange={(e) => setFormData({ ...formData, pickup_market_id: e.target.value })}
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

            {/* Pickup Day */}
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

            {/* Pickup Time */}
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
