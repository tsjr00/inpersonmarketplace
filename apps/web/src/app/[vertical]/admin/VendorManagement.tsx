'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { VerticalBranding } from '@/lib/branding'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface Vendor {
  id: string
  user_id: string
  status: string
  tier?: string
  created_at: string
  profile_data: {
    business_name?: string
    legal_name?: string
    email?: string
    phone?: string
    vendor_type?: string | string[]
  }
  user_email?: string
  days_pending?: number
  markets?: { market_id: string; markets: { name: string } | null }[]
  market_vendors?: { market_id: string; markets: { name: string } | null }[]
}

interface VendorManagementProps {
  vertical: string
  branding: VerticalBranding
}

export default function VendorManagement({ vertical, branding }: VendorManagementProps) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchVendors()
  }, [])

  async function fetchVendors() {
    setLoading(true)

    const query = supabase
      .from('vendor_profiles')
      .select(`
        id,
        user_id,
        status,
        tier,
        created_at,
        profile_data,
        market_vendors (
          market_id,
          markets (
            name
          )
        )
      `)
      .eq('vertical_id', vertical)
      .order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('Error fetching vendors:', error)
      setVendors([])
    } else {
      // Calculate days pending for each vendor
      const vendorsWithDetails = (data || []).map((vendor) => {
        const daysPending = Math.floor(
          (Date.now() - new Date(vendor.created_at).getTime()) / (1000 * 60 * 60 * 24)
        )

        return {
          ...vendor,
          days_pending: daysPending,
          user_email: vendor.profile_data?.email || 'Unknown',
          markets: vendor.market_vendors || []
        }
      })
      setVendors(vendorsWithDetails as unknown as Vendor[])
    }

    setLoading(false)
  }

  // Client-side filtering
  const filteredVendors = useMemo(() => {
    return vendors.filter(vendor => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const businessName = vendor.profile_data?.business_name?.toLowerCase() || ''
        const legalName = vendor.profile_data?.legal_name?.toLowerCase() || ''
        const email = vendor.user_email?.toLowerCase() || ''
        if (!businessName.includes(searchLower) && !legalName.includes(searchLower) && !email.includes(searchLower)) {
          return false
        }
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending') {
          if (vendor.status !== 'submitted' && vendor.status !== 'draft') return false
        } else if (vendor.status !== statusFilter) {
          return false
        }
      }

      // Tier filter
      if (tierFilter !== 'all') {
        const vendorTier = vendor.tier || 'standard'
        if (vendorTier !== tierFilter) return false
      }

      return true
    })
  }, [vendors, searchTerm, statusFilter, tierFilter])

  const hasActiveFilters = searchTerm || statusFilter !== 'all' || tierFilter !== 'all'

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setTierFilter('all')
  }

  async function handleApprove(vendorId: string) {
    setActionLoading(vendorId)

    const res = await fetch(`/api/admin/vendors/${vendorId}/approve`, {
      method: 'POST'
    })

    if (res.ok) {
      fetchVendors()
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to approve vendor')
    }

    setActionLoading(null)
  }

  async function handleReject(vendorId: string) {
    if (!confirm('Are you sure you want to reject this vendor?')) return

    setActionLoading(vendorId)

    const res = await fetch(`/api/admin/vendors/${vendorId}/reject`, {
      method: 'POST'
    })

    if (res.ok) {
      fetchVendors()
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to reject vendor')
    }

    setActionLoading(null)
  }

  return (
    <div style={{
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.lg,
      boxShadow: shadows.sm
    }}>
      {/* Search and Filters */}
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
            placeholder="Search by business name or email..."
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
            minWidth: 140
          }}
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        {/* Tier Filter */}
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          style={{
            padding: `${spacing.xs} ${spacing.sm}`,
            fontSize: typography.sizes.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: 'white',
            minWidth: 130
          }}
        >
          <option value="all">All Tiers</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
          <option value="featured">Featured</option>
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
        {filteredVendors.length} of {vendors.length} vendor{vendors.length !== 1 ? 's' : ''}
      </div>

      {/* Loading state */}
      {loading ? (
        <p style={{ color: colors.textSecondary }}>Loading vendors...</p>
      ) : filteredVendors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: spacing.xl, color: colors.textSecondary }}>
          <p style={{ margin: 0 }}>
            {vendors.length === 0 ? 'No vendors found.' : 'No vendors match your filters.'}
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
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${colors.border}`, backgroundColor: colors.surfaceSubtle }}>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>
                  Business Name
                </th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>
                  Contact
                </th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>
                  Type
                </th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>
                  Markets
                </th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>
                  Tier
                </th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>
                  Status
                </th>
                <th style={{ textAlign: 'right', padding: spacing.sm, color: colors.textSecondary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.map((vendor) => {
                const isStale = vendor.days_pending !== undefined &&
                  vendor.days_pending >= 2 &&
                  (vendor.status === 'submitted' || vendor.status === 'draft')

                return (
                  <tr
                    key={vendor.id}
                    style={{
                      borderBottom: '1px solid #eee',
                      backgroundColor: isStale ? '#fef3c7' : 'transparent'
                    }}
                  >
                    {/* Business Name */}
                    <td style={{ padding: '15px 10px' }}>
                      <div style={{ fontWeight: 600, color: '#333' }}>
                        {vendor.profile_data?.business_name || 'Unnamed'}
                      </div>
                      <div style={{ fontSize: 13, color: '#666' }}>
                        {vendor.profile_data?.legal_name}
                      </div>
                    </td>

                    {/* Contact */}
                    <td style={{ padding: '15px 10px' }}>
                      <div style={{ color: '#333' }}>{vendor.user_email}</div>
                      <div style={{ fontSize: 13, color: '#666' }}>
                        {vendor.profile_data?.phone}
                      </div>
                    </td>

                    {/* Type */}
                    <td style={{ padding: '15px 10px', color: '#333' }}>
                      {Array.isArray(vendor.profile_data?.vendor_type)
                        ? vendor.profile_data.vendor_type.join(', ')
                        : vendor.profile_data?.vendor_type || '—'
                      }
                    </td>

                    {/* Markets */}
                    <td style={{ padding: '15px 10px' }}>
                      {vendor.markets && vendor.markets.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {vendor.markets.slice(0, 2).map((m, idx) => (
                            <span key={idx} style={{
                              fontSize: 12,
                              color: '#333',
                              backgroundColor: '#f0fdf4',
                              padding: '2px 8px',
                              borderRadius: 4
                            }}>
                              {m.markets?.name || 'Unknown'}
                            </span>
                          ))}
                          {vendor.markets.length > 2 && (
                            <span style={{ fontSize: 11, color: '#666' }}>
                              +{vendor.markets.length - 2} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#999', fontSize: 13 }}>No markets</span>
                      )}
                    </td>

                    {/* Tier */}
                    <td style={{ padding: '15px 10px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor:
                          vendor.tier === 'premium' ? '#dbeafe' :
                          vendor.tier === 'featured' ? '#fef3c7' : '#f3f4f6',
                        color:
                          vendor.tier === 'premium' ? '#1e40af' :
                          vendor.tier === 'featured' ? '#92400e' : '#6b7280'
                      }}>
                        {vendor.tier || 'standard'}
                      </span>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '15px 10px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: 20,
                        fontSize: 13,
                        fontWeight: 500,
                        backgroundColor:
                          vendor.status === 'approved' ? '#d1fae5' :
                          vendor.status === 'rejected' ? '#fee2e2' :
                          '#fef3c7',
                        color:
                          vendor.status === 'approved' ? '#065f46' :
                          vendor.status === 'rejected' ? '#991b1b' :
                          '#92400e'
                      }}>
                        {(vendor.status === 'submitted' || vendor.status === 'draft') ? 'pending' : vendor.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: spacing.sm, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: spacing.xs, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {/* View Link */}
                        <Link
                          href={`/${vertical}/vendor/${vendor.id}`}
                          style={{
                            padding: `${spacing['3xs']} ${spacing.xs}`,
                            fontSize: typography.sizes.sm,
                            fontWeight: typography.weights.medium,
                            backgroundColor: colors.primary,
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: radius.sm
                          }}
                        >
                          View
                        </Link>

                        {/* Approve/Reject for pending */}
                        {(vendor.status === 'submitted' || vendor.status === 'draft') && (
                          <>
                            <button
                              onClick={() => handleApprove(vendor.id)}
                              disabled={actionLoading === vendor.id}
                              style={{
                                padding: `${spacing['3xs']} ${spacing.xs}`,
                                fontSize: typography.sizes.sm,
                                fontWeight: typography.weights.semibold,
                                backgroundColor: actionLoading === vendor.id ? '#ccc' : '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: radius.sm,
                                cursor: actionLoading === vendor.id ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {actionLoading === vendor.id ? '...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleReject(vendor.id)}
                              disabled={actionLoading === vendor.id}
                              style={{
                                padding: `${spacing['3xs']} ${spacing.xs}`,
                                fontSize: typography.sizes.sm,
                                fontWeight: typography.weights.semibold,
                                backgroundColor: actionLoading === vendor.id ? '#ccc' : '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: radius.sm,
                                cursor: actionLoading === vendor.id ? 'not-allowed' : 'pointer'
                              }}
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {/* Re-approve for rejected */}
                        {vendor.status === 'rejected' && (
                          <button
                            onClick={() => handleApprove(vendor.id)}
                            disabled={actionLoading === vendor.id}
                            style={{
                              padding: `${spacing['3xs']} ${spacing.xs}`,
                              fontSize: typography.sizes.sm,
                              fontWeight: typography.weights.semibold,
                              backgroundColor: actionLoading === vendor.id ? '#ccc' : '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: radius.sm,
                              cursor: actionLoading === vendor.id ? 'not-allowed' : 'pointer'
                            }}
                          >
                            Re-approve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
