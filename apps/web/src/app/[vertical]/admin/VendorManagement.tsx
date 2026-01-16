'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { VerticalBranding } from '@/lib/branding'

interface Vendor {
  id: string
  user_id: string
  status: string
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
}

interface VendorManagementProps {
  vertical: string
  branding: VerticalBranding
}

export default function VendorManagement({ vertical, branding }: VendorManagementProps) {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchVendors()
  }, [statusFilter])

  async function fetchVendors() {
    setLoading(true)

    let query = supabase
      .from('vendor_profiles')
      .select(`
        id,
        user_id,
        status,
        created_at,
        profile_data
      `)
      .eq('vertical_id', vertical)
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        // 'submitted' and 'draft' are pending approval
        query = query.in('status', ['submitted', 'draft'])
      } else {
        query = query.eq('status', statusFilter)
      }
    }

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
          user_email: vendor.profile_data?.email || 'Unknown'
        }
      })
      setVendors(vendorsWithDetails)
    }

    setLoading(false)
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
      backgroundColor: 'white',
      borderRadius: 8,
      padding: 25,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      {/* Header with filter */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
      }}>
        <h2 style={{ margin: 0, color: '#333' }}>Vendor Management</h2>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            fontSize: 14,
            border: '1px solid #ddd',
            borderRadius: 6,
            backgroundColor: 'white'
          }}
        >
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All Vendors</option>
        </select>
      </div>

      {/* Loading state */}
      {loading ? (
        <p style={{ color: '#666' }}>Loading vendors...</p>
      ) : vendors.length === 0 ? (
        <p style={{ color: '#666' }}>
          No vendors found with status: {statusFilter === 'pending' ? 'pending approval' : statusFilter}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '12px 10px', color: '#666', fontWeight: 600 }}>
                  Business Name
                </th>
                <th style={{ textAlign: 'left', padding: '12px 10px', color: '#666', fontWeight: 600 }}>
                  Contact
                </th>
                <th style={{ textAlign: 'left', padding: '12px 10px', color: '#666', fontWeight: 600 }}>
                  Type
                </th>
                <th style={{ textAlign: 'left', padding: '12px 10px', color: '#666', fontWeight: 600 }}>
                  Submitted
                </th>
                <th style={{ textAlign: 'left', padding: '12px 10px', color: '#666', fontWeight: 600 }}>
                  Status
                </th>
                <th style={{ textAlign: 'left', padding: '12px 10px', color: '#666', fontWeight: 600 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => {
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

                    {/* Submitted Date */}
                    <td style={{ padding: '15px 10px' }}>
                      <div style={{ color: '#333' }}>
                        {new Date(vendor.created_at).toLocaleDateString()}
                      </div>
                      {isStale && (
                        <div style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                          {vendor.days_pending} days ago
                        </div>
                      )}
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
                    <td style={{ padding: '15px 10px' }}>
                      {(vendor.status === 'submitted' || vendor.status === 'draft') && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleApprove(vendor.id)}
                            disabled={actionLoading === vendor.id}
                            style={{
                              padding: '6px 12px',
                              fontSize: 13,
                              fontWeight: 600,
                              backgroundColor: actionLoading === vendor.id ? '#ccc' : '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              cursor: actionLoading === vendor.id ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {actionLoading === vendor.id ? '...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleReject(vendor.id)}
                            disabled={actionLoading === vendor.id}
                            style={{
                              padding: '6px 12px',
                              fontSize: 13,
                              fontWeight: 600,
                              backgroundColor: actionLoading === vendor.id ? '#ccc' : '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              cursor: actionLoading === vendor.id ? 'not-allowed' : 'pointer'
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {vendor.status === 'approved' && (
                        <span style={{ color: '#666', fontSize: 13 }}>Active</span>
                      )}
                      {vendor.status === 'rejected' && (
                        <button
                          onClick={() => handleApprove(vendor.id)}
                          disabled={actionLoading === vendor.id}
                          style={{
                            padding: '6px 12px',
                            fontSize: 13,
                            fontWeight: 600,
                            backgroundColor: actionLoading === vendor.id ? '#ccc' : '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            cursor: actionLoading === vendor.id ? 'not-allowed' : 'pointer'
                          }}
                        >
                          Re-approve
                        </button>
                      )}
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
