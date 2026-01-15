'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

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
}

type MarketLimits = {
  fixedMarketLimit: number
  currentFixedMarketCount: number
  canAddFixed: boolean
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function VendorMarketsPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string

  const [fixedMarkets, setFixedMarkets] = useState<Market[]>([])
  const [privatePickupMarkets, setPrivatePickupMarkets] = useState<Market[]>([])
  const [limits, setLimits] = useState<MarketLimits | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: ''
  })
  const [editingMarket, setEditingMarket] = useState<Market | null>(null)
  const [submitting, setSubmitting] = useState(false)
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
        setLimits(data.limits)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      if (editingMarket) {
        // Update
        const res = await fetch(`/api/vendor/markets/${editingMarket.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData })
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
          body: JSON.stringify({ vertical, ...formData })
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
    setFormData({
      name: market.name,
      address: market.address,
      city: market.city,
      state: market.state,
      zip: market.zip
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
      zip: ''
    })
    setError(null)
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
              {limits && ` You can join ${limits.fixedMarketLimit} market${limits.fixedMarketLimit > 1 ? 's' : ''} (${limits.currentFixedMarketCount} of ${limits.fixedMarketLimit} used).`}
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
                    border: '1px solid #e5e7eb',
                    borderRadius: 8
                  }}
                >
                  <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 600 }}>
                    {market.name}
                  </h3>
                  <p style={{ margin: '0 0 4px 0', fontSize: 14, color: '#6b7280' }}>
                    {market.address}, {market.city}, {market.state} {market.zip}
                  </p>
                  {market.day_of_week !== null && market.day_of_week !== undefined && (
                    <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#6b7280' }}>
                      {DAYS[market.day_of_week]} {market.start_time} - {market.end_time}
                    </p>
                  )}
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
                Your own pickup locations with flexible scheduling. No limit on private pickups.
              </p>
            </div>
            {!showForm && (
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
                    Location Name
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
                    Address
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
                      City
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
                      State
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
                      ZIP
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
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 600 }}>
                        {market.name}
                      </h3>
                      <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
                        {market.address}, {market.city}, {market.state} {market.zip}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
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
