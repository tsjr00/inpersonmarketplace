'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AdminNav from '@/components/admin/AdminNav'

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
  status: string
  submitted_by?: string
  submitted_at?: string
  rejection_reason?: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function AdminMarketsPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string

  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingMarket, setEditingMarket] = useState<Market | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    latitude: '',
    longitude: '',
    day_of_week: 6, // Saturday default
    start_time: '08:00',
    end_time: '13:00',
    status: 'active'
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchMarkets()
  }, [vertical])

  const fetchMarkets = async () => {
    try {
      const res = await fetch(`/api/admin/markets?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        setMarkets(data.markets || [])
      }
    } catch (error) {
      console.error('Error fetching markets:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    // Parse lat/lng as numbers if provided
    const submitData = {
      ...formData,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
    }

    try {
      if (editingMarket) {
        // Update
        const res = await fetch(`/api/admin/markets/${editingMarket.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vertical, ...submitData })
        })

        if (res.ok) {
          await fetchMarkets()
          resetForm()
        } else {
          const error = await res.json()
          alert(error.error || 'Failed to update market')
        }
      } else {
        // Create
        const res = await fetch(`/api/admin/markets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vertical, ...submitData })
        })

        if (res.ok) {
          await fetchMarkets()
          resetForm()
        } else {
          const error = await res.json()
          alert(error.error || 'Failed to create market')
        }
      }
    } catch (error) {
      console.error('Error saving market:', error)
      alert('Failed to save market')
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
      zip: market.zip,
      latitude: market.latitude?.toString() || '',
      longitude: market.longitude?.toString() || '',
      day_of_week: market.day_of_week ?? 6,
      start_time: market.start_time || '08:00',
      end_time: market.end_time || '13:00',
      status: market.status
    })
    setShowForm(true)
  }

  const handleDelete = async (marketId: string, marketName: string) => {
    if (!confirm(`Delete market "${marketName}"? This will affect all vendor listings at this market.`)) {
      return
    }

    try {
      const res = await fetch(`/api/admin/markets/${marketId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        await fetchMarkets()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to delete market')
      }
    } catch (error) {
      console.error('Error deleting market:', error)
      alert('Failed to delete market')
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
      day_of_week: 6,
      start_time: '08:00',
      end_time: '13:00',
      status: 'active'
    })
  }

  const handleApprove = async (marketId: string) => {
    try {
      const res = await fetch(`/api/admin/markets/${marketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' })
      })

      if (res.ok) {
        await fetchMarkets()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to approve market')
      }
    } catch (error) {
      console.error('Error approving market:', error)
      alert('Failed to approve market')
    }
  }

  const handleReject = async (marketId: string) => {
    const reason = prompt('Reason for rejection (optional):')

    try {
      const res = await fetch(`/api/admin/markets/${marketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', rejection_reason: reason || null })
      })

      if (res.ok) {
        await fetchMarkets()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to reject market')
      }
    } catch (error) {
      console.error('Error rejecting market:', error)
      alert('Failed to reject market')
    }
  }

  if (loading) {
    return <div style={{ padding: '24px' }}>Loading markets...</div>
  }

  const pendingMarkets = markets.filter(m => m.status === 'pending')
  const activeMarkets = markets.filter(m => m.market_type === 'traditional' && m.status === 'active')
  const inactiveMarkets = markets.filter(m => m.market_type === 'traditional' && m.status === 'inactive')

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <AdminNav type="vertical" vertical={vertical} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Market Management</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => router.push(`/${vertical}/admin`)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Back to Admin
          </button>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Create Traditional Market
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', marginTop: 0 }}>
            {editingMarket ? 'Edit Market' : 'Create New Traditional Market'}
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                Market Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box'
                }}
                placeholder="e.g., Downtown Farmers Market"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                Address *
              </label>
              <input
                type="text"
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  City *
                </label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  State *
                </label>
                <input
                  type="text"
                  required
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                  maxLength={2}
                  placeholder="TX"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  ZIP *
                </label>
                <input
                  type="text"
                  required
                  value={formData.zip}
                  onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  Latitude <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                  placeholder="e.g., 35.2220"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  Longitude <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                  placeholder="e.g., -101.8313"
                />
              </div>
            </div>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '-8px' }}>
              Get coordinates from <a href="https://www.latlong.net/" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>latlong.net</a> - enables 25-mile radius filtering for buyers
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  Day of Week *
                </label>
                <select
                  required
                  value={formData.day_of_week}
                  onChange={(e) => setFormData({ ...formData, day_of_week: parseInt(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                >
                  {DAYS.map((day, index) => (
                    <option key={index} value={index}>{day}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  Start Time *
                </label>
                <input
                  type="time"
                  required
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                  End Time *
                </label>
                <input
                  type="time"
                  required
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px' }}>
                Status *
              </label>
              <select
                required
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending Approval</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.5 : 1
                }}
              >
                {submitting ? 'Saving...' : (editingMarket ? 'Update Market' : 'Create Market')}
              </button>
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pending Markets Section - Vendor Submissions */}
      {pendingMarkets.length > 0 && (
        <div style={{ backgroundColor: '#fef3c7', padding: '24px', borderRadius: '8px', border: '1px solid #f59e0b', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', marginTop: 0, color: '#92400e' }}>
            ⏳ Pending Approval ({pendingMarkets.length})
          </h2>
          <p style={{ fontSize: '14px', color: '#92400e', marginBottom: '16px' }}>
            These markets were submitted by vendors and require admin review.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {pendingMarkets.map(market => (
              <div
                key={market.id}
                style={{
                  padding: '16px',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', marginTop: 0 }}>
                      {market.name}
                    </h3>
                    <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px', marginTop: 0 }}>
                      {market.address}, {market.city}, {market.state} {market.zip}
                    </p>
                    {market.day_of_week !== null && market.day_of_week !== undefined && (
                      <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                        {DAYS[market.day_of_week]} {market.start_time} - {market.end_time}
                      </p>
                    )}
                    {market.submitted_at && (
                      <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px', marginBottom: 0 }}>
                        Submitted: {new Date(market.submitted_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleApprove(market.id)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#059669',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => handleReject(market.id)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}
                    >
                      ✗ Reject
                    </button>
                    <button
                      onClick={() => handleEdit(market)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', marginTop: 0 }}>
          Active Markets ({activeMarkets.length})
        </h2>

        {activeMarkets.length === 0 ? (
          <p style={{ color: '#6b7280', fontStyle: 'italic' }}>
            No active traditional markets yet. Create one above.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {activeMarkets.map(market => (
              <div
                key={market.id}
                style={{
                  padding: '16px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px', marginTop: 0 }}>
                      {market.name}
                    </h3>
                    <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px', marginTop: 0 }}>
                      {market.address}, {market.city}, {market.state} {market.zip}
                    </p>
                    {market.day_of_week !== null && market.day_of_week !== undefined && (
                      <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                        {DAYS[market.day_of_week]} {market.start_time} - {market.end_time}
                      </p>
                    )}
                    <p style={{
                      fontSize: '12px',
                      marginTop: '8px',
                      marginBottom: 0,
                      color: market.status === 'active' ? '#059669' : '#6b7280',
                      fontWeight: '500'
                    }}>
                      Status: {market.status}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleEdit(market)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(market.id, market.name)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
