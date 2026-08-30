'use client'

/**
 * Users admin table — the ONE implementation behind /admin/users and
 * /[vertical]/admin/users (admin UI rebuild phase 3, first merge, owner
 * 2026-08-30). Superset of the two former copies (capability inventory in
 * .claude/admin_ui_redesign_research.md):
 *   from the platform copy — Verticals column + vertical filter (all-scope
 *   only), buyer-tier expiry, 'pending' vendor-status semantics
 *   (submitted+draft), multi-profile vendor chips;
 *   from the vertical copy — "Vendor →" drill-in links, correct 'submitted'
 *   handling, scoped CSV columns.
 * Per-vertical tier options come from the scope (FT: pro/boss · FM:
 * standard/premium/featured · all: union) — the old platform copy showed FT
 * tiers to FM data.
 *
 * `scope === null` means all verticals (platform view).
 */

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useDebounce } from '@/lib/hooks/useDebounce'
import Pagination from '@/components/admin/Pagination'
import AdminMobileRow from '@/components/admin/AdminMobileRow'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { exportToCSV, formatDateForExport } from '@/lib/export-csv'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

export interface AdminVendorProfile {
  id: string
  status: string
  vertical_id: string
  tier?: string | null
}

export interface AdminUserRow {
  id: string
  user_id: string
  email: string | null
  display_name: string | null
  role: string | null
  roles: string[] | null
  verticals: string[] | null
  buyer_tier: string | null
  buyer_tier_expires_at: string | null
  deleted_at: string | null
  created_at: string
  vendor_profiles: AdminVendorProfile[] | null
}

interface UsersAdminTableProps {
  users: AdminUserRow[]
  /** null = all verticals (platform). */
  scope: string | null
  /** For the vertical filter dropdown (all-scope only). */
  verticals: string[]
  basePath: string
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

const FT_TIERS = ['free', 'basic', 'pro', 'boss']
const FM_TIERS = ['free', 'standard', 'premium', 'featured']

function tierOptions(scope: string | null): string[] {
  if (scope === 'food_trucks') return FT_TIERS
  if (scope === 'farmers_market') return FM_TIERS
  return [...new Set([...FT_TIERS, ...FM_TIERS])]
}

function roleInfo(user: AdminUserRow): { label: string; isAdmin: boolean; isVendor: boolean } {
  const parts: string[] = []
  const isAdmin = user.role === 'admin' || user.role === 'platform_admin' ||
    !!user.roles?.includes('admin') || !!user.roles?.includes('platform_admin')
  if (isAdmin) parts.push('admin')
  const isVendor = !!user.vendor_profiles && user.vendor_profiles.length > 0
  if (isVendor) parts.push('vendor')
  if (!isAdmin && (user.roles?.includes('buyer') || parts.length === 0)) parts.push('buyer')
  return { label: parts.join(', '), isAdmin, isVendor }
}

function RoleChip({ user }: { user: AdminUserRow }) {
  const info = roleInfo(user)
  return (
    <span style={{
      padding: `${spacing['3xs']} ${spacing['2xs']}`,
      backgroundColor: info.isAdmin ? '#e0e7ff' : info.isVendor ? '#dbeafe' : '#f3f4f6',
      color: info.isAdmin ? '#3730a3' : info.isVendor ? '#1e40af' : '#666',
      borderRadius: radius.sm,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
    }}>
      {info.label}
    </span>
  )
}

export default function UsersAdminTable({
  users, scope, verticals, basePath,
  totalCount, currentPage, pageSize, totalPages, initialFilters,
}: UsersAdminTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(initialFilters.search)
  const [role, setRole] = useState(initialFilters.role)
  const [vertical, setVertical] = useState(initialFilters.vertical)
  const [vendorStatus, setVendorStatus] = useState(initialFilters.vendorStatus)
  const [vendorTier, setVendorTier] = useState(initialFilters.vendorTier)
  const [buyerTier, setBuyerTier] = useState(initialFilters.buyerTier)
  const [exporting, setExporting] = useState(false)
  const [suspendTarget, setSuspendTarget] = useState<{ userId: string; name: string; action: 'suspend' | 'reactivate' } | null>(null)
  const [suspending, setSuspending] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const relevantProfiles = (user: AdminUserRow): AdminVendorProfile[] =>
    (user.vendor_profiles || []).filter(vp => !scope || vp.vertical_id === scope)

  const handleSuspendAction = async () => {
    if (!suspendTarget) return
    setSuspending(true)
    try {
      const res = await fetch(`/api/admin/users/${suspendTarget.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: suspendTarget.action }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json()
        setToast({ message: data.error || 'Something went wrong — the change was not saved. Please try again.', type: 'error' })
      }
    } catch {
      setToast({ message: 'Network error — the change was not saved. Check your connection and try again.', type: 'error' })
    }
    setSuspending(false)
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
      exportToCSV(users, scope ? `${scope}_users` : 'all_users', [
        { key: 'email', header: 'Email' },
        { key: 'display_name', header: 'Display Name' },
        { key: 'roles', header: 'Roles', getValue: (row) => row.roles?.join(', ') || 'buyer' },
        { key: 'verticals', header: 'Verticals', getValue: (row) => row.verticals?.join(', ') || '' },
        { key: 'buyer_tier', header: 'Buyer Tier' },
        {
          key: 'vendor_profiles', header: 'Vendor Status',
          getValue: (row) => relevantProfiles(row).map(vp => scope ? vp.status : `${vp.vertical_id}:${vp.status}`).join('; '),
        },
        {
          key: 'vendor_profiles', header: 'Vendor Tier',
          getValue: (row) => relevantProfiles(row).map(vp => scope ? (vp.tier || 'free') : `${vp.vertical_id}:${vp.tier || 'free'}`).join('; '),
        },
        { key: 'created_at', header: 'Created', getValue: (row) => formatDateForExport(row.created_at) },
      ])
    } finally {
      setExporting(false)
    }
  }

  const clearFilters = () => {
    setSearchInput(''); setRole(''); setVertical(''); setVendorStatus(''); setVendorTier(''); setBuyerTier('')
    router.push(basePath)
  }
  const hasFilters = searchInput || role || vertical || vendorStatus || vendorTier || buyerTier

  const inputStyle = { padding: spacing['2xs'], border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }
  const selectStyle = { ...inputStyle, minWidth: 120, backgroundColor: 'white' }
  const suspendButtonStyle = (suspended: boolean) => ({
    padding: `${spacing['3xs']} ${spacing.xs}`,
    backgroundColor: 'white',
    color: suspended ? '#166534' : '#991b1b',
    border: `1px solid ${suspended ? '#86efac' : '#fca5a5'}`,
    borderRadius: radius.sm,
    fontSize: typography.sizes.xs,
    cursor: 'pointer',
  })

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap', alignItems: 'center', padding: spacing.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.md }}>
        <input
          type="text"
          placeholder="Search by email or name..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ ...inputStyle, minWidth: 200, flex: 1 }}
        />
        {!scope && (
          <select value={vertical} onChange={(e) => { setVertical(e.target.value); updateFilters({ vertical: e.target.value }) }} style={selectStyle}>
            <option value="">All Verticals</option>
            {verticals.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        <select value={role} onChange={(e) => { setRole(e.target.value); updateFilters({ role: e.target.value }) }} style={selectStyle}>
          <option value="">All Roles</option>
          <option value="buyer">Buyer</option>
          <option value="vendor">Vendor</option>
          <option value="admin">Admin</option>
        </select>
        <select value={vendorStatus} onChange={(e) => { setVendorStatus(e.target.value); updateFilters({ vendorStatus: e.target.value }) }} style={selectStyle}>
          <option value="">Vendor Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={vendorTier} onChange={(e) => { setVendorTier(e.target.value); updateFilters({ vendorTier: e.target.value }) }} style={selectStyle}>
          <option value="">Vendor Tier</option>
          {tierOptions(scope).map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <select value={buyerTier} onChange={(e) => { setBuyerTier(e.target.value); updateFilters({ buyerTier: e.target.value }) }} style={selectStyle}>
          <option value="">Buyer Tier</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
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

      {/* Table (desktop) */}
      <div style={{ backgroundColor: 'white', borderRadius: radius.md, boxShadow: shadows.sm }}>
        <div className="admin-list-table">
          <div className="admin-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: colors.surfaceMuted }}>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Role</th>
                  {!scope && <th style={thStyle}>Verticals</th>}
                  <th style={thStyle}>Buyer Tier</th>
                  <th style={thStyle}>Vendor Status</th>
                  <th style={thStyle}>Vendor Tier</th>
                  <th style={thStyle}>Joined</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={scope ? 8 : 9} style={{ padding: spacing.lg, textAlign: 'center', color: colors.textMuted }}>
                      No users found matching your filters
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const profiles = relevantProfiles(user)
                    return (
                      <tr key={user.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td style={tdStyle}>{user.email || '-'}</td>
                        <td style={tdStyle}>{user.display_name || '-'}</td>
                        <td style={tdStyle}><RoleChip user={user} /></td>
                        {!scope && (
                          <td style={tdStyle}>
                            {user.verticals && user.verticals.length > 0 ? (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {user.verticals.map(v => (
                                  <span key={v} style={{ padding: `${spacing['3xs']} ${spacing['2xs']}`, backgroundColor: '#f3f4f6', borderRadius: radius.sm, fontSize: typography.sizes.xs }}>{v}</span>
                                ))}
                              </div>
                            ) : '-'}
                          </td>
                        )}
                        <td style={tdStyle}>
                          <span style={{ padding: `${spacing['3xs']} ${spacing['2xs']}`, backgroundColor: user.buyer_tier === 'premium' ? '#fef3c7' : '#f3f4f6', color: user.buyer_tier === 'premium' ? '#92400e' : '#6b7280', borderRadius: radius.sm, fontSize: typography.sizes.xs }}>
                            {user.buyer_tier || 'free'}
                          </span>
                          {user.buyer_tier === 'premium' && user.buyer_tier_expires_at && (
                            <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                              exp: {new Date(user.buyer_tier_expires_at).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {profiles.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {profiles.map(vp => (
                                <span key={vp.id} style={{
                                  padding: `${spacing['3xs']} ${spacing['2xs']}`,
                                  backgroundColor: vp.status === 'approved' ? '#dcfce7' : vp.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                                  color: vp.status === 'approved' ? '#166534' : vp.status === 'rejected' ? '#991b1b' : '#92400e',
                                  borderRadius: radius.sm, fontSize: typography.sizes.xs, display: 'inline-block',
                                }}>
                                  {scope ? vp.status : `${vp.vertical_id}: ${vp.status}`}
                                </span>
                              ))}
                            </div>
                          ) : '-'}
                        </td>
                        <td style={tdStyle}>
                          {profiles.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {profiles.map(vp => (
                                <span key={vp.id} style={{ padding: `${spacing['3xs']} ${spacing['2xs']}`, backgroundColor: '#f3f4f6', borderRadius: radius.sm, fontSize: typography.sizes.xs, display: 'inline-block' }}>
                                  {vp.tier || 'free'}
                                </span>
                              ))}
                            </div>
                          ) : '-'}
                        </td>
                        <td style={tdStyle}>{new Date(user.created_at).toLocaleDateString()}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {profiles.map(vp => (
                              <Link
                                key={vp.id}
                                href={`/${vp.vertical_id}/admin/vendors/${vp.id}`}
                                style={{ padding: `${spacing['3xs']} ${spacing.xs}`, color: colors.primary, textDecoration: 'none', fontSize: typography.sizes.xs }}
                              >
                                {scope ? 'Vendor →' : `${vp.vertical_id} →`}
                              </Link>
                            ))}
                            <button
                              onClick={() => setSuspendTarget({ userId: user.user_id, name: user.display_name || user.email || 'User', action: user.deleted_at ? 'reactivate' : 'suspend' })}
                              style={suspendButtonStyle(!!user.deleted_at)}
                            >
                              {user.deleted_at ? 'Reactivate' : 'Suspend'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile rows */}
        <div className="admin-list-mobile">
          {users.length === 0 ? (
            <div className="admin-mobile-empty">No users found matching your filters</div>
          ) : (
            users.map((user) => {
              const title = user.display_name || user.email || 'User'
              const isSuspended = !!user.deleted_at
              const profiles = relevantProfiles(user)
              const verticalsLabel = !scope && user.verticals && user.verticals.length > 0 ? user.verticals.join(', ') : null
              return (
                <AdminMobileRow
                  key={user.id}
                  title={title}
                  statusBadge={<RoleChip user={user} />}
                  rightAction={
                    <button
                      onClick={() => setSuspendTarget({ userId: user.user_id, name: title, action: isSuspended ? 'reactivate' : 'suspend' })}
                      style={{ ...suspendButtonStyle(isSuspended), minHeight: 36, whiteSpace: 'nowrap', fontWeight: typography.weights.semibold }}
                    >
                      {isSuspended ? 'Reactivate' : 'Suspend'}
                    </button>
                  }
                  secondary={
                    <>
                      {user.email}
                      {verticalsLabel && <> · {verticalsLabel}</>}
                      {scope && profiles[0] && <> · vendor: {profiles[0].status}{profiles[0].tier ? ` (${profiles[0].tier})` : ''}</>}
                      {user.buyer_tier === 'premium' && <> · <span style={{ color: '#92400e', fontWeight: 600 }}>premium</span></>}
                      {' · '}
                      Joined {new Date(user.created_at).toLocaleDateString()}
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

      <ConfirmDialog
        open={!!suspendTarget}
        title={suspendTarget?.action === 'suspend' ? 'Suspend User Account' : 'Reactivate User Account'}
        message={
          suspendTarget?.action === 'suspend'
            ? `Suspend "${suspendTarget.name}"? They will be unable to log in or use the platform. Any vendor profiles will also be suspended.`
            : `Reactivate "${suspendTarget?.name}"? They will be able to log in again. Vendor profiles will need to be reactivated separately.`
        }
        confirmLabel={suspending ? 'Processing...' : suspendTarget?.action === 'suspend' ? 'Suspend' : 'Reactivate'}
        cancelLabel="Cancel"
        variant={suspendTarget?.action === 'suspend' ? 'danger' : 'default'}
        onConfirm={handleSuspendAction}
        onCancel={() => setSuspendTarget(null)}
      />

      {toast && (
        <div
          onClick={() => setToast(null)}
          style={{ position: 'fixed', bottom: 20, right: 20, padding: `${spacing.xs} ${spacing.md}`, backgroundColor: toast.type === 'success' ? '#d1fae5' : '#fee2e2', border: `1px solid ${toast.type === 'success' ? '#10b981' : '#ef4444'}`, borderRadius: radius.md, color: toast.type === 'success' ? '#065f46' : '#991b1b', fontSize: typography.sizes.sm, zIndex: 1000, boxShadow: shadows.lg, cursor: 'pointer' }}
        >
          {toast.message}
        </div>
      )}
    </>
  )
}

const thStyle = {
  padding: spacing.sm,
  textAlign: 'left' as const,
  fontWeight: typography.weights.semibold,
  fontSize: typography.sizes.sm,
  color: colors.textSecondary,
  borderBottom: `2px solid ${colors.border}`,
}
const tdStyle = {
  padding: spacing.sm,
  fontSize: typography.sizes.sm,
  color: colors.textPrimary,
}
