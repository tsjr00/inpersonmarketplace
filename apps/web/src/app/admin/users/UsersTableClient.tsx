'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDebounce } from '@/lib/hooks/useDebounce'
import Pagination from '@/components/admin/Pagination'
import { exportToCSV, formatDateForExport } from '@/lib/export-csv'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

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
  verticals: string[] | null
  buyer_tier: string | null
  buyer_tier_expires_at: string | null
  created_at: string
  vendor_profiles: VendorProfile[] | null
}

interface UsersTableClientProps {
  users: UserProfile[]
  verticals: string[]
  totalCount: number
  currentPage: number
  pageSize: number
  totalPages: number
  initialFilters: {
    search: string
    role: string
    vertical: string
    vendorStatus: string
    vendorTier: string
    buyerTier: string
  }
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

export default function UsersTableClient({
  users,
  verticals,
  totalCount,
  currentPage,
  pageSize,
  totalPages,
  initialFilters
}: UsersTableClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Local state for immediate UI feedback
  const [searchInput, setSearchInput] = useState(initialFilters.search)
  const [role, setRole] = useState(initialFilters.role)
  const [vertical, setVertical] = useState(initialFilters.vertical)
  const [vendorStatus, setVendorStatus] = useState(initialFilters.vendorStatus)
  const [vendorTier, setVendorTier] = useState(initialFilters.vendorTier)
  const [buyerTier, setBuyerTier] = useState(initialFilters.buyerTier)
  const [exporting, setExporting] = useState(false)

  // Debounce search input (300ms)
  const debouncedSearch = useDebounce(searchInput, 300)

  // Update URL when filters change
  const updateFilters = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', '1') // Reset to page 1 when filters change

    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }

    router.push(`/admin/users?${params.toString()}`)
  }, [router, searchParams])

  // Effect to update URL when debounced search changes
  if (debouncedSearch !== initialFilters.search) {
    updateFilters({ search: debouncedSearch })
  }

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    router.push(`/admin/users?${params.toString()}`)
  }

  const handlePageSizeChange = (size: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('limit', String(size))
    params.set('page', '1')
    router.push(`/admin/users?${params.toString()}`)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      exportToCSV(users, 'all_users', [
        { key: 'email', header: 'Email' },
        { key: 'display_name', header: 'Display Name' },
        {
          key: 'roles',
          header: 'Roles',
          getValue: (row) => row.roles?.join(', ') || 'buyer'
        },
        {
          key: 'verticals',
          header: 'Verticals',
          getValue: (row) => row.verticals?.join(', ') || ''
        },
        { key: 'buyer_tier', header: 'Buyer Tier' },
        {
          key: 'vendor_profiles',
          header: 'Vendor Status',
          getValue: (row) => row.vendor_profiles?.map(vp => `${vp.vertical_id}:${vp.status}`).join('; ') || ''
        },
        {
          key: 'vendor_profiles',
          header: 'Vendor Tier',
          getValue: (row) => row.vendor_profiles?.map(vp => `${vp.vertical_id}:${vp.tier || 'standard'}`).join('; ') || ''
        },
        {
          key: 'created_at',
          header: 'Created',
          getValue: (row) => formatDateForExport(row.created_at)
        }
      ])
    } finally {
      setExporting(false)
    }
  }

  const clearFilters = () => {
    setSearchInput('')
    setRole('')
    setVertical('')
    setVendorStatus('')
    setVendorTier('')
    setBuyerTier('')
    router.push('/admin/users')
  }

  const hasFilters = searchInput || role || vertical || vendorStatus || vendorTier || buyerTier

  const inputStyle = {
    padding: spacing['2xs'],
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    fontSize: typography.sizes.sm,
  }

  const selectStyle = {
    ...inputStyle,
    minWidth: 120,
    backgroundColor: 'white',
  }

  return (
    <>
      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: spacing.sm,
        marginBottom: spacing.md,
        flexWrap: 'wrap',
        alignItems: 'center',
        padding: spacing.sm,
        backgroundColor: colors.surfaceMuted,
        borderRadius: radius.md
      }}>
        <input
          type="text"
          placeholder="Search by email or name..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ ...inputStyle, minWidth: 200, flex: 1 }}
        />

        <select
          value={vertical}
          onChange={(e) => {
            setVertical(e.target.value)
            updateFilters({ vertical: e.target.value })
          }}
          style={selectStyle}
        >
          <option value="">All Verticals</option>
          {verticals.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value)
            updateFilters({ role: e.target.value })
          }}
          style={selectStyle}
        >
          <option value="">All Roles</option>
          <option value="buyer">Buyer</option>
          <option value="vendor">Vendor</option>
          <option value="admin">Admin</option>
        </select>

        <select
          value={vendorStatus}
          onChange={(e) => {
            setVendorStatus(e.target.value)
            updateFilters({ vendorStatus: e.target.value })
          }}
          style={selectStyle}
        >
          <option value="">Vendor Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          value={vendorTier}
          onChange={(e) => {
            setVendorTier(e.target.value)
            updateFilters({ vendorTier: e.target.value })
          }}
          style={selectStyle}
        >
          <option value="">Vendor Tier</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
          <option value="featured">Featured</option>
        </select>

        <select
          value={buyerTier}
          onChange={(e) => {
            setBuyerTier(e.target.value)
            updateFilters({ buyerTier: e.target.value })
          }}
          style={selectStyle}
        >
          <option value="">Buyer Tier</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
        </select>

        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              padding: `${spacing['2xs']} ${spacing.xs}`,
              backgroundColor: 'white',
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              cursor: 'pointer',
              fontSize: typography.sizes.sm
            }}
          >
            Clear
          </button>
        )}

        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            padding: `${spacing['2xs']} ${spacing.xs}`,
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            cursor: exporting ? 'not-allowed' : 'pointer',
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.medium
          }}
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: radius.md,
        boxShadow: shadows.sm,
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: colors.surfaceMuted }}>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Verticals</th>
              <th style={thStyle}>Buyer Tier</th>
              <th style={thStyle}>Vendor Status</th>
              <th style={thStyle}>Vendor Tier</th>
              <th style={thStyle}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: spacing.lg, textAlign: 'center', color: colors.textMuted }}>
                  No users found matching your filters
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const roleInfo = getDisplayRole(user)
                return (
                  <tr key={user.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={tdStyle}>{user.email || '-'}</td>
                    <td style={tdStyle}>{user.display_name || '-'}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: `${spacing['3xs']} ${spacing['2xs']}`,
                        backgroundColor: roleInfo.isAdmin ? '#e0e7ff' : roleInfo.isVendor ? '#dbeafe' : '#f3f4f6',
                        color: roleInfo.isAdmin ? '#3730a3' : roleInfo.isVendor ? '#1e40af' : '#666',
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold
                      }}>
                        {roleInfo.label}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {user.verticals && user.verticals.length > 0 ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {user.verticals.map(v => (
                            <span key={v} style={{
                              padding: `${spacing['3xs']} ${spacing['2xs']}`,
                              backgroundColor: '#f3f4f6',
                              borderRadius: radius.sm,
                              fontSize: typography.sizes.xs
                            }}>
                              {v}
                            </span>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: `${spacing['3xs']} ${spacing['2xs']}`,
                        backgroundColor: user.buyer_tier === 'premium' ? '#fef3c7' : '#f3f4f6',
                        color: user.buyer_tier === 'premium' ? '#92400e' : '#6b7280',
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs
                      }}>
                        {user.buyer_tier || 'free'}
                      </span>
                      {user.buyer_tier === 'premium' && user.buyer_tier_expires_at && (
                        <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                          exp: {new Date(user.buyer_tier_expires_at).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {user.vendor_profiles && user.vendor_profiles.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {user.vendor_profiles.map(vp => (
                            <span
                              key={vp.id}
                              style={{
                                padding: `${spacing['3xs']} ${spacing['2xs']}`,
                                backgroundColor:
                                  vp.status === 'approved' ? '#dcfce7' :
                                  vp.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                                color:
                                  vp.status === 'approved' ? '#166534' :
                                  vp.status === 'rejected' ? '#991b1b' : '#92400e',
                                borderRadius: radius.sm,
                                fontSize: typography.sizes.xs,
                                display: 'inline-block'
                              }}
                            >
                              {vp.vertical_id}: {vp.status}
                            </span>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td style={tdStyle}>
                      {user.vendor_profiles && user.vendor_profiles.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {user.vendor_profiles.map(vp => (
                            <span
                              key={vp.id}
                              style={{
                                padding: `${spacing['3xs']} ${spacing['2xs']}`,
                                backgroundColor:
                                  vp.tier === 'premium' ? '#dbeafe' :
                                  vp.tier === 'featured' ? '#fef3c7' : '#f3f4f6',
                                color:
                                  vp.tier === 'premium' ? '#1e40af' :
                                  vp.tier === 'featured' ? '#92400e' : '#6b7280',
                                borderRadius: radius.sm,
                                fontSize: typography.sizes.xs,
                                display: 'inline-block'
                              }}
                            >
                              {vp.tier || 'standard'}
                            </span>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td style={tdStyle}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{ padding: `0 ${spacing.sm}` }}>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCount}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      </div>
    </>
  )
}

const thStyle = {
  padding: spacing.sm,
  textAlign: 'left' as const,
  fontWeight: typography.weights.semibold,
  fontSize: typography.sizes.sm,
  color: colors.textSecondary,
  borderBottom: `2px solid ${colors.border}`
}

const tdStyle = {
  padding: spacing.sm,
  fontSize: typography.sizes.sm,
  color: colors.textPrimary
}
