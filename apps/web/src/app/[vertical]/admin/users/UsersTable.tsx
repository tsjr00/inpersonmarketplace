'use client'

import { useState, useMemo } from 'react'

interface UserProfile {
  id: string
  user_id: string
  display_name: string | null
  role: string
  roles: string[] | null
  created_at: string
  vendor_profiles: {
    id: string
    status: string
    vertical_id: string
    tier?: string
  }[]
}

interface UsersTableProps {
  users: UserProfile[]
  vertical: string
}

// Helper to determine display role
function getDisplayRole(user: UserProfile): string {
  const roles: string[] = []

  if (user.role === 'admin' || user.roles?.includes('admin')) {
    roles.push('admin')
  }

  if (user.vendor_profiles && user.vendor_profiles.length > 0) {
    roles.push('vendor')
  }

  if (user.roles?.includes('buyer') || roles.length === 0) {
    if (!roles.includes('admin')) {
      roles.push('buyer')
    }
  }

  return roles.join(', ')
}

// Helper to get primary role for filtering
function getPrimaryRole(user: UserProfile): string {
  if (user.role === 'admin' || user.roles?.includes('admin')) {
    return 'admin'
  }
  if (user.vendor_profiles && user.vendor_profiles.length > 0) {
    return 'vendor'
  }
  return 'buyer'
}

// Helper to get vendor status for filtering
function getVendorStatus(user: UserProfile, vertical: string): string | null {
  const vp = user.vendor_profiles?.find(v => v.vertical_id === vertical)
  return vp?.status || null
}

export default function UsersTable({ users, vertical }: UsersTableProps) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase()
        const nameMatch = user.display_name?.toLowerCase().includes(searchLower)
        const idMatch = user.user_id.toLowerCase().includes(searchLower)
        if (!nameMatch && !idMatch) return false
      }

      // Role filter
      if (roleFilter !== 'all') {
        const primaryRole = getPrimaryRole(user)
        if (primaryRole !== roleFilter) return false
      }

      // Vendor status filter (only applies to vendors)
      if (statusFilter !== 'all') {
        const vendorStatus = getVendorStatus(user, vertical)
        if (!vendorStatus) return false // Not a vendor in this vertical
        if (statusFilter === 'pending') {
          if (vendorStatus !== 'submitted' && vendorStatus !== 'draft') return false
        } else if (vendorStatus !== statusFilter) {
          return false
        }
      }

      return true
    })
  }, [users, search, roleFilter, statusFilter, vertical])

  return (
    <>
      {/* Search & Filters */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginBottom: 20,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {/* Search Input */}
        <div style={{ flex: '1 1 300px', minWidth: 200 }}>
          <input
            type="text"
            placeholder="Search by name or user ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 14,
              border: '1px solid #ddd',
              borderRadius: 6,
              backgroundColor: 'white'
            }}
          />
        </div>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            fontSize: 14,
            border: '1px solid #ddd',
            borderRadius: 6,
            backgroundColor: 'white',
            minWidth: 140
          }}
        >
          <option value="all">All Roles</option>
          <option value="admin">Admins</option>
          <option value="vendor">Vendors</option>
          <option value="buyer">Buyers</option>
        </select>

        {/* Vendor Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            fontSize: 14,
            border: '1px solid #ddd',
            borderRadius: 6,
            backgroundColor: 'white',
            minWidth: 160
          }}
        >
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>

        {/* Results count */}
        <span style={{ color: '#666', fontSize: 14 }}>
          {filteredUsers.length} of {users.length} users
        </span>
      </div>

      {/* Users Table */}
      {filteredUsers.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Name
                </th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Role(s)
                </th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Vendor Status
                </th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Tier
                </th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Joined
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #e9ecef' }}>
                  {/* Name */}
                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 500, color: '#333' }}>
                      {user.display_name || 'No name'}
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                      ID: {user.user_id.slice(0, 8)}...
                    </div>
                  </td>

                  {/* Role(s) */}
                  <td style={{ padding: 12 }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: getDisplayRole(user).includes('admin')
                        ? '#e7d6ff'
                        : getDisplayRole(user).includes('vendor')
                        ? '#d1f4ff'
                        : '#f3f4f6',
                      color: getDisplayRole(user).includes('admin')
                        ? '#6b21a8'
                        : getDisplayRole(user).includes('vendor')
                        ? '#0369a1'
                        : '#6b7280'
                    }}>
                      {getDisplayRole(user)}
                    </span>
                  </td>

                  {/* Vendor Status */}
                  <td style={{ padding: 12 }}>
                    {user.vendor_profiles && user.vendor_profiles.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {user.vendor_profiles.map((vp) => (
                          <span
                            key={vp.id}
                            style={{
                              padding: '3px 10px',
                              borderRadius: 10,
                              fontSize: 12,
                              fontWeight: 600,
                              backgroundColor:
                                vp.status === 'approved' ? '#d1fae5' :
                                vp.status === 'rejected' ? '#fee2e2' :
                                '#fef3c7',
                              color:
                                vp.status === 'approved' ? '#065f46' :
                                vp.status === 'rejected' ? '#991b1b' :
                                '#92400e',
                              display: 'inline-block'
                            }}
                          >
                            {vp.vertical_id}: {vp.status}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#999', fontSize: 13 }}>-</span>
                    )}
                  </td>

                  {/* Tier */}
                  <td style={{ padding: 12 }}>
                    {user.vendor_profiles && user.vendor_profiles.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {user.vendor_profiles.map((vp) => (
                          <span
                            key={vp.id}
                            style={{
                              padding: '3px 10px',
                              borderRadius: 10,
                              fontSize: 12,
                              fontWeight: 600,
                              backgroundColor:
                                vp.tier === 'premium' ? '#dbeafe' :
                                vp.tier === 'featured' ? '#fef3c7' : '#f3f4f6',
                              color:
                                vp.tier === 'premium' ? '#1e40af' :
                                vp.tier === 'featured' ? '#92400e' : '#6b7280',
                              display: 'inline-block'
                            }}
                          >
                            {vp.tier || 'standard'}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#999', fontSize: 13 }}>-</span>
                    )}
                  </td>

                  {/* Joined */}
                  <td style={{ padding: 12, color: '#666', fontSize: 14 }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 60,
          textAlign: 'center',
          color: '#666'
        }}>
          <p style={{ margin: 0 }}>
            {users.length === 0
              ? 'No users found.'
              : 'No users match your search criteria.'}
          </p>
          {(search || roleFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('')
                setRoleFilter('all')
                setStatusFilter('all')
              }}
              style={{
                marginTop: 16,
                padding: '8px 16px',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
                color: '#333'
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}
    </>
  )
}
