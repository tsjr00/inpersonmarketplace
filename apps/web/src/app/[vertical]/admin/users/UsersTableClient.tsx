'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
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
  email?: string
  display_name: string | null
  role: string
  roles: string[] | null
  buyer_tier?: string | null
  created_at: string
  vendor_profiles: VendorProfile[] | null
}

interface UsersTableClientProps {
  users: UserProfile[]
  vertical: string
  totalCount: number
  currentPage: number
  pageSize: number
  totalPages: number
  initialFilters: {
    search: string
    role: string
    vendorStatus: string
    vendorTier: string
    buyerTier: string
  }
}

export default function UsersTableClient({
  users,
  vertical,
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
  const [vendorStatus, setVendorStatus] = useState(initialFilters.vendorStatus)
  const [vendorTier, setVendorTier] = useState(initialFilters.vendorTier)
  const [buyerTier, setBuyerTier] = useState(initialFilters.buyerTier)
  const [exporting, setExporting] = useState(false)

  // Debounce search input (300ms)
  const debouncedSearch = useDebounce(searchInput, 300)

  // Update URL when filters change (triggers server-side re-fetch)
  const updateFilters = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())

    // Reset to page 1 when filters change
    params.set('page', '1')

    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }

    router.push(`/${vertical}/admin/users?${params.toString()}`)
  }, [router, vertical, searchParams])

  // Effect to update URL when debounced search changes
  // Using a simple check to avoid infinite loops
  if (debouncedSearch !== initialFilters.search) {
    updateFilters({ search: debouncedSearch })
  }

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    router.push(`/${vertical}/admin/users?${params.toString()}`)
  }

  const handlePageSizeChange = (size: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('limit', String(size))
    params.set('page', '1')
    router.push(`/${vertical}/admin/users?${params.toString()}`)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      // For export, we need to fetch all data matching current filters
      // This is intentionally a heavier operation, only triggered by explicit user action
      const params = new URLSearchParams()
      if (searchInput) params.set('search', searchInput)
      if (role) params.set('role', role)
      if (vendorStatus) params.set('vendorStatus', vendorStatus)
      if (vendorTier) params.set('vendorTier', vendorTier)
      if (buyerTier) params.set('buyerTier', buyerTier)
      params.set('limit', '10000') // Max export

      // Use the current page's data for now (TODO: implement full export API)
      exportToCSV(users, `${vertical}_users`, [
        { key: 'email', header: 'Email' },
        { key: 'display_name', header: 'Display Name' },
        { key: 'role', header: 'Role' },
        { key: 'buyer_tier', header: 'Buyer Tier' },
        {
          key: 'vendor_profiles',
          header: 'Vendor Status',
          getValue: (row) => {
            const vp = row.vendor_profiles?.find(p => p.vertical_id === vertical)
            return vp?.status || ''
          }
        },
        {
          key: 'vendor_profiles',
          header: 'Vendor Tier',
          getValue: (row) => {
            const vp = row.vendor_profiles?.find(p => p.vertical_id === vertical)
            return vp?.tier || ''
          }
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
    setVendorStatus('')
    setVendorTier('')
    setBuyerTier('')
    router.push(`/${vertical}/admin/users`)
  }

  const hasFilters = searchInput || role || vendorStatus || vendorTier || buyerTier

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
          <option value="submitted">Pending</option>
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
              <th style={thStyle}>Display Name</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Buyer Tier</th>
              <th style={thStyle}>Vendor Status</th>
              <th style={thStyle}>Vendor Tier</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Actions</th>
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
                const vendorProfile = user.vendor_profiles?.find(vp => vp.vertical_id === vertical)
                return (
                  <tr key={user.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={tdStyle}>{user.email || '-'}</td>
                    <td style={tdStyle}>{user.display_name || '-'}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: `${spacing['3xs']} ${spacing['2xs']}`,
                        backgroundColor: user.roles?.includes('admin') ? '#dbeafe' : '#f3f4f6',
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs
                      }}>
                        {user.roles?.join(', ') || user.role || 'buyer'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {user.buyer_tier && (
                        <span style={{
                          padding: `${spacing['3xs']} ${spacing['2xs']}`,
                          backgroundColor: user.buyer_tier === 'premium' ? '#fef3c7' : '#f3f4f6',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs
                        }}>
                          {user.buyer_tier}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {vendorProfile && (
                        <span style={{
                          padding: `${spacing['3xs']} ${spacing['2xs']}`,
                          backgroundColor:
                            vendorProfile.status === 'approved' ? '#dcfce7' :
                            vendorProfile.status === 'submitted' ? '#fef3c7' :
                            '#fee2e2',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs
                        }}>
                          {vendorProfile.status}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {vendorProfile?.tier && (
                        <span style={{
                          padding: `${spacing['3xs']} ${spacing['2xs']}`,
                          backgroundColor: vendorProfile.tier === 'premium' ? '#ddd6fe' : '#f3f4f6',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs
                        }}>
                          {vendorProfile.tier}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td style={tdStyle}>
                      {vendorProfile && (
                        <Link
                          href={`/${vertical}/admin/vendors/${vendorProfile.id}`}
                          style={{
                            color: colors.primary,
                            textDecoration: 'none',
                            fontSize: typography.sizes.sm
                          }}
                        >
                          View Vendor
                        </Link>
                      )}
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
