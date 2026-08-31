'use client'

/**
 * Listings admin table — the ONE implementation behind /admin/listings and
 * /[vertical]/admin/listings (admin UI rebuild phase 3, merge 2/11, owner
 * 2026-08-30). Superset of the two former ListingsTableClient copies
 * (capability inventory in .claude/admin_ui_redesign_research.md):
 *   from the platform copy — vertical chip + vertical filter (all-scope
 *   only), Vertical CSV column, created date;
 *   from the vertical copy — scoped CSV filename.
 *   (Tier chips deliberately dropped from rows — owner 2026-08-30.)
 * One row-list layout at ALL widths (owner, users-merge round 2: no wide
 * table, no sideways scrolling). The table-only columns — created date,
 * vertical, View link — live in each row's secondary line so the single
 * layout stays a superset. Moderation (suspend with reason / unsuspend via
 * PATCH /api/admin/listings/[id]) kept, with the same ConfirmDialogs.
 *
 * `scope === null` means all verticals (platform view).
 */

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDebounce } from '@/lib/hooks/useDebounce'
import Pagination from '@/components/admin/Pagination'
import AdminMobileRow from '@/components/admin/AdminMobileRow'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { exportToCSV, formatDateForExport, formatCentsForExport } from '@/lib/export-csv'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

export interface AdminListingRow {
  id: string
  title: string
  status: string
  price_cents: number
  quantity: number | null
  category: string | null
  vertical_id: string
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

interface ListingsAdminTableProps {
  listings: AdminListingRow[]
  /** null = all verticals (platform). */
  scope: string | null
  /** For the vertical filter dropdown (all-scope only). id = text slug. */
  verticals: Array<{ id: string; label: string }>
  categories: string[]
  basePath: string
  totalCount: number
  currentPage: number
  pageSize: number
  totalPages: number
  initialFilters: {
    search: string
    status: string
    vertical: string
    category: string
  }
}

function ListingStatusChip({ status }: { status: string }) {
  return (
    <span style={{
      padding: `${spacing['3xs']} ${spacing['2xs']}`,
      borderRadius: radius.sm,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      backgroundColor:
        status === 'published' ? '#dcfce7' :
        status === 'draft' ? '#fef3c7' : '#f3f4f6',
      color:
        status === 'published' ? '#166534' :
        status === 'draft' ? '#92400e' : '#6b7280',
    }}>
      {status}
    </span>
  )
}

export default function ListingsAdminTable({
  listings, scope, verticals, categories, basePath,
  totalCount, currentPage, pageSize, totalPages, initialFilters,
}: ListingsAdminTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [searchInput, setSearchInput] = useState(initialFilters.search)
  const [status, setStatus] = useState(initialFilters.status)
  const [vertical, setVertical] = useState(initialFilters.vertical)
  const [category, setCategory] = useState(initialFilters.category)
  const [exporting, setExporting] = useState(false)
  const [moderating, setModerating] = useState<string | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; title: string; action: 'suspend' | 'unsuspend' } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const handleModerate = async (reason?: string) => {
    if (!suspendTarget) return
    setModerating(suspendTarget.id)
    try {
      const res = await fetch(`/api/admin/listings/${suspendTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: suspendTarget.action, reason: reason?.trim() || undefined }),
      })
      if (res.ok) {
        setToast({ message: `Listing ${suspendTarget.action === 'suspend' ? 'suspended' : 'unsuspended'}`, type: 'success' })
        router.refresh()
      } else {
        const data = await res.json()
        setToast({ message: data.error || 'Failed', type: 'error' })
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' })
    }
    setModerating(null)
    setSuspendTarget(null)
  }

  const debouncedSearch = useDebounce(searchInput, 300)
  const updateFilters = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', '1')
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    router.push(`${basePath}?${params.toString()}`)
  }, [router, basePath, searchParams])
  if (debouncedSearch !== initialFilters.search) {
    updateFilters({ search: debouncedSearch })
  }

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    router.push(`${basePath}?${params.toString()}`)
  }
  const handlePageSizeChange = (size: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('limit', String(size))
    params.set('page', '1')
    router.push(`${basePath}?${params.toString()}`)
  }

  const handleExport = () => {
    setExporting(true)
    try {
      // Matches exportToCSV's inline column shape (it exports no named type).
      const columns: { key: keyof AdminListingRow | string; header: string; getValue?: (row: AdminListingRow) => string | number }[] = [
        { key: 'title', header: 'Title' },
        {
          key: 'vendor_profiles', header: 'Vendor',
          getValue: (row) => row.vendor_profiles?.profile_data?.business_name ||
                            row.vendor_profiles?.profile_data?.farm_name || '',
        },
        { key: 'category', header: 'Category' },
        ...(scope ? [] : [{ key: 'vertical_id' as const, header: 'Vertical' }]),
        { key: 'price_cents', header: 'Price', getValue: (row) => formatCentsForExport(row.price_cents) },
        { key: 'status', header: 'Status' },
        { key: 'created_at', header: 'Created', getValue: (row) => formatDateForExport(row.created_at) },
      ]
      exportToCSV(listings, scope ? `${scope}_listings` : 'listings', columns)
    } finally {
      setExporting(false)
    }
  }

  const clearFilters = () => {
    setSearchInput(''); setStatus(''); setVertical(''); setCategory('')
    router.push(basePath)
  }
  const hasFilters = searchInput || status || vertical || category

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

  const inputStyle = { padding: spacing['2xs'], border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }
  const selectStyle = { ...inputStyle, minWidth: 120, backgroundColor: 'white' }
  const moderateButtonStyle = (unsuspend: boolean, busy: boolean) => ({
    padding: '6px 10px',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    backgroundColor: 'white',
    color: unsuspend ? '#166534' : '#991b1b',
    border: `1px solid ${unsuspend ? '#86efac' : '#fca5a5'}`,
    borderRadius: radius.sm,
    cursor: busy ? 'not-allowed' : 'pointer',
    minHeight: 36,
    whiteSpace: 'nowrap' as const,
  })

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap', alignItems: 'center', padding: spacing.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.md }}>
        <input
          type="text"
          placeholder="Search by title or vendor..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ ...inputStyle, minWidth: 200, flex: 1 }}
        />
        {!scope && (
          <select value={vertical} onChange={(e) => { setVertical(e.target.value); updateFilters({ vertical: e.target.value }) }} style={selectStyle}>
            <option value="">All Verticals</option>
            {verticals.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        )}
        <select value={status} onChange={(e) => { setStatus(e.target.value); updateFilters({ status: e.target.value }) }} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="paused">Paused (suspended)</option>
          <option value="archived">Archived</option>
        </select>
        <select value={category} onChange={(e) => { setCategory(e.target.value); updateFilters({ category: e.target.value }) }} style={selectStyle}>
          <option value="">All Categories</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} style={{ padding: `${spacing['2xs']} ${spacing.xs}`, backgroundColor: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: 'pointer', fontSize: typography.sizes.sm }}>
            Clear
          </button>
        )}
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{ padding: `${spacing['2xs']} ${spacing.xs}`, backgroundColor: colors.primary, color: 'white', border: 'none', borderRadius: radius.sm, cursor: exporting ? 'not-allowed' : 'pointer', fontSize: typography.sizes.sm, fontWeight: typography.weights.medium }}
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Row list — one layout at every width (owner, users-merge round 2). */}
      <div style={{ backgroundColor: 'white', borderRadius: radius.md, boxShadow: shadows.sm }}>
        <div>
          {listings.length === 0 ? (
            <div className="admin-mobile-empty">No listings found matching your filters</div>
          ) : (
            listings.map((listing) => {
              const vendorName = listing.vendor_profiles?.profile_data?.business_name ||
                                listing.vendor_profiles?.profile_data?.farm_name || 'Unknown'
              const isPublished = listing.status === 'published'
              const isPaused = listing.status === 'paused'
              const outOfStock = isPublished && listing.quantity !== null && listing.quantity === 0
              const lowStock = isPublished && listing.quantity !== null && listing.quantity > 0 && listing.quantity <= 5

              const action = isPublished ? (
                <button
                  onClick={() => setSuspendTarget({ id: listing.id, title: listing.title, action: 'suspend' })}
                  disabled={moderating === listing.id}
                  style={moderateButtonStyle(false, moderating === listing.id)}
                >
                  Suspend
                </button>
              ) : isPaused ? (
                <button
                  onClick={() => setSuspendTarget({ id: listing.id, title: listing.title, action: 'unsuspend' })}
                  disabled={moderating === listing.id}
                  style={moderateButtonStyle(true, moderating === listing.id)}
                >
                  Unsuspend
                </button>
              ) : null

              return (
                <AdminMobileRow
                  key={listing.id}
                  title={listing.title}
                  statusBadge={<ListingStatusChip status={listing.status} />}
                  rightAction={action}
                  secondary={
                    <>
                      {vendorName}
                      {/* Tier chip removed (owner 2026-08-30): tier belongs to
                          the vendor, not each listing row — it read as noise
                          here. Tier still shows on the vendors/users pages. */}
                      {' · '}
                      {listing.category || 'Uncategorized'}
                      {' · '}
                      {formatPrice(listing.price_cents)}
                      {!scope && <> · {listing.vertical_id}</>}
                      {' · '}
                      Created {new Date(listing.created_at).toLocaleDateString()}
                      {outOfStock && <> · <span style={{ color: '#991b1b', fontWeight: 600 }}>⚠️ Out of stock</span></>}
                      {lowStock && <> · <span style={{ color: '#9a3412', fontWeight: 600 }}>Low ({listing.quantity})</span></>}
                      {/* The removed desktop table was the only home of the
                          View link — kept here so the single layout stays a
                          superset. */}
                      {' · '}
                      <Link
                        href={`/${listing.vertical_id}/listing/${listing.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: colors.primary, textDecoration: 'none', fontWeight: 600 }}
                      >
                        View →
                      </Link>
                    </>
                  }
                />
              )
            })
          )}
        </div>

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

      {/* Toast */}
      {toast && (
        <div
          onClick={() => setToast(null)}
          style={{ position: 'fixed', bottom: 20, right: 20, padding: `${spacing.xs} ${spacing.md}`, backgroundColor: toast.type === 'success' ? '#d1fae5' : '#fee2e2', border: `1px solid ${toast.type === 'success' ? '#10b981' : '#ef4444'}`, borderRadius: radius.md, color: toast.type === 'success' ? '#065f46' : '#991b1b', fontSize: typography.sizes.sm, zIndex: 1000, boxShadow: shadows.lg, cursor: 'pointer' }}
        >
          {toast.message}
        </div>
      )}

      {/* Suspend Confirmation */}
      <ConfirmDialog
        open={!!suspendTarget && suspendTarget.action === 'suspend'}
        title="Suspend Listing"
        message={`Suspend "${suspendTarget?.title}"? The vendor will be notified and the listing will be hidden from buyers.`}
        confirmLabel="Suspend"
        cancelLabel="Cancel"
        variant="danger"
        showInput
        inputLabel="Reason (visible to vendor)"
        inputPlaceholder="Why is this listing being suspended?"
        onConfirm={handleModerate}
        onCancel={() => setSuspendTarget(null)}
      />

      {/* Unsuspend Confirmation */}
      <ConfirmDialog
        open={!!suspendTarget && suspendTarget.action === 'unsuspend'}
        title="Unsuspend Listing"
        message={`Republish "${suspendTarget?.title}"? This will make it visible to buyers again.`}
        confirmLabel="Republish"
        cancelLabel="Cancel"
        onConfirm={() => handleModerate()}
        onCancel={() => setSuspendTarget(null)}
      />
    </>
  )
}
