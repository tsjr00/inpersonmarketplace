'use client'

import { useState, useMemo } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface UserProfile {
  id: string
  user_id: string
  email?: string
  display_name: string | null
  role: string
  roles: string[] | null
  buyer_tier?: string | null
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
  const [vendorTierFilter, setVendorTierFilter] = useState<string>('all')
  const [buyerTierFilter, setBuyerTierFilter] = useState<string>('all')

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Search filter (now includes email)
      if (search) {
        const searchLower = search.toLowerCase()
        const nameMatch = user.display_name?.toLowerCase().includes(searchLower)
        const idMatch = user.user_id.toLowerCase().includes(searchLower)
        const emailMatch = user.email?.toLowerCase().includes(searchLower)
        if (!nameMatch && !idMatch && !emailMatch) return false
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

      // Vendor tier filter
      if (vendorTierFilter !== 'all') {
        const vp = user.vendor_profiles?.find(v => v.vertical_id === vertical)
        if (!vp) return false
        const vendorTier = vp.tier || 'standard'
        if (vendorTier !== vendorTierFilter) return false
      }

      // Buyer tier filter
      if (buyerTierFilter !== 'all') {
        const userBuyerTier = user.buyer_tier || 'free'
        if (userBuyerTier !== buyerTierFilter) return false
      }

      return true
    })
  }, [users, search, roleFilter, statusFilter, vendorTierFilter, buyerTierFilter, vertical])

  const hasActiveFilters = search || roleFilter !== 'all' || statusFilter !== 'all' || vendorTierFilter !== 'all' || buyerTierFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setRoleFilter('all')
    setStatusFilter('all')
    setVendorTierFilter('all')
    setBuyerTierFilter('all')
  }

  return (
    <>
      {/* Search & Filters */}
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
            placeholder="Search by name, email, or user ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{
            padding: `${spacing.xs} ${spacing.sm}`,
            fontSize: typography.sizes.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: 'white',
            minWidth: 120
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
            padding: `${spacing.xs} ${spacing.sm}`,
            fontSize: typography.sizes.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: 'white',
            minWidth: 140
          }}
        >
          <option value="all">Vendor Status</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>

        {/* Vendor Tier Filter */}
        <select
          value={vendorTierFilter}
          onChange={(e) => setVendorTierFilter(e.target.value)}
          style={{
            padding: `${spacing.xs} ${spacing.sm}`,
            fontSize: typography.sizes.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: 'white',
            minWidth: 130
          }}
        >
          <option value="all">Vendor Tier</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
          <option value="featured">Featured</option>
        </select>

        {/* Buyer Tier Filter */}
        <select
          value={buyerTierFilter}
          onChange={(e) => setBuyerTierFilter(e.target.value)}
          style={{
            padding: `${spacing.xs} ${spacing.sm}`,
            fontSize: typography.sizes.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: 'white',
            minWidth: 120
          }}
        >
          <option value="all">Buyer Tier</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
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
        {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
      </div>

      {/* Users Table */}
      {filteredUsers.length > 0 ? (
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          overflow: 'hidden',
          boxShadow: shadows.sm
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: colors.surfaceSubtle, borderBottom: `2px solid ${colors.border}` }}>
                <th style={{ padding: spacing.sm, textAlign: 'left', fontWeight: typography.weights.semibold, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                  Name
                </th>
                <th style={{ padding: spacing.sm, textAlign: 'left', fontWeight: typography.weights.semibold, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                  Email
                </th>
                <th style={{ padding: spacing.sm, textAlign: 'left', fontWeight: typography.weights.semibold, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                  Role(s)
                </th>
                <th style={{ padding: spacing.sm, textAlign: 'left', fontWeight: typography.weights.semibold, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                  Buyer Tier
                </th>
                <th style={{ padding: spacing.sm, textAlign: 'left', fontWeight: typography.weights.semibold, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                  Vendor Status
                </th>
                <th style={{ padding: spacing.sm, textAlign: 'left', fontWeight: typography.weights.semibold, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                  Vendor Tier
                </th>
                <th style={{ padding: spacing.sm, textAlign: 'left', fontWeight: typography.weights.semibold, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                  Joined
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  {/* Name */}
                  <td style={{ padding: spacing.sm }}>
                    <div style={{ fontWeight: typography.weights.medium, color: colors.textPrimary }}>
                      {user.display_name || 'No name'}
                    </div>
                    <div style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: spacing['3xs'] }}>
                      ID: {user.user_id.slice(0, 8)}...
                    </div>
                  </td>

                  {/* Email */}
                  <td style={{ padding: spacing.sm }}>
                    <div style={{ color: colors.textPrimary, fontSize: typography.sizes.sm }}>
                      {user.email || '—'}
                    </div>
                  </td>

                  {/* Role(s) */}
                  <td style={{ padding: spacing.sm }}>
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
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

                  {/* Buyer Tier */}
                  <td style={{ padding: spacing.sm }}>
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      backgroundColor: user.buyer_tier === 'premium' ? '#dbeafe' : '#f3f4f6',
                      color: user.buyer_tier === 'premium' ? '#1e40af' : '#6b7280'
                    }}>
                      {user.buyer_tier || 'free'}
                    </span>
                  </td>

                  {/* Vendor Status */}
                  <td style={{ padding: spacing.sm }}>
                    {user.vendor_profiles && user.vendor_profiles.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
                        {user.vendor_profiles
                          .filter(vp => vp.vertical_id === vertical)
                          .map((vp) => (
                          <span
                            key={vp.id}
                            style={{
                              padding: `${spacing['3xs']} ${spacing.xs}`,
                              borderRadius: radius.sm,
                              fontSize: typography.sizes.xs,
                              fontWeight: typography.weights.semibold,
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
                            {vp.status}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>—</span>
                    )}
                  </td>

                  {/* Vendor Tier */}
                  <td style={{ padding: spacing.sm }}>
                    {user.vendor_profiles && user.vendor_profiles.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
                        {user.vendor_profiles
                          .filter(vp => vp.vertical_id === vertical)
                          .map((vp) => (
                          <span
                            key={vp.id}
                            style={{
                              padding: `${spacing['3xs']} ${spacing.xs}`,
                              borderRadius: radius.sm,
                              fontSize: typography.sizes.xs,
                              fontWeight: typography.weights.semibold,
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
                      <span style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>—</span>
                    )}
                  </td>

                  {/* Joined */}
                  <td style={{ padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          padding: spacing.xl,
          textAlign: 'center',
          color: colors.textSecondary
        }}>
          <p style={{ margin: 0 }}>
            {users.length === 0
              ? 'No users found.'
              : 'No users match your filters.'}
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
      )}
    </>
  )
}
