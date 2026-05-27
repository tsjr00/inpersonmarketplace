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

interface JustAcceptedEntry {
  market_id: string
  market_name: string
}

export default function PendingMarketInvitations({
  vertical,
  invitations,
  onAfterRespond,
}: PendingMarketInvitationsProps) {
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [rowFlash, setRowFlash] = useState<Record<string, string>>({})
  // Decline hides the row immediately; accept keeps the row visible as a
  // "next steps" panel until parent refresh removes it from the
  // `invitations` prop (the new market will then appear in fixedMarkets).
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [justAccepted, setJustAccepted] = useState<Record<string, JustAcceptedEntry>>({})

  // Don't render the card at all when there's nothing to show — neither
  // pending invitations nor still-visible "just accepted" panels.
  const visible = invitations.filter(
    (i) => !hidden.has(i.market_vendor_id) || justAccepted[i.market_vendor_id]
  )
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
      if (responseStatus === 'accepted') {
        // Keep the row visible as a next-steps panel. Parent refresh runs
        // below; when the invitations prop updates (this row drops out),
        // the panel disappears naturally on next render.
        setJustAccepted((s) => ({
          ...s,
          [inv.market_vendor_id]: {
            market_id: inv.market_id,
            market_name: inv.market_name,
          },
        }))
      } else {
        // Decline → just hide.
        setHidden((prev) => {
          const next = new Set(prev)
          next.add(inv.market_vendor_id)
          return next
        })
      }
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
      {/* Explainer block — addresses user's design intent (2026-05-26):
          "put an explainer box in the process so the vendor accepting
          the invitation understands what they are accepting." Spells out
          exactly what acceptance means + what's required to actually
          sell, before the vendor commits either way. */}
      <div style={explainerBoxStyle}>
        <div style={explainerHeadingStyle}>What happens if you accept?</div>
        <ul style={explainerListStyle}>
          <li>You become <strong>affiliated</strong> with the market — the manager has already approved you, so no further approval is needed on their side.</li>
          <li>Acceptance does <strong>NOT</strong> automatically add your products to the market or book you a booth. Those are separate steps you control.</li>
          <li>To actually sell at this market, you&apos;ll still need to:
            <ul style={explainerSubListStyle}>
              <li>Add this market to your product listings</li>
              <li>Book a booth for an upcoming week (per-week, via the platform — pricing set by the manager)</li>
            </ul>
          </li>
          <li>If you already pay the manager directly for a booth (off-platform), that arrangement still works — you just won&apos;t use the platform&apos;s booth-rental flow.</li>
        </ul>
      </div>

      <ul style={listStyle}>
        {visible.map((inv) => {
          const acceptedEntry = justAccepted[inv.market_vendor_id]
          // Just-accepted: render the next-steps panel instead of the
          // accept/decline buttons. Stays visible until parent refresh
          // updates the invitations prop (this row drops out, panel
          // disappears on next render).
          if (acceptedEntry) {
            return (
              <li key={inv.market_vendor_id}>
                <NextStepsPanel
                  vertical={vertical}
                  marketId={acceptedEntry.market_id}
                  marketName={acceptedEntry.market_name}
                />
              </li>
            )
          }
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

// ---------------------------------------------------------------------------
// Next-steps panel (rendered in-place of the accepted row, until parent
// refresh removes it from the invitations prop)
// ---------------------------------------------------------------------------

function NextStepsPanel({
  vertical,
  marketId,
  marketName,
}: {
  vertical: string
  marketId: string
  marketName: string
}) {
  return (
    <div style={nextStepsCardStyle}>
      <div style={nextStepsHeadingStyle}>
        ✓ You&apos;re affiliated with {marketName}
      </div>
      <p style={{ margin: 0, marginBottom: 12, fontSize: 13, color: '#1f2937', lineHeight: 1.55 }}>
        Welcome aboard. To start selling here, complete these two steps —
        you can do them in any order, at your own pace.
      </p>
      <ul style={nextStepsListStyle}>
        <li>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            ⏳ Add your products to this market
          </div>
          <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 6 }}>
            Edit each listing you want available here. Without this, buyers
            won&apos;t see your products on {marketName}&apos;s page.
          </div>
          <Link
            href={`/${vertical}/vendor/listings`}
            style={inlineLinkStyle}
          >
            Go to my listings →
          </Link>
        </li>
        <li style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            ⏳ Book a booth for an upcoming week
          </div>
          <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 6 }}>
            Pick a week, pay through the platform, and you&apos;re confirmed.
            If you already pay the manager directly off-platform, you can
            skip this and continue your existing arrangement.
          </div>
          <Link
            href={`/${vertical}/markets/${marketId}/book`}
            style={inlineLinkStyle}
          >
            Book a booth at {marketName} →
          </Link>
        </li>
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

const explainerBoxStyle: React.CSSProperties = {
  padding: spacing.sm,
  marginBottom: spacing.md,
  backgroundColor: 'white',
  border: `1px solid #e5d4a8`,
  borderRadius: radius.sm,
}

const explainerHeadingStyle: React.CSSProperties = {
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  color: colors.textPrimary,
  marginBottom: spacing['2xs'],
}

const explainerListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: typography.sizes.sm,
  color: colors.textPrimary,
  lineHeight: 1.55,
  display: 'flex',
  flexDirection: 'column',
  gap: spacing['3xs'],
}

const explainerSubListStyle: React.CSSProperties = {
  margin: `${spacing['3xs']} 0 0 0`,
  paddingLeft: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

// Next-steps panel styles (greener, success-toned card to distinguish from
// the cream invitation card it sits inside).
const nextStepsCardStyle: React.CSSProperties = {
  padding: spacing.sm,
  backgroundColor: '#f0fdf4',
  border: '1px solid #86efac',
  borderRadius: radius.sm,
}

const nextStepsHeadingStyle: React.CSSProperties = {
  fontSize: typography.sizes.base,
  fontWeight: typography.weights.semibold,
  color: '#166534',
  marginBottom: spacing['2xs'],
}

const nextStepsListStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  fontSize: typography.sizes.sm,
  color: colors.textPrimary,
  lineHeight: 1.55,
}

const inlineLinkStyle: React.CSSProperties = {
  color: colors.primary,
  fontWeight: typography.weights.semibold,
  fontSize: typography.sizes.sm,
  textDecoration: 'underline',
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
