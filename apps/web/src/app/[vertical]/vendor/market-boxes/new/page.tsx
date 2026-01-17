'use client'

import { useState, useEffect } from 'react'
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

export default function NewMarketBoxPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  const [markets, setMarkets] = useState<Market[]>([])
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
      const priceCents = Math.round(parseFloat(formData.price_dollars) * 100)

      if (isNaN(priceCents) || priceCents <= 0) {
        throw new Error('Please enter a valid price')
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
            ← Back to Market Boxes
          </Link>
          <h1 style={{ color: branding.colors.primary, margin: '16px 0 8px 0', fontSize: 28 }}>
            Create Market Box
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Set up a 4-week subscription bundle for premium buyers
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
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                  This is the total amount the buyer pays upfront for 4 weekly pickups
                </p>
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
                  {markets.map(market => (
                    <option key={market.id} value={market.id}>
                      {market.market_type === 'private_pickup' ? 'Private: ' : 'Market: '}
                      {market.name} - {market.city}, {market.state}
                    </option>
                  ))}
                </select>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                  This location will be fixed for all 4 weeks of the subscription
                </p>
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

              {/* Info Box */}
              <div style={{
                padding: 16,
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                marginBottom: 24
              }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#1e40af', fontSize: 14 }}>How Market Boxes Work</h4>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#1e40af', fontSize: 13 }}>
                  <li>Premium buyers pay the full price upfront</li>
                  <li>They pick up one box each week for 4 consecutive weeks</li>
                  <li>Same day, time, and location every week</li>
                  <li>You receive the full payment immediately</li>
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
                {submitting ? 'Creating...' : 'Create Market Box'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
