'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useDebounce } from '@/lib/hooks/useDebounce'
import Pagination from '@/components/admin/Pagination'
import { exportToCSV, formatDateForExport, formatCentsForExport } from '@/lib/export-csv'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface Listing {
  id: string
  title: string
  status: string
  price_cents: number
  category: string | null
  created_at: string
  vendor_profiles: {
    id: string
    tier: string | null
    profile_data: {
      business_name?: string
      farm_name?: string
    } | null
  } | null
}

interface ListingsTableClientProps {
  vertical: string
  listings: Listing[]
  categories: string[]
  totalCount: number
  currentPage: number
  pageSize: number
  totalPages: number
  initialFilters: {
    search: string
    status: string
    category: string
  }
}

export default function ListingsTableClient({
  vertical,
  listings,
  categories,
  totalCount,
  currentPage,
  pageSize,
  totalPages,
  initialFilters
}: ListingsTableClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Local state for immediate UI feedback
  const [searchInput, setSearchInput] = useState(initialFilters.search)
  const [status, setStatus] = useState(initialFilters.status)
  const [category, setCategory] = useState(initialFilters.category)
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

    router.push(`/${vertical}/admin/listings?${params.toString()}`)
  }, [router, vertical, searchParams])

  // Effect to update URL when debounced search changes
  if (debouncedSearch !== initialFilters.search) {
    updateFilters({ search: debouncedSearch })
  }

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    router.push(`/${vertical}/admin/listings?${params.toString()}`)
  }

  const handlePageSizeChange = (size: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('limit', String(size))
    params.set('page', '1')
    router.push(`/${vertical}/admin/listings?${params.toString()}`)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      exportToCSV(listings, `${vertical}_listings`, [
        { key: 'title', header: 'Title' },
        {
          key: 'vendor_profiles',
          header: 'Vendor',
          getValue: (row) => row.vendor_profiles?.profile_data?.business_name ||
                            row.vendor_profiles?.profile_data?.farm_name || ''
        },
        { key: 'category', header: 'Category' },
        {
          key: 'price_cents',
          header: 'Price',
          getValue: (row) => formatCentsForExport(row.price_cents)
        },
        { key: 'status', header: 'Status' },
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
    setCategory('')
    router.push(`/${vertical}/admin/listings`)
  }

  const hasFilters = searchInput || status || category

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

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
          placeholder="Search listings or vendors..."
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
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>

        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            updateFilters({ category: e.target.value })
          }}
          style={selectStyle}
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
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
      {listings.length === 0 ? (
        <div style={{ padding: spacing.xl, textAlign: 'center', color: colors.textSecondary }}>
          <p style={{ margin: 0 }}>No listings match your filters.</p>
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
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: colors.surfaceSubtle }}>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Vendor</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Price</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => {
              const vendorName = listing.vendor_profiles?.profile_data?.business_name ||
                                listing.vendor_profiles?.profile_data?.farm_name || 'Unknown'
              const vendorTier = listing.vendor_profiles?.tier

              return (
                <tr key={listing.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                      {listing.title}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ color: colors.textPrimary }}>{vendorName}</div>
                    {vendorTier && vendorTier !== 'standard' && (
                      <span style={{
                        display: 'inline-block',
                        marginTop: spacing['3xs'],
                        padding: `${spacing['3xs']} ${spacing.xs}`,
                        backgroundColor: vendorTier === 'premium' ? '#dbeafe' : '#fef3c7',
                        color: vendorTier === 'premium' ? '#1e40af' : '#92400e',
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold
                      }}>
                        {vendorTier}
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: colors.textSecondary }}>
                    {listing.category || '—'}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: typography.weights.medium }}>
                    {formatPrice(listing.price_cents)}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      backgroundColor:
                        listing.status === 'published' ? '#dcfce7' :
                        listing.status === 'draft' ? '#fef3c7' : '#f3f4f6',
                      color:
                        listing.status === 'published' ? '#166534' :
                        listing.status === 'draft' ? '#92400e' : '#6b7280'
                    }}>
                      {listing.status}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <Link
                      href={`/${vertical}/listing/${listing.id}`}
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
            })}
          </tbody>
        </table>
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
