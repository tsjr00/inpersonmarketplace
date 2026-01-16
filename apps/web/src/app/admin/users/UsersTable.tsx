'use client'

import { useState, useMemo } from 'react'

interface VendorProfile {
  id: string
  status: string
  vertical_id: string
  tier?: string
}

interface UserProfile {
  id: string
  user_id: string
  email: string
  display_name: string | null
  role: string | null
  roles: string[] | null
  created_at: string
  vendor_profiles: VendorProfile[] | null
}

interface UsersTableProps {
  users: UserProfile[]
  verticals: string[]
}

// Helper to determine display role
function getDisplayRole(user: UserProfile): { label: string; isAdmin: boolean; isVendor: boolean } {
  const roles: string[] = []

  const isAdmin = user.role === 'admin' || user.roles?.includes('admin')
  if (isAdmin) {
    roles.push('admin')
  }

  const isVendor = user.vendor_profiles && user.vendor_profiles.length > 0
  if (isVendor) {
    roles.push('vendor')
  }

  if (user.roles?.includes('buyer') || roles.length === 0) {
    if (!isAdmin) {
      roles.push('buyer')
    }
  }

  return {
    label: roles.join(', '),
    isAdmin: !!isAdmin,
    isVendor: !!isVendor
  }
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

export default function UsersTable({ users, verticals }: UsersTableProps) {
  const [search, setSearch] = useState('')
  const [verticalFilter, setVerticalFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Search filter (name, email, user ID)
      if (search) {
        const searchLower = search.toLowerCase()
        const nameMatch = user.display_name?.toLowerCase().includes(searchLower)
        const emailMatch = user.email?.toLowerCase().includes(searchLower)
        const idMatch = user.user_id.toLowerCase().includes(searchLower)
        if (!nameMatch && !emailMatch && !idMatch) return false
      }

      // Vertical filter
      if (verticalFilter !== 'all') {
        const hasVertical = user.vendor_profiles?.some(vp => vp.vertical_id === verticalFilter)
        if (!hasVertical) return false
      }

      // Role filter
      if (roleFilter !== 'all') {
        const primaryRole = getPrimaryRole(user)
        if (primaryRole !== roleFilter) return false
      }

      // Status filter (vendor status)
      if (statusFilter !== 'all') {
        if (!user.vendor_profiles || user.vendor_profiles.length === 0) return false
        const hasStatus = user.vendor_profiles.some(vp => {
          if (statusFilter === 'pending') {
            return vp.status === 'submitted' || vp.status === 'draft'
          }
          return vp.status === statusFilter
        })
        if (!hasStatus) return false
      }

      // Tier filter
      if (tierFilter !== 'all') {
        if (!user.vendor_profiles || user.vendor_profiles.length === 0) return false
        const hasTier = user.vendor_profiles.some(vp => {
          const vpTier = vp.tier || 'standard'
          return vpTier === tierFilter
        })
        if (!hasTier) return false
      }

      return true
    })
  }, [users, search, verticalFilter, roleFilter, statusFilter, tierFilter])

  const clearFilters = () => {
    setSearch('')
    setVerticalFilter('all')
    setRoleFilter('all')
    setStatusFilter('all')
    setTierFilter('all')
  }

  const hasActiveFilters = search || verticalFilter !== 'all' || roleFilter !== 'all' ||
                           statusFilter !== 'all' || tierFilter !== 'all'

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
        <div style={{ flex: '1 1 250px', minWidth: 180 }}>
          <input
            type="text"
            placeholder="Search name, email, or ID..."
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

        {/* Vertical Filter */}
        <select
          value={verticalFilter}
          onChange={(e) => setVerticalFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            fontSize: 14,
            border: '1px solid #ddd',
            borderRadius: 6,
            backgroundColor: 'white',
            minWidth: 130
          }}
        >
          <option value="all">All Verticals</option>
          {verticals.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

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
            minWidth: 120
          }}
        >
          <option value="all">All Roles</option>
          <option value="admin">Admins</option>
          <option value="vendor">Vendors</option>
          <option value="buyer">Buyers</option>
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            fontSize: 14,
            border: '1px solid #ddd',
            borderRadius: 6,
            backgroundColor: 'white',
            minWidth: 130
          }}
        >
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>

        {/* Tier Filter */}
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            fontSize: 14,
            border: '1px solid #ddd',
            borderRadius: 6,
            backgroundColor: 'white',
            minWidth: 120
          }}
        >
          <option value="all">All Tiers</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
          <option value="featured">Featured</option>
        </select>

        {/* Results count */}
        <span style={{ color: '#666', fontSize: 14, whiteSpace: 'nowrap' }}>
          {filteredUsers.length} of {users.length}
        </span>
      </div>

      {/* Users Table */}
      {filteredUsers.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Email</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Name</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Role</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Vendor Status</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Tier</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const roleInfo = getDisplayRole(user)

                return (
                  <tr key={user.user_id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 15, color: '#333' }}>{user.email}</td>
                    <td style={{ padding: 15, color: '#666' }}>{user.display_name || 'N/A'}</td>
                    <td style={{ padding: 15 }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: roleInfo.isAdmin ? '#e0e7ff' : roleInfo.isVendor ? '#dbeafe' : '#f0f0f0',
                        color: roleInfo.isAdmin ? '#3730a3' : roleInfo.isVendor ? '#1e40af' : '#666'
                      }}>
                        {roleInfo.label}
                      </span>
                    </td>
                    <td style={{ padding: 15 }}>
                      {user.vendor_profiles && user.vendor_profiles.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {user.vendor_profiles.map((vp) => (
                            <span
                              key={vp.id}
                              style={{
                                padding: '3px 6px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 500,
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
                        <span style={{ color: '#999', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: 15 }}>
                      {user.vendor_profiles && user.vendor_profiles.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {user.vendor_profiles.map((vp) => (
                            <span
                              key={vp.id}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 10,
                                fontSize: 11,
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
                        <span style={{ color: '#999', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: 15, color: '#666', fontSize: 14 }}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 60,
          textAlign: 'center'
        }}>
          <p style={{ color: '#666', margin: 0 }}>
            {users.length === 0 ? 'No users found.' : 'No users match your filters.'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
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
