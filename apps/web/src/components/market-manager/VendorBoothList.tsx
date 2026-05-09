'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface Vendor {
  market_vendor_id: string
  vendor_profile_id: string
  business_name: string
  booth_number: string | null
  approved: boolean
  response_status: string | null
  vendor_status: string | null
  on_platform: true
}

interface VendorBoothListProps {
  marketId: string
}

/**
 * Manager-side list of vendors at a market with inline booth-number
 * editing. Each row: business name, status badge, booth_number input,
 * Save button. Save is per-row (no bulk batch in v1) — keeps the UX
 * simple and the failure modes obvious.
 *
 * Read-only fields: name, status. Editable: booth_number.
 *
 * Calls:
 *  - GET  /api/market-manager/[marketId]/vendors           on mount
 *  - PATCH /api/market-manager/[marketId]/vendor-booth     per row save
 */
export default function VendorBoothList({ marketId }: VendorBoothListProps) {
  const [vendors, setVendors] = useState<Vendor[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Per-row state: edited booth value + save status + per-row error
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [rowSuccess, setRowSuccess] = useState<Record<string, boolean>>({})

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {vendors.map((v) => {
        const isSaving = savingId === v.vendor_profile_id
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
              <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, color: colors.textPrimary }}>
                {v.business_name}
              </div>
              <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap' }}>
                <span>{v.approved ? '✅ Approved' : '⏳ Pending approval'}</span>
                {v.response_status && <span>· {v.response_status.replace(/_/g, ' ')}</span>}
              </div>
            </div>

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
            </div>

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
      })}
    </div>
  )
}
