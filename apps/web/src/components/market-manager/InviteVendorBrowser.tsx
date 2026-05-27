'use client'

import { useCallback, useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Manager-facing browser of nearby platform vendors with bulk invite (NEW-8).
 *
 * Rendered on the manager dashboard between InviteVendorLink and VendorBoothList.
 * Calls /api/vendors/nearby?lat=&lng=&radius=&vertical=&exclude_market=
 * so already-at-market vendors are filtered server-side.
 *
 * Bulk invite POSTs to /api/market-manager/[marketId]/vendor-invitations
 * with { vendor_profile_ids: string[] }. Server enforces:
 *   - Skip vendors already at market (paranoid double-check)
 *   - Skip non-eligible (non-approved status or wrong vertical)
 *   - 50-vendor batch cap
 *
 * On success, invited vendors disappear from the browse list (they now
 * have a market_vendors row at this market, so exclude_market hides them).
 *
 * Read-only preview: each vendor name links to /[vertical]/vendor/<id>/profile
 * — caller passes vertical so the link target is correct.
 */

interface NearbyVendor {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  averageRating: number | null
  ratingCount: number | null
  listingCount: number
  categories: string[]
  distance_miles: number | null
}

interface InviteVendorBrowserProps {
  marketId: string
  marketName: string
  marketLat: number | null
  marketLng: number | null
  vertical: string
}

const RADIUS_OPTIONS = [25, 50, 100] as const
const DEFAULT_RADIUS = 50

export default function InviteVendorBrowser({
  marketId,
  marketName,
  marketLat,
  marketLng,
  vertical,
}: InviteVendorBrowserProps) {
  const [vendors, setVendors] = useState<NearbyVendor[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [radiusMiles, setRadiusMiles] = useState<number>(DEFAULT_RADIUS)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [inviting, setInviting] = useState(false)
  const [inviteFlash, setInviteFlash] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (marketLat === null || marketLng === null) {
      setVendors([])
      setLoadError(
        'This market has no geocoded location yet. Set the market address to enable nearby-vendor search.'
      )
      return
    }
    setLoadError(null)
    try {
      const url = new URL('/api/vendors/nearby', window.location.origin)
      url.searchParams.set('lat', String(marketLat))
      url.searchParams.set('lng', String(marketLng))
      url.searchParams.set('radius', String(radiusMiles))
      url.searchParams.set('vertical', vertical)
      url.searchParams.set('exclude_market', marketId)
      // Higher limit than the default 35 since the manager wants to see
      // their pool. 200 is plenty for any single-market neighborhood.
      url.searchParams.set('limit', '200')
      const res = await fetch(url.toString())
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(data.error || 'Failed to load nearby vendors')
        setVendors([])
        return
      }
      setVendors((data.vendors as NearbyVendor[]) || [])
      // Reset selection when the underlying list changes (e.g., radius
      // change) — keeps the UI honest about what would be invited.
      setSelectedIds(new Set())
    } catch {
      setLoadError('Network error loading nearby vendors')
      setVendors([])
    }
  }, [marketLat, marketLng, marketId, radiusMiles, vertical])

  useEffect(() => {
    load()
  }, [load])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (!vendors) return
    if (selectedIds.size === vendors.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(vendors.map((v) => v.id)))
    }
  }

  const handleInvite = async () => {
    if (selectedIds.size === 0) return
    if (selectedIds.size > 50) {
      setInviteFlash('You can only invite 50 vendors at a time. Trim the selection and try again.')
      return
    }
    setInviting(true)
    setInviteFlash(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/vendor-invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_profile_ids: Array.from(selectedIds) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setInviteFlash(data.error || 'Failed to send invitations')
        return
      }
      const inv = (data.invited as number) ?? 0
      const skipped = (data.skipped as number) ?? 0
      let msg = `Sent ${inv} invitation${inv === 1 ? '' : 's'}.`
      if (skipped > 0) {
        msg += ` Skipped ${skipped} (already at market or not eligible).`
      }
      setInviteFlash(msg)
      setSelectedIds(new Set())
      await load()
    } catch {
      setInviteFlash('Network error sending invitations')
    } finally {
      setInviting(false)
    }
  }

  // Loading
  if (vendors === null) {
    return (
      <div style={cardStyle}>
        <h2 style={headingStyle}>Invite Vendors</h2>
        <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
          Loading nearby vendors…
        </div>
      </div>
    )
  }

  const allSelected = vendors.length > 0 && selectedIds.size === vendors.length

  return (
    <div style={cardStyle}>
      <h2 style={headingStyle}>Invite Vendors</h2>
      <p style={mutedTextStyle}>
        Browse on-platform vendors near <strong>{marketName}</strong> and invite
        them to join your market. They&apos;ll get an in-app notification and email
        with a link to your market profile. On accept they&apos;re auto-approved —
        no extra step on your side.
      </p>

      {/* Controls */}
      <div style={controlsRowStyle}>
        <div style={controlGroupStyle}>
          <label style={labelStyle}>
            Radius:&nbsp;
            <select
              value={radiusMiles}
              onChange={(e) => setRadiusMiles(parseInt(e.target.value, 10))}
              disabled={inviting}
              style={selectStyle}
            >
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r} miles
                </option>
              ))}
            </select>
          </label>
          {vendors.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={inviting}
              style={linkButtonStyle}
            >
              {allSelected ? 'Deselect all' : `Select all ${vendors.length}`}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleInvite}
          disabled={inviting || selectedIds.size === 0}
          style={{
            ...primaryButtonStyle,
            opacity: inviting || selectedIds.size === 0 ? 0.6 : 1,
            cursor: inviting || selectedIds.size === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {inviting ? 'Sending…' : `Invite Selected (${selectedIds.size})`}
        </button>
      </div>

      {inviteFlash && (
        <div
          style={
            inviteFlash.startsWith('Sent')
              ? successBoxStyle
              : errorBoxStyle
          }
        >
          {inviteFlash}
        </div>
      )}
      {loadError && <div style={errorBoxStyle}>{loadError}</div>}

      {/* List */}
      {vendors.length === 0 ? (
        <div style={mutedTextStyle}>
          {loadError ? '' : (
            <>No nearby vendors found within {radiusMiles} miles. Try a wider radius, or check back later as more vendors join the platform.</>
          )}
        </div>
      ) : (
        <ul style={listStyle}>
          {vendors.map((v) => {
            const selected = selectedIds.has(v.id)
            return (
              <li key={v.id}>
                <label style={{
                  ...vendorRowStyle,
                  backgroundColor: selected ? '#f0fdf4' : colors.surfaceBase,
                  borderColor: selected ? colors.primary : colors.border,
                }}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(v.id)}
                    disabled={inviting}
                    style={{ marginRight: spacing.xs, cursor: 'pointer' }}
                  />
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{
                      fontWeight: typography.weights.semibold,
                      fontSize: typography.sizes.sm,
                      color: colors.textPrimary,
                    }}>
                      <a
                        href={`/${vertical}/vendor/${v.id}/profile`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: colors.primary, textDecoration: 'underline' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {v.name}
                      </a>
                    </div>
                    <div style={{
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                    }}>
                      {v.distance_miles !== null && (
                        <>{v.distance_miles.toFixed(1)} mi · </>
                      )}
                      {v.listingCount} listing{v.listingCount === 1 ? '' : 's'}
                      {v.averageRating !== null && v.ratingCount && v.ratingCount > 0 && (
                        <> · ★ {v.averageRating.toFixed(1)} ({v.ratingCount})</>
                      )}
                      {v.categories.length > 0 && (
                        <> · {v.categories.slice(0, 3).join(', ')}</>
                      )}
                    </div>
                  </div>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  padding: spacing.md,
  backgroundColor: colors.surfaceElevated,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  marginBottom: spacing.md,
}

const headingStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: spacing.xs,
  fontSize: typography.sizes.lg,
  fontWeight: typography.weights.semibold,
  color: colors.textPrimary,
}

const mutedTextStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: spacing.sm,
  fontSize: typography.sizes.sm,
  color: colors.textMuted,
  lineHeight: 1.5,
}

const controlsRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing.sm,
  flexWrap: 'wrap',
  marginBottom: spacing.sm,
}

const controlGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  flexWrap: 'wrap',
}

const labelStyle: React.CSSProperties = {
  fontSize: typography.sizes.sm,
  color: colors.textPrimary,
  display: 'inline-flex',
  alignItems: 'center',
}

const selectStyle: React.CSSProperties = {
  padding: `${spacing['3xs']} ${spacing.xs}`,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  backgroundColor: 'white',
  color: colors.textPrimary,
}

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: colors.primary,
  cursor: 'pointer',
  fontSize: typography.sizes.xs,
  fontWeight: typography.weights.semibold,
  padding: 0,
  textDecoration: 'underline',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.md}`,
  backgroundColor: colors.primary,
  color: 'white',
  border: 'none',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
}

const listStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
  maxHeight: 480,
  overflowY: 'auto',
}

const vendorRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: spacing.sm,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  cursor: 'pointer',
  gap: spacing.xs,
  flexWrap: 'wrap',
}

const successBoxStyle: React.CSSProperties = {
  padding: spacing.sm,
  marginBottom: spacing.sm,
  backgroundColor: '#d4edda',
  color: '#155724',
  border: '1px solid #c3e6cb',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
}

const errorBoxStyle: React.CSSProperties = {
  padding: spacing.sm,
  marginBottom: spacing.sm,
  backgroundColor: '#f8d7da',
  color: '#721c24',
  border: '1px solid #f5c6cb',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
}
