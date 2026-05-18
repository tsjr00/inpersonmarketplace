'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

interface Vendor {
  market_vendor_id: string
  vendor_profile_id: string
  business_name: string
  booth_number: string | null
  approved: boolean
  response_status: string | null
  vendor_status: string | null
  on_platform: true
  is_active_schedule: boolean
  has_info_sharing_consent: boolean
}

interface VendorBoothListProps {
  marketId: string
  /** When set, the component renders a "View docs" link for each vendor
   *  whose has_info_sharing_consent is true. The link points to
   *  /[vertical]/market-manager/[marketId]/vendor-docs/[vendorProfileId].
   *  Component-internal so the dashboard caller doesn't need to wire it. */
  vertical?: string
}

type FilterMode = 'active' | 'needs_booth' | 'pending_approval' | 'all'

/**
 * Manager-side list of vendors at a market with inline booth-number
 * editing and approve/revoke actions.
 *
 * Filter modes (toggle above the list):
 *   - active            — approved + has active schedule entry. Default
 *                         view; what managers care about day-to-day.
 *   - needs_booth       — subset of active where booth_number is null.
 *                         Quick "what still needs assignment" view.
 *   - pending_approval  — approved=false. Vendors who came in via the
 *                         co-branded signup link and need manager review,
 *                         or vendors whose approval was revoked.
 *   - all               — every vendor associated with this market.
 *
 * Per-row actions:
 *   - Pending vendors (approved=false) — show "Approve" button. Clicking
 *     PATCHes /api/market-manager/[marketId]/vendor-approval with
 *     approved=true. Booth controls are hidden until approval.
 *   - Approved vendors — show booth_number input + Save. Clicking PATCHes
 *     /api/market-manager/[marketId]/vendor-booth.
 *
 * Read-only fields: name, status. Editable: approved (via Approve button),
 * booth_number (after approval).
 *
 * Calls:
 *  - GET   /api/market-manager/[marketId]/vendors            on mount
 *  - PATCH /api/market-manager/[marketId]/vendor-booth       per row save
 *  - PATCH /api/market-manager/[marketId]/vendor-approval    per row approve
 */
export default function VendorBoothList({ marketId, vertical }: VendorBoothListProps) {
  const [vendors, setVendors] = useState<Vendor[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>('active')

  // Per-row state: edited booth value + save status + per-row error +
  // per-row approval-in-flight state.
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [rowSuccess, setRowSuccess] = useState<Record<string, boolean>>({})
  // Revoke flow: manager confirms before flipping approved=false (the API
  // supports both directions, but UI guards revoke behind a dialog because
  // it's the destructive side of the toggle).
  const [confirmingRevoke, setConfirmingRevoke] = useState<{
    vendorProfileId: string
    businessName: string
  } | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/market-manager/${marketId}/vendors`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setLoadError(data.error || 'Failed to load vendors')
          setVendors([])
          return
        }
        setVendors(data.vendors || [])
        const initial: Record<string, string> = {}
        for (const v of data.vendors || []) {
          initial[v.vendor_profile_id] = v.booth_number ?? ''
        }
        setEdits(initial)
      } catch {
        setLoadError('Network error loading vendors')
        setVendors([])
      }
    }
    load()
  }, [marketId])

  const handleSave = async (vendorProfileId: string) => {
    setSavingId(vendorProfileId)
    setRowError((s) => ({ ...s, [vendorProfileId]: '' }))
    setRowSuccess((s) => ({ ...s, [vendorProfileId]: false }))
    try {
      const res = await fetch(`/api/market-manager/${marketId}/vendor-booth`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_profile_id: vendorProfileId,
          booth_number: edits[vendorProfileId] ?? '',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError((s) => ({ ...s, [vendorProfileId]: data.error || 'Save failed' }))
      } else {
        setRowSuccess((s) => ({ ...s, [vendorProfileId]: true }))
        // Reflect server-normalized value back into the row
        setVendors((vs) =>
          (vs || []).map((v) =>
            v.vendor_profile_id === vendorProfileId
              ? { ...v, booth_number: data.booth_number ?? null }
              : v
          )
        )
        setTimeout(() => {
          setRowSuccess((s) => ({ ...s, [vendorProfileId]: false }))
        }, 1500)
      }
    } catch {
      setRowError((s) => ({ ...s, [vendorProfileId]: 'Network error' }))
    } finally {
      setSavingId(null)
    }
  }

  const requestRevoke = (vendorProfileId: string, businessName: string) => {
    setConfirmingRevoke({ vendorProfileId, businessName })
  }

  const performRevoke = async () => {
    if (!confirmingRevoke) return
    const { vendorProfileId } = confirmingRevoke
    setConfirmingRevoke(null)
    await handleApprove(vendorProfileId, false)
  }

  const handleApprove = async (vendorProfileId: string, nextApproved: boolean) => {
    setApprovingId(vendorProfileId)
    setRowError((s) => ({ ...s, [vendorProfileId]: '' }))
    setRowSuccess((s) => ({ ...s, [vendorProfileId]: false }))
    try {
      const res = await fetch(`/api/market-manager/${marketId}/vendor-approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_profile_id: vendorProfileId,
          approved: nextApproved,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError((s) => ({ ...s, [vendorProfileId]: data.error || 'Approval update failed' }))
      } else {
        setRowSuccess((s) => ({ ...s, [vendorProfileId]: true }))
        setVendors((vs) =>
          (vs || []).map((v) =>
            v.vendor_profile_id === vendorProfileId
              ? { ...v, approved: !!data.approved }
              : v
          )
        )
        setTimeout(() => {
          setRowSuccess((s) => ({ ...s, [vendorProfileId]: false }))
        }, 1500)
      }
    } catch {
      setRowError((s) => ({ ...s, [vendorProfileId]: 'Network error' }))
    } finally {
      setApprovingId(null)
    }
  }

  if (vendors === null) {
    return <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>Loading vendors…</div>
  }

  if (loadError) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#fee2e2',
        color: '#991b1b',
        borderRadius: radius.sm,
        fontSize: typography.sizes.sm,
      }}>
        {loadError}
      </div>
    )
  }

  if (vendors.length === 0) {
    return (
      <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
        No vendors are associated with this market yet.
      </p>
    )
  }

  // Filter computations
  const activeVendors = vendors.filter((v) => v.approved && v.is_active_schedule)
  const needsBoothVendors = activeVendors.filter((v) => !v.booth_number)
  const pendingApprovalVendors = vendors.filter((v) => !v.approved)
  const displayedVendors =
    filter === 'all' ? vendors :
    filter === 'needs_booth' ? needsBoothVendors :
    filter === 'pending_approval' ? pendingApprovalVendors :
    activeVendors

  const toggleButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: colors.primary,
    cursor: 'pointer',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    padding: 0,
    textDecoration: 'underline',
  }

  const activeChipStyle: React.CSSProperties = {
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    fontSize: typography.sizes.xs,
  }

  const renderFilterChip = (key: FilterMode, label: string, count: number) => {
    if (filter === key) {
      return <span style={activeChipStyle}>{label} ({count})</span>
    }
    return (
      <button onClick={() => setFilter(key)} style={toggleButtonStyle}>
        {label} ({count})
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {/* Filter toggle — 4 states */}
      <div style={{
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        display: 'flex',
        alignItems: 'center',
        gap: spacing['2xs'],
        flexWrap: 'wrap',
      }}>
        <span>Show:</span>
        {renderFilterChip('active', 'Active', activeVendors.length)}
        <span>·</span>
        {renderFilterChip('needs_booth', 'Needs booth #', needsBoothVendors.length)}
        <span>·</span>
        {renderFilterChip('pending_approval', 'Pending approval', pendingApprovalVendors.length)}
        <span>·</span>
        {renderFilterChip('all', 'All', vendors.length)}
      </div>

      <ConfirmDialog
        open={!!confirmingRevoke}
        title="Revoke approval?"
        message={`Revoke approval for ${confirmingRevoke?.businessName ?? ''}? Existing bookings stay on the books. The vendor moves to the "Pending approval" filter and won't show up in your action summary or active filter. You can re-approve them later.`}
        variant="danger"
        confirmLabel="Revoke"
        onConfirm={performRevoke}
        onCancel={() => setConfirmingRevoke(null)}
      />

      {/* Empty state when filter excludes everything */}
      {displayedVendors.length === 0 ? (
        <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm, padding: spacing.xs }}>
          {filter === 'needs_booth'
            ? `All ${activeVendors.length} active vendor${activeVendors.length === 1 ? ' has' : 's have'} a booth number assigned. ✓`
            : filter === 'pending_approval'
            ? 'No vendors pending approval. ✓'
            : filter === 'active'
            ? `No active vendors right now. ${vendors.length} pending or dormant vendor${vendors.length === 1 ? '' : 's'} — switch to "All" to see them.`
            : 'No vendors match the current filter.'}
        </p>
      ) : (
        displayedVendors.map((v) => {
          const isSaving = savingId === v.vendor_profile_id
          const isApproving = approvingId === v.vendor_profile_id
          const editedValue = edits[v.vendor_profile_id] ?? ''
          const dirty = editedValue !== (v.booth_number ?? '')
          return (
            <div
              key={v.vendor_profile_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
                padding: spacing.xs,
                backgroundColor: colors.surfaceBase,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, color: colors.textPrimary, display: 'flex', alignItems: 'baseline', gap: spacing['2xs'], flexWrap: 'wrap' }}>
                  <span>{v.business_name}</span>
                  {/* "View docs" link — only renders when the vendor has
                      authorized info-sharing for this market via the
                      State C info-sharing checkbox (A1, 2026-05-16). */}
                  {v.has_info_sharing_consent && vertical && (
                    <a
                      href={`/${vertical}/market-manager/${marketId}/vendor-docs/${v.vendor_profile_id}`}
                      style={{
                        fontSize: typography.sizes.xs,
                        color: colors.primary,
                        textDecoration: 'underline',
                        fontWeight: typography.weights.normal,
                      }}
                    >
                      View docs →
                    </a>
                  )}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap' }}>
                  <span>{v.approved ? '✅ Approved' : '⏳ Pending approval'}</span>
                  {v.response_status && <span>· {v.response_status.replace(/_/g, ' ')}</span>}
                  {!v.is_active_schedule && <span>· not scheduled</span>}
                  {!v.booth_number && v.approved && v.is_active_schedule && <span>· needs booth #</span>}
                </div>
              </div>

              {/* Pending vendors get an Approve button. Approved vendors get
                  booth controls. Keeps row UX focused on the next action. */}
              {!v.approved ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                  <button
                    onClick={() => handleApprove(v.vendor_profile_id, true)}
                    disabled={isApproving}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.sm}`,
                      backgroundColor: colors.primary,
                      color: 'white',
                      border: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      cursor: isApproving ? 'not-allowed' : 'pointer',
                      opacity: isApproving ? 0.6 : 1,
                    }}
                  >
                    {isApproving ? 'Approving…' : 'Approve'}
                  </button>
                  {rowSuccess[v.vendor_profile_id] && (
                    <span style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold }}>
                      ✓ Approved
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                  <input
                    type="text"
                    value={editedValue}
                    onChange={(e) => setEdits((s) => ({ ...s, [v.vendor_profile_id]: e.target.value }))}
                    placeholder="Booth #"
                    disabled={isSaving}
                    maxLength={50}
                    style={{
                      width: 110,
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.sm,
                    }}
                  />
                  <button
                    onClick={() => handleSave(v.vendor_profile_id)}
                    disabled={isSaving || !dirty}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.sm}`,
                      backgroundColor: dirty ? colors.primary : colors.surfaceMuted,
                      color: dirty ? 'white' : colors.textMuted,
                      border: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      cursor: isSaving || !dirty ? 'not-allowed' : 'pointer',
                      opacity: isSaving ? 0.6 : 1,
                    }}
                  >
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                  {rowSuccess[v.vendor_profile_id] && (
                    <span style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold }}>
                      ✓ Saved
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => requestRevoke(v.vendor_profile_id, v.business_name)}
                    disabled={isSaving || approvingId === v.vendor_profile_id}
                    title="Revoke approval (vendor moves to Pending Approval)"
                    style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: 'transparent',
                      color: colors.textMuted,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      cursor: (isSaving || approvingId === v.vendor_profile_id) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Revoke
                  </button>
                </div>
              )}

              {rowError[v.vendor_profile_id] && (
                <div style={{
                  width: '100%',
                  fontSize: typography.sizes.xs,
                  color: '#991b1b',
                  marginTop: spacing['3xs'],
                }}>
                  {rowError[v.vendor_profile_id]}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
