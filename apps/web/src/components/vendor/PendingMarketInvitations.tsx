'use client'

import { useState } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Vendor-facing card listing pending manager-initiated invitations
 * (NEW-8). Rendered at the top of /[vertical]/vendor/markets above the
 * existing market lists when there's at least one pending invitation.
 *
 * Calls PATCH /api/vendor/markets/[id]/respond on accept/decline.
 * On accept: market_vendors.approved auto-flips to true (manager
 * initiated). On decline: row stays for audit, vendor not added.
 *
 * Each row links to the market's public profile so the vendor can
 * review before responding — per the user's design decision (Bug 1 in
 * NEW-8 prep, "put a link to the market profile page in the invitation").
 */

export interface PendingInvitation {
  market_vendor_id: string
  market_id: string
  invited_at: string | null
  market_name: string
  market_address: string | null
  market_city: string | null
  market_state: string | null
  market_zip: string | null
  market_type: string
}

interface PendingMarketInvitationsProps {
  vertical: string
  invitations: PendingInvitation[]
  /** Caller refreshes the parent list after accept/decline so the
   *  invitation drops off + the accepted market shows up in fixedMarkets. */
  onAfterRespond?: () => void | Promise<void>
}

function formatInvitedAt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PendingMarketInvitations({
  vertical,
  invitations,
  onAfterRespond,
}: PendingMarketInvitationsProps) {
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [rowFlash, setRowFlash] = useState<Record<string, string>>({})
  // Track invitations we've already responded to in this render so the
  // row visually drops away without waiting for the parent refresh.
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  // Don't render the card at all when there's nothing to show.
  const visible = invitations.filter((i) => !hidden.has(i.market_vendor_id))
  if (visible.length === 0) return null

  const handleRespond = async (
    inv: PendingInvitation,
    responseStatus: 'accepted' | 'declined'
  ) => {
    setRespondingId(inv.market_vendor_id)
    setRowFlash((s) => ({ ...s, [inv.market_vendor_id]: '' }))
    try {
      const res = await fetch(`/api/vendor/markets/${inv.market_id}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_status: responseStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowFlash((s) => ({
          ...s,
          [inv.market_vendor_id]: data.error || 'Failed to respond',
        }))
        return
      }
      // Hide the row optimistically; parent refresh will catch up on next
      // mount/refetch.
      setHidden((prev) => {
        const next = new Set(prev)
        next.add(inv.market_vendor_id)
        return next
      })
      if (onAfterRespond) {
        await onAfterRespond()
      }
    } catch {
      setRowFlash((s) => ({
        ...s,
        [inv.market_vendor_id]: 'Network error — please try again',
      }))
    } finally {
      setRespondingId(null)
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={headingStyle}>
        📥 Pending Market Invitations ({visible.length})
      </h2>
      <p style={mutedTextStyle}>
        These markets have invited you to join. Review each market&apos;s profile,
        then accept or decline. On accept you&apos;re immediately active at the
        market — the manager has already approved you.
      </p>

      <ul style={listStyle}>
        {visible.map((inv) => {
          const isResponding = respondingId === inv.market_vendor_id
          const flash = rowFlash[inv.market_vendor_id]
          const locationLine = [inv.market_city, inv.market_state]
            .filter(Boolean)
            .join(', ')
          return (
            <li key={inv.market_vendor_id} style={rowStyle}>
              <div style={{ flex: '1 1 250px', minWidth: 0 }}>
                <div style={marketNameStyle}>
                  <Link
                    href={`/${vertical}/markets/${inv.market_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: colors.primary, textDecoration: 'underline' }}
                  >
                    {inv.market_name}
                  </Link>
                </div>
                <div style={metaStyle}>
                  {locationLine && <>{locationLine} · </>}
                  {inv.market_type === 'event' ? 'Event' : 'Traditional market'}
                  {inv.invited_at && <> · Invited {formatInvitedAt(inv.invited_at)}</>}
                </div>
                {inv.market_address && (
                  <div style={metaStyle}>{inv.market_address}</div>
                )}
                {flash && (
                  <div style={errorTextStyle}>{flash}</div>
                )}
              </div>
              <div style={actionsStyle}>
                <button
                  type="button"
                  onClick={() => handleRespond(inv, 'accepted')}
                  disabled={isResponding}
                  style={{
                    ...primaryButtonStyle,
                    opacity: isResponding ? 0.6 : 1,
                    cursor: isResponding ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isResponding ? 'Saving…' : 'Accept'}
                </button>
                <button
                  type="button"
                  onClick={() => handleRespond(inv, 'declined')}
                  disabled={isResponding}
                  style={{
                    ...secondaryButtonStyle,
                    opacity: isResponding ? 0.6 : 1,
                    cursor: isResponding ? 'not-allowed' : 'pointer',
                  }}
                >
                  Decline
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  padding: spacing.md,
  backgroundColor: '#fff7e6',
  border: '1px solid #ffd57a',
  borderRadius: radius.md,
  marginBottom: spacing.md,
}

const headingStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: spacing.xs,
  fontSize: typography.sizes.lg,
  fontWeight: typography.weights.semibold,
  color: '#664d03',
}

const mutedTextStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: spacing.md,
  fontSize: typography.sizes.sm,
  color: '#664d03',
  lineHeight: 1.5,
}

const listStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: spacing.sm,
  backgroundColor: 'white',
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  gap: spacing.sm,
  flexWrap: 'wrap',
}

const marketNameStyle: React.CSSProperties = {
  fontWeight: typography.weights.semibold,
  fontSize: typography.sizes.base,
  color: colors.textPrimary,
}

const metaStyle: React.CSSProperties = {
  fontSize: typography.sizes.xs,
  color: colors.textMuted,
}

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: spacing['2xs'],
  flexShrink: 0,
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

const secondaryButtonStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.md}`,
  backgroundColor: 'transparent',
  color: colors.textPrimary,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
}

const errorTextStyle: React.CSSProperties = {
  marginTop: spacing['3xs'],
  fontSize: typography.sizes.xs,
  color: '#991b1b',
}
