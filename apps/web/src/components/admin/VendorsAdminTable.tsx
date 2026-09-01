'use client'

/**
 * Vendors admin table — the ONE client behind /admin/vendors and
 * /[vertical]/admin/vendors (admin UI rebuild phase 4, owner 2026-08-31).
 * Superset of the two former clients:
 *   from the vertical copy — rich rows (listing count, markets, Stripe flag,
 *   event badge, days-pending stale highlight), INLINE Approve / Reject /
 *   Re-approve, and the expandable Onboarding panel
 *   (VendorVerificationPanel);
 *   from the platform copy — the vertical filter + chip (all-scope only),
 *   the Cancel% signal, and the 'suspended' status option.
 * One row-list at ALL widths (owner standard); per-vertical tier options
 * (FT: free/basic/pro/boss · FM: free/standard/premium/featured · all:
 * union) — each old copy hard-coded ONE vertical's tiers for every route.
 * Approve/Reject go through the same API routes as before (trial grant on
 * approve lives in the route).
 *
 * `scope === null` means all verticals (platform view).
 */

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDebounce } from '@/lib/hooks/useDebounce'
import Pagination from '@/components/admin/Pagination'
import VendorVerificationPanel from '@/components/admin/VendorVerificationPanel'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { exportToCSV, formatDateForExport } from '@/lib/export-csv'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { useStatusBanner } from '@/hooks/useStatusBanner'

export interface AdminVendorRow {
  id: string
  user_id: string
  vertical_id: string
  status: string
  tier: string | null
  event_approved: boolean
  created_at: string
  profile_data: {
    business_name?: string
    legal_name?: string
    farm_name?: string
    email?: string
    phone?: string
    vendor_type?: string | string[]
  } | null
  orders_confirmed_count: number
  orders_cancelled_after_confirm_count: number
  stripe_connected: boolean
  listing_count: number
  days_pending: number
  markets: Array<{ market_id: string; markets: { name: string } | null }>
}

export interface VendorVerificationInfo {
  status: string
  documents: Array<{ url: string; path: string; filename: string; type: string; uploaded_at: string }>
  notes: string | null
  reviewed_at: string | null
  requested_categories: string[]
  category_verifications: Record<string, {
    status: string
    doc_type?: string
    documents?: Array<{ url: string; path: string; filename: string; doc_type: string }>
    notes?: string
    reviewed_at?: string
  }>
  coi_status: string
  coi_documents: Array<{ url: string; path: string; filename: string; uploaded_at: string }>
  coi_verified_at: string | null
  prohibited_items_acknowledged_at: string | null
  onboarding_completed_at: string | null
}

interface VendorsAdminTableProps {
  vendors: AdminVendorRow[]
  verifications: Record<string, VendorVerificationInfo>
  /** null = all verticals (platform). */
  scope: string | null
  verticals: Array<{ id: string; label: string }>
  basePath: string
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

const FT_TIERS = ['free', 'basic', 'pro', 'boss']
const FM_TIERS = ['free', 'standard', 'premium', 'featured']

function tierOptions(scope: string | null): string[] {
  if (scope === 'food_trucks') return FT_TIERS
  if (scope === 'farmers_market') return FM_TIERS
  return [...new Set([...FT_TIERS, ...FM_TIERS])]
}

function VendorStatusChip({ status }: { status: string }) {
  const display = status === 'submitted' || status === 'draft' ? 'pending' : status
  return (
    <span style={{
      padding: `${spacing['3xs']} ${spacing['2xs']}`,
      borderRadius: radius.sm,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      backgroundColor:
        status === 'approved' ? '#dcfce7' :
        status === 'submitted' || status === 'draft' ? '#fef3c7' :
        status === 'rejected' || status === 'suspended' ? '#fee2e2' : '#f3f4f6',
      color:
        status === 'approved' ? '#166534' :
        status === 'submitted' || status === 'draft' ? '#92400e' :
        status === 'rejected' || status === 'suspended' ? '#991b1b' : '#6b7280',
    }}>
      {display}
    </span>
  )
}

export default function VendorsAdminTable({
  vendors: initialVendors, verifications, scope, verticals, basePath,
  totalCount, currentPage, pageSize, totalPages, initialFilters,
}: VendorsAdminTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [vendors, setVendors] = useState(initialVendors)
  const [searchInput, setSearchInput] = useState(initialFilters.search)
  const [status, setStatus] = useState(initialFilters.status)
  const [vertical, setVertical] = useState(initialFilters.vertical)
  const [tier, setTier] = useState(initialFilters.tier)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null)
  const { showBanner, StatusBanner } = useStatusBanner()
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'default' | 'danger'; onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: () => {} })

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

  const handleApprove = async (vendorId: string) => {
    setActionLoading(vendorId)
    const res = await fetch(`/api/admin/vendors/${vendorId}/approve`, { method: 'POST' })
    if (res.ok) {
      setVendors(prev => prev.map(v => v.id === vendorId ? { ...v, status: 'approved' } : v))
      router.refresh()
    } else {
      const data = await res.json()
      showBanner('error', data.error || 'Failed to approve vendor')
    }
    setActionLoading(null)
  }

  const handleReject = (vendorId: string) => {
    setConfirmDialog({
      open: true,
      title: 'Reject Vendor',
      message: 'Are you sure you want to reject this vendor?',
      confirmLabel: 'Reject',
      variant: 'danger',
      onConfirm: async () => {
        setActionLoading(vendorId)
        const res = await fetch(`/api/admin/vendors/${vendorId}/reject`, { method: 'POST' })
        if (res.ok) {
          setVendors(prev => prev.map(v => v.id === vendorId ? { ...v, status: 'rejected' } : v))
          router.refresh()
        } else {
          const data = await res.json()
          showBanner('error', data.error || 'Failed to reject vendor')
        }
        setActionLoading(null)
      },
    })
  }

  const handleExport = () => {
    setExporting(true)
    try {
      exportToCSV(vendors, scope ? `${scope}_vendors` : 'vendors', [
        { key: 'profile_data', header: 'Business Name', getValue: (row) => row.profile_data?.business_name || row.profile_data?.farm_name || '' },
        { key: 'profile_data', header: 'Legal Name', getValue: (row) => row.profile_data?.legal_name || '' },
        { key: 'profile_data', header: 'Email', getValue: (row) => row.profile_data?.email || '' },
        { key: 'profile_data', header: 'Phone', getValue: (row) => row.profile_data?.phone || '' },
        {
          key: 'profile_data', header: 'Type',
          getValue: (row) => {
            const vt = row.profile_data?.vendor_type
            return Array.isArray(vt) ? vt.join(', ') : vt || ''
          },
        },
        { key: 'vertical_id', header: 'Vertical' },
        { key: 'status', header: 'Status' },
        { key: 'tier', header: 'Tier', getValue: (row) => row.tier || 'free' },
        { key: 'markets', header: 'Markets', getValue: (row) => row.markets.map(m => m.markets?.name || 'Unknown').join('; ') },
        { key: 'created_at', header: 'Created', getValue: (row) => formatDateForExport(row.created_at) },
      ])
    } finally {
      setExporting(false)
    }
  }

  const clearFilters = () => {
    setSearchInput(''); setStatus(''); setVertical(''); setTier('')
    router.push(basePath)
  }
  const hasFilters = searchInput || status || vertical || tier

  const inputStyle = { padding: spacing['2xs'], border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }
  const selectStyle = { ...inputStyle, minWidth: 120, backgroundColor: 'white' }
  const smallButton = (bg: string, disabled: boolean) => ({
    padding: `${spacing['3xs']} ${spacing.xs}`,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    backgroundColor: disabled ? '#ccc' : bg,
    color: 'white',
    border: 'none',
    borderRadius: radius.sm,
    cursor: disabled ? 'not-allowed' : 'pointer',
    minHeight: 32,
    whiteSpace: 'nowrap' as const,
  })

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap', alignItems: 'center', padding: spacing.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.md }}>
        <input
          type="text"
          placeholder="Search by business name or email..."
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
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={tier} onChange={(e) => { setTier(e.target.value); updateFilters({ tier: e.target.value }) }} style={selectStyle}>
          <option value="">All Tiers</option>
          {tierOptions(scope).map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
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

      {/* Row list — one layout at every width (owner standard). */}
      <div style={{ backgroundColor: 'white', borderRadius: radius.md, boxShadow: shadows.sm }}>
        {vendors.length === 0 ? (
          <div className="admin-mobile-empty">No vendors found matching your filters</div>
        ) : (
          vendors.map((vendor) => {
            const profileData = vendor.profile_data
            const businessName = profileData?.business_name || profileData?.farm_name || profileData?.legal_name || 'Unknown'
            const isPending = vendor.status === 'submitted' || vendor.status === 'draft'
            const isStale = vendor.days_pending >= 2 && isPending
            const isExpanded = expandedVendor === vendor.id
            const verification = verifications[vendor.id] || null
            const detailHref = `/${vendor.vertical_id}/admin/vendors/${vendor.id}`
            const confirmed = vendor.orders_confirmed_count || 0
            const cancelled = vendor.orders_cancelled_after_confirm_count || 0
            const cancelRate = confirmed >= 10 ? Math.round((cancelled / confirmed) * 100) : null
            const marketCount = vendor.markets?.length || 0
            const busy = actionLoading === vendor.id

            return (
              <div key={vendor.id} style={{ borderBottom: `1px solid ${colors.border}`, backgroundColor: isStale ? '#fffbeb' : 'white' }}>
                <div style={{ padding: '12px 14px' }}>
                  {/* Line 1: name + status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>{businessName}</span>
                    <VendorStatusChip status={vendor.status} />
                    {vendor.event_approved && <span title="Event approved" style={{ fontSize: typography.sizes.xs }}>🎪</span>}
                  </div>
                  {/* Line 2: signals */}
                  <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5, marginTop: 4, wordBreak: 'break-word' }}>
                    {!scope && <>{vendor.vertical_id}{' · '}</>}
                    {(vendor.tier || 'free')}
                    {' · '}📦 {vendor.listing_count}
                    {' · '}{marketCount} market{marketCount !== 1 ? 's' : ''}
                    {!vendor.stripe_connected && <> · <span style={{ color: '#991b1b' }}>no Stripe</span></>}
                    {cancelRate !== null && (
                      <> · <span style={{ color: cancelRate >= 20 ? '#991b1b' : cancelRate >= 10 ? '#9a3412' : '#166534', fontWeight: 600 }}>{cancelRate}% cancel</span></>
                    )}
                    {isStale && <> · <span style={{ color: '#92400e', fontWeight: 600 }}>{vendor.days_pending}d pending</span></>}
                    {profileData?.email && <> · {profileData.email}</>}
                  </div>
                  {/* Line 3: actions */}
                  <div style={{ display: 'flex', gap: spacing.xs, marginTop: 8, flexWrap: 'wrap' }}>
                    <Link
                      href={detailHref}
                      style={{ ...smallButton(colors.primary, false), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                    >
                      Details
                    </Link>
                    <button onClick={() => setExpandedVendor(isExpanded ? null : vendor.id)} style={smallButton(isExpanded ? '#6b7280' : '#6366f1', false)}>
                      {isExpanded ? 'Close' : 'Onboarding'}
                    </button>
                    {isPending && (
                      <>
                        <button onClick={() => handleApprove(vendor.id)} disabled={busy} style={smallButton('#10b981', busy)}>
                          {busy ? '...' : 'Approve'}
                        </button>
                        <button onClick={() => handleReject(vendor.id)} disabled={busy} style={smallButton('#ef4444', busy)}>
                          Reject
                        </button>
                      </>
                    )}
                    {vendor.status === 'rejected' && (
                      <button onClick={() => handleApprove(vendor.id)} disabled={busy} style={smallButton('#3b82f6', busy)}>
                        Re-approve
                      </button>
                    )}
                  </div>
                </div>

                {/* Expandable onboarding panel */}
                {isExpanded && (
                  <div style={{ padding: `0 ${spacing.sm} ${spacing.sm}`, backgroundColor: colors.surfaceMuted }}>
                    <div style={{ padding: spacing.sm }}>
                      <VendorVerificationPanel
                        vendorId={vendor.id}
                        verification={verification}
                        onRefresh={() => router.refresh()}
                        vertical={vendor.vertical_id}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}

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

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, open: false })) }}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
      <StatusBanner />
    </>
  )
}
