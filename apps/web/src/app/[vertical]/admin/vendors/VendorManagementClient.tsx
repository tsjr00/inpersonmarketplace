'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useDebounce } from '@/lib/hooks/useDebounce'
import Pagination from '@/components/admin/Pagination'
import VendorVerificationPanel from '@/components/admin/VendorVerificationPanel'
import { exportToCSV, formatDateForExport } from '@/lib/export-csv'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface Vendor {
  id: string
  user_id: string
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
  days_pending: number
  user_email: string
  markets: Array<{ market_id: string; markets: { name: string } | null }>
}

interface Verification {
  status: string
  documents: Array<{ url: string; filename: string; type: string; uploaded_at: string }>
  notes: string | null
  reviewed_at: string | null
  requested_categories: string[]
  category_verifications: Record<string, {
    status: string
    doc_type?: string
    documents?: Array<{ url: string; filename: string; doc_type: string }>
    notes?: string
    reviewed_at?: string
  }>
  coi_status: string
  coi_documents: Array<{ url: string; filename: string; uploaded_at: string }>
  coi_verified_at: string | null
  prohibited_items_acknowledged_at: string | null
  onboarding_completed_at: string | null
}

interface VendorManagementClientProps {
  vertical: string
  vendors: Vendor[]
  verifications: Record<string, Verification>
  totalCount: number
  currentPage: number
  pageSize: number
  totalPages: number
  initialFilters: {
    search: string
    status: string
    tier: string
  }
}

export default function VendorManagementClient({
  vertical,
  vendors: initialVendors,
  verifications,
  totalCount,
  currentPage,
  pageSize,
  totalPages,
  initialFilters
}: VendorManagementClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Vendors state (to allow optimistic updates after approve/reject)
  const [vendors, setVendors] = useState(initialVendors)

  // Local state for immediate UI feedback
  const [searchInput, setSearchInput] = useState(initialFilters.search)
  const [status, setStatus] = useState(initialFilters.status)
  const [tier, setTier] = useState(initialFilters.tier)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null)

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

    router.push(`/${vertical}/admin/vendors?${params.toString()}`)
  }, [router, vertical, searchParams])

  // Effect to update URL when debounced search changes
  if (debouncedSearch !== initialFilters.search) {
    updateFilters({ search: debouncedSearch })
  }

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    router.push(`/${vertical}/admin/vendors?${params.toString()}`)
  }

  const handlePageSizeChange = (size: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('limit', String(size))
    params.set('page', '1')
    router.push(`/${vertical}/admin/vendors?${params.toString()}`)
  }

  const handleApprove = async (vendorId: string) => {
    setActionLoading(vendorId)

    const res = await fetch(`/api/admin/vendors/${vendorId}/approve`, {
      method: 'POST'
    })

    if (res.ok) {
      // Optimistic update
      setVendors(prev => prev.map(v =>
        v.id === vendorId ? { ...v, status: 'approved' } : v
      ))
      // Refresh server data
      router.refresh()
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to approve vendor')
    }

    setActionLoading(null)
  }

  const handleReject = async (vendorId: string) => {
    if (!confirm('Are you sure you want to reject this vendor?')) return

    setActionLoading(vendorId)

    const res = await fetch(`/api/admin/vendors/${vendorId}/reject`, {
      method: 'POST'
    })

    if (res.ok) {
      // Optimistic update
      setVendors(prev => prev.map(v =>
        v.id === vendorId ? { ...v, status: 'rejected' } : v
      ))
      // Refresh server data
      router.refresh()
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to reject vendor')
    }

    setActionLoading(null)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      exportToCSV(vendors, `${vertical}_vendors`, [
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
        { key: 'user_email', header: 'Email' },
        {
          key: 'profile_data',
          header: 'Phone',
          getValue: (row) => row.profile_data?.phone || ''
        },
        {
          key: 'profile_data',
          header: 'Type',
          getValue: (row) => {
            const vt = row.profile_data?.vendor_type
            return Array.isArray(vt) ? vt.join(', ') : vt || ''
          }
        },
        { key: 'status', header: 'Status' },
        {
          key: 'tier',
          header: 'Tier',
          getValue: (row) => row.tier || 'standard'
        },
        {
          key: 'markets',
          header: 'Markets',
          getValue: (row) => row.markets.map(m => m.markets?.name || 'Unknown').join('; ')
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
    setTier('')
    router.push(`/${vertical}/admin/vendors`)
  }

  const hasFilters = searchInput || status || tier

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
    <div style={{
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.lg,
      boxShadow: shadows.sm
    }}>
      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: spacing.sm,
        marginBottom: spacing.md,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <input
          type="text"
          placeholder="Search by business name or email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ ...inputStyle, minWidth: 200, flex: 1 }}
        />

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
      {vendors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: spacing.xl, color: colors.textSecondary }}>
          <p style={{ margin: 0 }}>No vendors match your filters.</p>
          {hasFilters && (
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
                <th style={thStyle}>Business Name</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Markets</th>
                <th style={thStyle}>Tier</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => {
                const isStale = vendor.days_pending >= 2 &&
                  (vendor.status === 'submitted' || vendor.status === 'draft')
                const isExpanded = expandedVendor === vendor.id
                const verification = verifications[vendor.id] || null

                return (
                  <VendorRow
                    key={vendor.id}
                    vendor={vendor}
                    vertical={vertical}
                    isStale={isStale}
                    isExpanded={isExpanded}
                    verification={verification}
                    actionLoading={actionLoading}
                    onToggleExpand={() => setExpandedVendor(isExpanded ? null : vendor.id)}
                    onApprove={() => handleApprove(vendor.id)}
                    onReject={() => handleReject(vendor.id)}
                    onRefresh={() => router.refresh()}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalCount}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  )
}

/** Individual vendor row with expandable onboarding panel */
function VendorRow({
  vendor,
  vertical,
  isStale,
  isExpanded,
  verification,
  actionLoading,
  onToggleExpand,
  onApprove,
  onReject,
  onRefresh,
}: {
  vendor: Vendor
  vertical: string
  isStale: boolean
  isExpanded: boolean
  verification: Verification | null
  actionLoading: string | null
  onToggleExpand: () => void
  onApprove: () => void
  onReject: () => void
  onRefresh: () => void
}) {
  return (
    <>
      <tr style={{
        borderBottom: isExpanded ? 'none' : '1px solid #eee',
        backgroundColor: isStale ? '#fef3c7' : 'transparent'
      }}>
        <td style={tdStyle}>
          <div style={{ fontWeight: 600, color: colors.textPrimary }}>
            {vendor.profile_data?.business_name || 'Unnamed'}
          </div>
          {vendor.profile_data?.legal_name && (
            <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
              {vendor.profile_data.legal_name}
            </div>
          )}
        </td>
        <td style={tdStyle}>
          <div style={{ color: colors.textPrimary }}>{vendor.user_email}</div>
          {vendor.profile_data?.phone && (
            <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
              {vendor.profile_data.phone}
            </div>
          )}
        </td>
        <td style={tdStyle}>
          {Array.isArray(vendor.profile_data?.vendor_type)
            ? vendor.profile_data.vendor_type.join(', ')
            : vendor.profile_data?.vendor_type || '\u2014'
          }
        </td>
        <td style={tdStyle}>
          {vendor.markets && vendor.markets.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {vendor.markets.slice(0, 2).map((m, idx) => (
                <span key={idx} style={{
                  fontSize: typography.sizes.xs,
                  color: colors.textPrimary,
                  backgroundColor: colors.primaryLight,
                  padding: '2px 8px',
                  borderRadius: radius.sm
                }}>
                  {m.markets?.name || 'Unknown'}
                </span>
              ))}
              {vendor.markets.length > 2 && (
                <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                  +{vendor.markets.length - 2} more
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>No markets</span>
          )}
        </td>
        <td style={tdStyle}>
          <span style={{
            display: 'inline-block',
            padding: `${spacing['3xs']} ${spacing['2xs']}`,
            borderRadius: radius.full,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
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
        <td style={tdStyle}>
          <span style={{
            display: 'inline-block',
            padding: `${spacing['3xs']} ${spacing['2xs']}`,
            borderRadius: radius.full,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.medium,
            backgroundColor:
              vendor.status === 'approved' ? '#dcfce7' :
              vendor.status === 'rejected' ? '#fee2e2' : '#fef3c7',
            color:
              vendor.status === 'approved' ? '#166534' :
              vendor.status === 'rejected' ? '#991b1b' : '#92400e'
          }}>
            {(vendor.status === 'submitted' || vendor.status === 'draft') ? 'pending' : vendor.status}
          </span>
        </td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: spacing.xs, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Link
              href={`/${vertical}/vendor/${vendor.id}/profile`}
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

            <button
              onClick={onToggleExpand}
              style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                backgroundColor: isExpanded ? colors.textMuted : '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: radius.sm,
                cursor: 'pointer'
              }}
            >
              {isExpanded ? 'Close' : 'Onboarding'}
            </button>

            {(vendor.status === 'submitted' || vendor.status === 'draft') && (
              <>
                <button
                  onClick={onApprove}
                  disabled={actionLoading === vendor.id}
                  style={{
                    padding: `${spacing['3xs']} ${spacing.xs}`,
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    backgroundColor: actionLoading === vendor.id ? '#ccc' : colors.primary,
                    color: 'white',
                    border: 'none',
                    borderRadius: radius.sm,
                    cursor: actionLoading === vendor.id ? 'not-allowed' : 'pointer'
                  }}
                >
                  {actionLoading === vendor.id ? '...' : 'Approve'}
                </button>
                <button
                  onClick={onReject}
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

            {vendor.status === 'rejected' && (
              <button
                onClick={onApprove}
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

      {/* Expandable onboarding panel */}
      {isExpanded && (
        <tr>
          <td colSpan={7} style={{
            padding: `0 ${spacing.sm} ${spacing.sm}`,
            borderBottom: '1px solid #eee',
            backgroundColor: colors.surfaceMuted,
          }}>
            <div style={{ padding: spacing.sm }}>
              <VendorVerificationPanel
                vendorId={vendor.id}
                verification={verification}
                onRefresh={onRefresh}
                vertical={vertical}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const thStyle = {
  textAlign: 'left' as const,
  padding: spacing.sm,
  color: colors.textSecondary,
  fontWeight: typography.weights.semibold,
  fontSize: typography.sizes.sm
}

const tdStyle = {
  padding: spacing.sm,
  fontSize: typography.sizes.sm,
  color: colors.textPrimary
}
