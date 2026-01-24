'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AdminNav from '@/components/admin/AdminNav'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

type Schedule = {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
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
  status: string
  approval_status?: 'pending' | 'approved' | 'rejected'
  submitted_by_vendor_id?: string
  submitted_by_name?: string
  submitted_at?: string
  rejection_reason?: string
  vendor_sells_at_market?: boolean
  schedules?: Schedule[]
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

  // Filter states
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [approvalFilter, setApprovalFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

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

  // Client-side filtering
  const filteredMarkets = useMemo(() => {
    return markets.filter(market => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const nameMatch = market.name.toLowerCase().includes(searchLower)
        const cityMatch = market.city.toLowerCase().includes(searchLower)
        const addressMatch = market.address.toLowerCase().includes(searchLower)
        const submitterMatch = market.submitted_by_name?.toLowerCase().includes(searchLower)
        if (!nameMatch && !cityMatch && !addressMatch && !submitterMatch) return false
      }

      // Status filter
      if (statusFilter !== 'all' && market.status !== statusFilter) {
        return false
      }

      // Approval status filter
      if (approvalFilter !== 'all' && market.approval_status !== approvalFilter) {
        return false
      }

      // Type filter
      if (typeFilter !== 'all' && market.market_type !== typeFilter) {
        return false
      }

      return true
    })
  }, [markets, searchTerm, statusFilter, approvalFilter, typeFilter])

  const hasActiveFilters = searchTerm || statusFilter !== 'all' || approvalFilter !== 'all' || typeFilter !== 'all'

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setApprovalFilter('all')
    setTypeFilter('all')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    // Validate lat/lng are required for traditional markets
    if (!formData.latitude || !formData.longitude) {
      alert('Latitude and Longitude are required. Without coordinates, this market will not appear in buyer location searches.')
      setSubmitting(false)
      return
    }

    const lat = parseFloat(formData.latitude)
    const lng = parseFloat(formData.longitude)

    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid numeric values for Latitude and Longitude.')
      setSubmitting(false)
      return
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      alert('Invalid coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.')
      setSubmitting(false)
      return
    }

    // Parse lat/lng as numbers
    const submitData = {
      ...formData,
      latitude: lat,
      longitude: lng,
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
        body: JSON.stringify({ approval_status: 'approved' })
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
        body: JSON.stringify({ approval_status: 'rejected', rejection_reason: reason || null })
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

  // Count pending for alert badge
  const pendingCount = markets.filter(m => m.approval_status === 'pending').length

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      color: colors.textPrimary,
      padding: spacing.lg
    }}>
      <div style={{ maxWidth: containers.xl, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing.md,
          paddingBottom: spacing.sm,
          borderBottom: `2px solid ${colors.primary}`,
          flexWrap: 'wrap',
          gap: spacing.sm
        }}>
          <div>
            <h1 style={{ color: colors.primary, margin: 0, fontSize: typography.sizes['2xl'] }}>
              Market Management
            </h1>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `${spacing['3xs']} 0 0 0` }}>
              Manage traditional and private pickup markets
            </p>
          </div>
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <button
              onClick={() => router.push(`/${vertical}/admin`)}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                backgroundColor: colors.surfaceSubtle,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                cursor: 'pointer',
                fontSize: typography.sizes.sm
              }}
            >
              Back to Admin
            </button>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: radius.sm,
                  cursor: 'pointer',
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold
                }}
              >
                + New Market
              </button>
            )}
          </div>
        </div>

        {/* Admin Navigation */}
        <AdminNav type="vertical" vertical={vertical} />

        {/* Pending Alert */}
        {pendingCount > 0 && !showForm && (
          <div style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: radius.md,
            padding: spacing.sm,
            marginBottom: spacing.md,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ color: '#92400e', fontWeight: typography.weights.medium }}>
              {pendingCount} market suggestion{pendingCount !== 1 ? 's' : ''} pending approval
            </span>
            <button
              onClick={() => setApprovalFilter('pending')}
              style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: radius.sm,
                cursor: 'pointer',
                fontSize: typography.sizes.sm
              }}
            >
              View Pending
            </button>
          </div>
        )}

        {/* Create/Edit Form */}
        {showForm && (
          <div style={{
            backgroundColor: colors.surfaceElevated,
            padding: spacing.lg,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            marginBottom: spacing.lg,
            boxShadow: shadows.sm
          }}>
            <h2 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, marginBottom: spacing.md, marginTop: 0 }}>
              {editingMarket ? 'Edit Market' : 'Create New Market'}
            </h2>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              <div>
                <label style={{ display: 'block', fontWeight: typography.weights.medium, marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
                  Market Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: `${spacing.xs} ${spacing.sm}`,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    boxSizing: 'border-box',
                    fontSize: typography.sizes.sm
                  }}
                  placeholder="e.g., Downtown Farmers Market"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: typography.weights.medium, marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
                  Address *
                </label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={{
                    width: '100%',
                    padding: `${spacing.xs} ${spacing.sm}`,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    boxSizing: 'border-box',
                    fontSize: typography.sizes.sm
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: spacing.sm }}>
                <div>
                  <label style={{ display: 'block', fontWeight: typography.weights.medium, marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    style={{
                      width: '100%',
                      padding: `${spacing.xs} ${spacing.sm}`,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      boxSizing: 'border-box',
                      fontSize: typography.sizes.sm
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: typography.weights.medium, marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
                    State *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    style={{
                      width: '100%',
                      padding: `${spacing.xs} ${spacing.sm}`,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      boxSizing: 'border-box',
                      fontSize: typography.sizes.sm
                    }}
                    maxLength={2}
                    placeholder="TX"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: typography.weights.medium, marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
                    ZIP *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.zip}
                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                    style={{
                      width: '100%',
                      padding: `${spacing.xs} ${spacing.sm}`,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      boxSizing: 'border-box',
                      fontSize: typography.sizes.sm
                    }}
                  />
                </div>
              </div>

              {/* Coordinates Required Warning */}
              <div style={{
                padding: spacing.sm,
                backgroundColor: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: radius.sm,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.xs }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <div>
                    <p style={{ margin: 0, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#92400e' }}>
                      Coordinates Required
                    </p>
                    <p style={{ margin: `${spacing['3xs']} 0 0 0`, fontSize: typography.sizes.xs, color: '#92400e' }}>
                      Latitude and Longitude are <strong>mandatory</strong>. Without valid coordinates, this market will not appear in buyer location searches (25-mile radius filter).
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
                <div>
                  <label style={{ display: 'block', fontWeight: typography.weights.medium, marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
                    Latitude *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    style={{
                      width: '100%',
                      padding: `${spacing.xs} ${spacing.sm}`,
                      border: `1px solid ${!formData.latitude ? '#f59e0b' : colors.border}`,
                      borderRadius: radius.sm,
                      boxSizing: 'border-box',
                      fontSize: typography.sizes.sm
                    }}
                    placeholder="e.g., 35.2220"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: typography.weights.medium, marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
                    Longitude *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    style={{
                      width: '100%',
                      padding: `${spacing.xs} ${spacing.sm}`,
                      border: `1px solid ${!formData.longitude ? '#f59e0b' : colors.border}`,
                      borderRadius: radius.sm,
                      boxSizing: 'border-box',
                      fontSize: typography.sizes.sm
                    }}
                    placeholder="e.g., -101.8313"
                  />
                </div>
              </div>
              <p style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: spacing['3xs'] }}>
                Get coordinates from <a href="https://www.latlong.net/" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary }}>latlong.net</a> - enter the market address to find its coordinates
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: spacing.sm }}>
                <div>
                  <label style={{ display: 'block', fontWeight: typography.weights.medium, marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
                    Day of Week *
                  </label>
                  <select
                    required
                    value={formData.day_of_week}
                    onChange={(e) => setFormData({ ...formData, day_of_week: parseInt(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: `${spacing.xs} ${spacing.sm}`,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      boxSizing: 'border-box',
                      fontSize: typography.sizes.sm
                    }}
                  >
                    {DAYS.map((day, index) => (
                      <option key={index} value={index}>{day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: typography.weights.medium, marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
                    Start Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    style={{
                      width: '100%',
                      padding: `${spacing.xs} ${spacing.sm}`,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      boxSizing: 'border-box',
                      fontSize: typography.sizes.sm
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: typography.weights.medium, marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
                    End Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    style={{
                      width: '100%',
                      padding: `${spacing.xs} ${spacing.sm}`,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      boxSizing: 'border-box',
                      fontSize: typography.sizes.sm
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: typography.weights.medium, marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
                  Status *
                </label>
                <select
                  required
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  style={{
                    width: '100%',
                    padding: `${spacing.xs} ${spacing.sm}`,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    boxSizing: 'border-box',
                    fontSize: typography.sizes.sm
                  }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending Approval</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: spacing.sm }}>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: `${spacing.xs} ${spacing.md}`,
                    backgroundColor: colors.primary,
                    color: 'white',
                    border: 'none',
                    borderRadius: radius.sm,
                    fontWeight: typography.weights.semibold,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.5 : 1,
                    fontSize: typography.sizes.sm
                  }}
                >
                  {submitting ? 'Saving...' : (editingMarket ? 'Update Market' : 'Create Market')}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    padding: `${spacing.xs} ${spacing.md}`,
                    backgroundColor: colors.surfaceSubtle,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    cursor: 'pointer',
                    fontSize: typography.sizes.sm
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search and Filters */}
        {!showForm && (
          <>
            <div style={{
              display: 'flex',
              gap: spacing.sm,
              marginBottom: spacing.md,
              flexWrap: 'wrap',
              alignItems: 'center'
            }}>
              {/* Search Input */}
              <div style={{ flex: '1 1 250px', minWidth: 200 }}>
                <input
                  type="text"
                  placeholder="Search by name, city, or address..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: `${spacing.xs} ${spacing.sm}`,
                    fontSize: typography.sizes.sm,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    backgroundColor: 'white'
                  }}
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  fontSize: typography.sizes.sm,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  backgroundColor: 'white',
                  minWidth: 130
                }}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              {/* Approval Filter */}
              <select
                value={approvalFilter}
                onChange={(e) => setApprovalFilter(e.target.value)}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  fontSize: typography.sizes.sm,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  backgroundColor: approvalFilter === 'pending' ? '#fef3c7' : 'white',
                  minWidth: 140
                }}
              >
                <option value="all">All Approvals</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  fontSize: typography.sizes.sm,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  backgroundColor: 'white',
                  minWidth: 150
                }}
              >
                <option value="all">All Types</option>
                <option value="traditional">Traditional</option>
                <option value="private_pickup">Private Pickup</option>
              </select>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  style={{
                    padding: `${spacing.xs} ${spacing.sm}`,
                    backgroundColor: colors.surfaceSubtle,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    cursor: 'pointer',
                    fontSize: typography.sizes.sm
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* Results count */}
            <div style={{ marginBottom: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
              {filteredMarkets.length} of {markets.length} market{markets.length !== 1 ? 's' : ''}
            </div>

            {/* Markets Table */}
            <div style={{
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              boxShadow: shadows.sm,
              overflow: 'hidden'
            }}>
              {loading ? (
                <div style={{ padding: spacing.lg, textAlign: 'center', color: colors.textSecondary }}>
                  Loading markets...
                </div>
              ) : filteredMarkets.length === 0 ? (
                <div style={{ padding: spacing.xl, textAlign: 'center', color: colors.textSecondary }}>
                  <p style={{ margin: 0 }}>
                    {markets.length === 0 ? 'No markets found.' : 'No markets match your filters.'}
                  </p>
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      style={{
                        marginTop: spacing.sm,
                        padding: `${spacing.xs} ${spacing.sm}`,
                        backgroundColor: colors.surfaceSubtle,
                        border: 'none',
                        borderRadius: radius.sm,
                        cursor: 'pointer',
                        fontSize: typography.sizes.sm,
                        color: colors.textPrimary
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                  {markets.length === 0 && (
                    <button
                      onClick={() => setShowForm(true)}
                      style={{
                        marginTop: spacing.sm,
                        padding: `${spacing.xs} ${spacing.sm}`,
                        backgroundColor: colors.primary,
                        color: 'white',
                        border: 'none',
                        borderRadius: radius.sm,
                        cursor: 'pointer',
                        fontSize: typography.sizes.sm
                      }}
                    >
                      Create First Market
                    </button>
                  )}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: colors.surfaceSubtle }}>
                      <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                        Name
                      </th>
                      <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                        Location
                      </th>
                      <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                        Schedule
                      </th>
                      <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                        Type
                      </th>
                      <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                        Approval
                      </th>
                      <th style={{ textAlign: 'right', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMarkets.map((market) => (
                      <tr key={market.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td style={{ padding: spacing.sm }}>
                          <div style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                            {market.name}
                          </div>
                        </td>
                        <td style={{ padding: spacing.sm }}>
                          <div style={{ color: colors.textPrimary, fontSize: typography.sizes.sm }}>
                            {market.city}, {market.state}
                          </div>
                          <div style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>
                            {market.address}
                          </div>
                        </td>
                        <td style={{ padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                          {market.day_of_week !== null && market.day_of_week !== undefined ? (
                            <>
                              {DAYS[market.day_of_week]}
                              <br />
                              <span style={{ fontSize: typography.sizes.xs }}>
                                {market.start_time} - {market.end_time}
                              </span>
                            </>
                          ) : '—'}
                        </td>
                        <td style={{ padding: spacing.sm }}>
                          <span style={{
                            padding: `${spacing['3xs']} ${spacing.xs}`,
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.xs,
                            fontWeight: typography.weights.semibold,
                            backgroundColor: market.market_type === 'traditional' ? '#d1fae5' : '#fef3c7',
                            color: market.market_type === 'traditional' ? '#065f46' : '#92400e'
                          }}>
                            {market.market_type === 'traditional' ? 'Traditional' : 'Private Pickup'}
                          </span>
                        </td>
                        <td style={{ padding: spacing.sm }}>
                          <div>
                            <span style={{
                              padding: `${spacing['3xs']} ${spacing.xs}`,
                              borderRadius: radius.sm,
                              fontSize: typography.sizes.xs,
                              fontWeight: typography.weights.semibold,
                              backgroundColor:
                                market.approval_status === 'approved' ? '#d1fae5' :
                                market.approval_status === 'pending' ? '#fef3c7' :
                                market.approval_status === 'rejected' ? '#fee2e2' :
                                '#f3f4f6',
                              color:
                                market.approval_status === 'approved' ? '#065f46' :
                                market.approval_status === 'pending' ? '#92400e' :
                                market.approval_status === 'rejected' ? '#991b1b' :
                                '#6b7280'
                            }}>
                              {market.approval_status || 'approved'}
                            </span>
                            {market.submitted_by_name && (
                              <div style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: spacing['3xs'] }}>
                                by {market.submitted_by_name}
                              </div>
                            )}
                            {market.submitted_at && (
                              <div style={{ fontSize: typography.sizes.xs, color: colors.textSecondary }}>
                                {new Date(market.submitted_at).toLocaleDateString()}
                              </div>
                            )}
                            {/* Show if vendor sells here or just a lead */}
                            {market.submitted_by_vendor_id && (
                              <div style={{
                                marginTop: spacing['3xs'],
                                padding: `${spacing['3xs']} ${spacing.xs}`,
                                borderRadius: radius.sm,
                                fontSize: typography.sizes.xs,
                                fontWeight: typography.weights.medium,
                                display: 'inline-block',
                                backgroundColor: market.vendor_sells_at_market !== false ? '#dbeafe' : '#fef3c7',
                                color: market.vendor_sells_at_market !== false ? '#1e40af' : '#92400e'
                              }}>
                                {market.vendor_sells_at_market !== false ? 'Vendor sells here' : 'Lead only'}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: spacing.sm, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: spacing.xs, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {/* Approve/Reject for pending approval */}
                            {market.approval_status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprove(market.id)}
                                  style={{
                                    padding: `${spacing['3xs']} ${spacing.xs}`,
                                    backgroundColor: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: radius.sm,
                                    cursor: 'pointer',
                                    fontSize: typography.sizes.sm,
                                    fontWeight: typography.weights.medium
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReject(market.id)}
                                  style={{
                                    padding: `${spacing['3xs']} ${spacing.xs}`,
                                    backgroundColor: '#ef4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: radius.sm,
                                    cursor: 'pointer',
                                    fontSize: typography.sizes.sm,
                                    fontWeight: typography.weights.medium
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {/* Re-approve rejected markets */}
                            {market.approval_status === 'rejected' && (
                              <button
                                onClick={() => handleApprove(market.id)}
                                style={{
                                  padding: `${spacing['3xs']} ${spacing.xs}`,
                                  backgroundColor: '#10b981',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: radius.sm,
                                  cursor: 'pointer',
                                  fontSize: typography.sizes.sm,
                                  fontWeight: typography.weights.medium
                                }}
                              >
                                Approve
                              </button>
                            )}
                            <button
                              onClick={() => handleEdit(market)}
                              style={{
                                padding: `${spacing['3xs']} ${spacing.xs}`,
                                backgroundColor: colors.primary,
                                color: 'white',
                                border: 'none',
                                borderRadius: radius.sm,
                                cursor: 'pointer',
                                fontSize: typography.sizes.sm
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(market.id, market.name)}
                              style={{
                                padding: `${spacing['3xs']} ${spacing.xs}`,
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: radius.sm,
                                cursor: 'pointer',
                                fontSize: typography.sizes.sm
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
