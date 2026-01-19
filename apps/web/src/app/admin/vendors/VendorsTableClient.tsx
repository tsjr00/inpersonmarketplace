'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useDebounce } from '@/lib/hooks/useDebounce'
import Pagination from '@/components/admin/Pagination'
import { exportToCSV, formatDateForExport } from '@/lib/export-csv'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface Vendor {
  id: string
  user_id: string
  vertical_id: string
  status: string
  tier: string | null
  created_at: string
  profile_data: {
    business_name?: string
    legal_name?: string
    email?: string
    phone?: string
    vendor_type?: string | string[]
  } | null
}

interface VendorsTableClientProps {
  vendors: Vendor[]
  verticals: Array<{ id: string; name_public: string }>
  totalCount: number
  currentPage: number
  pageSize: number
  totalPages: number
  initialFilters: {
    search: string
    status: string
    vertical: string
    tier: string
  }
}

export default function VendorsTableClient({
  vendors,
  verticals,
  totalCount,
  currentPage,
  pageSize,
  totalPages,
  initialFilters
}: VendorsTableClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Local state for immediate UI feedback
  const [searchInput, setSearchInput] = useState(initialFilters.search)
  const [status, setStatus] = useState(initialFilters.status)
  const [vertical, setVertical] = useState(initialFilters.vertical)
  const [tier, setTier] = useState(initialFilters.tier)
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

    router.push(`/admin/vendors?${params.toString()}`)
  }, [router, searchParams])

  // Effect to update URL when debounced search changes
  if (debouncedSearch !== initialFilters.search) {
    updateFilters({ search: debouncedSearch })
  }

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    router.push(`/admin/vendors?${params.toString()}`)
  }

  const handlePageSizeChange = (size: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('limit', String(size))
    params.set('page', '1')
    router.push(`/admin/vendors?${params.toString()}`)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      exportToCSV(vendors, 'vendors', [
        {
          key: 'profile_data',
          header: 'Business Name',
          getValue: (row) => row.profile_data?.business_name || ''
        },
        {
          key: 'profile_data',
          header: 'Legal Name',
          getValue: (row) => row.profile_data?.legal_name || ''
        },
        {
          key: 'profile_data',
          header: 'Email',
          getValue: (row) => row.profile_data?.email || ''
        },
        {
          key: 'profile_data',
          header: 'Phone',
          getValue: (row) => row.profile_data?.phone || ''
        },
        { key: 'vertical_id', header: 'Vertical' },
        { key: 'status', header: 'Status' },
        {
          key: 'tier',
          header: 'Tier',
          getValue: (row) => row.tier || 'standard'
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
    setStatus('')
    setVertical('')
    setTier('')
    router.push('/admin/vendors')
  }

  const hasFilters = searchInput || status || vertical || tier

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
          placeholder="Search by business name or email..."
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
            <option key={v.id} value={v.id}>{v.name_public || v.id}</option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            updateFilters({ status: e.target.value })
          }}
          style={selectStyle}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>

        <select
          value={tier}
          onChange={(e) => {
            setTier(e.target.value)
            updateFilters({ tier: e.target.value })
          }}
          style={selectStyle}
        >
          <option value="">All Tiers</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
          <option value="featured">Featured</option>
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
              <th style={thStyle}>Business</th>
              <th style={thStyle}>Contact</th>
              <th style={thStyle}>Vertical</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Tier</th>
              <th style={thStyle}>Created</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: spacing.lg, textAlign: 'center', color: colors.textMuted }}>
                  No vendors found matching your filters
                </td>
              </tr>
            ) : (
              vendors.map((vendor) => {
                const profileData = vendor.profile_data
                const businessName = profileData?.business_name || profileData?.legal_name || 'Unknown'
                const vendorStatus = vendor.status
                const vendorTier = vendor.tier || 'standard'

                return (
                  <tr key={vendor.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                        {businessName}
                      </div>
                      {profileData?.legal_name && profileData.legal_name !== businessName && (
                        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                          {profileData.legal_name}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ color: colors.textPrimary }}>{profileData?.email || '-'}</div>
                      {profileData?.phone && (
                        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                          {profileData.phone}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: `${spacing['3xs']} ${spacing['2xs']}`,
                        backgroundColor: '#f0f0f0',
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold
                      }}>
                        {vendor.vertical_id}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: `${spacing['3xs']} ${spacing['2xs']}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold,
                        backgroundColor:
                          vendorStatus === 'approved' ? '#dcfce7' :
                          vendorStatus === 'submitted' || vendorStatus === 'draft' ? '#fef3c7' :
                          vendorStatus === 'rejected' ? '#fee2e2' : '#f3f4f6',
                        color:
                          vendorStatus === 'approved' ? '#166534' :
                          vendorStatus === 'submitted' || vendorStatus === 'draft' ? '#92400e' :
                          vendorStatus === 'rejected' ? '#991b1b' : '#6b7280'
                      }}>
                        {vendorStatus === 'submitted' || vendorStatus === 'draft' ? 'pending' : vendorStatus}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: `${spacing['3xs']} ${spacing['2xs']}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold,
                        backgroundColor:
                          vendorTier === 'premium' ? '#dbeafe' :
                          vendorTier === 'featured' ? '#fef3c7' : '#f3f4f6',
                        color:
                          vendorTier === 'premium' ? '#1e40af' :
                          vendorTier === 'featured' ? '#92400e' : '#6b7280'
                      }}>
                        {vendorTier}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {new Date(vendor.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <Link
                        href={`/admin/vendors/${vendor.id}`}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: colors.primary,
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.sm
                        }}
                      >
                        View
                      </Link>
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
