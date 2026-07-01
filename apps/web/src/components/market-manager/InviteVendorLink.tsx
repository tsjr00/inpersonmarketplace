'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'

interface InviteVendorLinkProps {
  vertical: string
  marketId: string
  marketName: string
  /** When false, the copy button is disabled and a "complete setup
   *  first" notice is shown. Prevents managers from inviting vendors
   *  before they've selected booth inventory + opt-in statements
   *  (which would result in an incomplete invite landing for the
   *  vendor). Locked decision from Phase B planning. */
  onboardingComplete?: boolean
}

/**
 * Manager-side invite link. Shows a copy-able URL that takes a vendor
 * to /[vertical]/vendor-signup?market=<id> with a banner identifying
 * the inviting market.
 *
 * The URL is built client-side from window.location.origin so it works
 * on dev (localhost), staging, and prod without configuration. The
 * receiving signup page reads the `market` query param and renders a
 * banner — see vendor-signup/page.tsx.
 *
 * Note: we intentionally do NOT include `?ref=manager` here. The vendor
 * signup page already uses `?ref=<code>` to look up vendor-to-vendor
 * referrals; reusing the param would cause confusion. The presence of
 * `?market=` alone is the signal that this came from a manager invite.
 */
export default function InviteVendorLink({ vertical, marketId, marketName, onboardingComplete = true }: InviteVendorLinkProps) {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setUrl(`${window.location.origin}/${vertical}/vendor-signup?market=${marketId}`)
  }, [vertical, marketId])

  const handleCopy = async () => {
    if (!url || !onboardingComplete) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may fail in older browsers / non-https contexts;
      // user can still select-all-and-copy from the input directly.
    }
  }

  // Gated state — manager hasn't finished setup. The invite landing
  // would render an incomplete agreement (or none at all) so we don't
  // let them share the URL until the wizard is done.
  if (!onboardingComplete) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#fef3c7',
          border: '1px solid #fde047',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          color: '#713f12',
          lineHeight: 1.5,
        }}>
          <strong>Complete your setup first.</strong> The invite link will be
          available once you&apos;ve added {term(vertical, 'booth').toLowerCase()} inventory and selected at
          least one {term(vertical, 'vendor').toLowerCase()} agreement statement. Until then, the invite
          landing wouldn&apos;t show {term(vertical, 'vendors').toLowerCase()} what they&apos;re agreeing to.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap' }}>
        <input
          type="text"
          value={url}
          readOnly
          onFocus={(e) => e.target.select()}
          aria-label={`${term(vertical, 'vendor')} invite URL`}
          style={{
            flex: '1 1 280px',
            minWidth: 0,
            padding: `${spacing['3xs']} ${spacing.xs}`,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontFamily: 'monospace',
            backgroundColor: colors.surfaceBase,
            color: colors.textPrimary,
          }}
        />
        <button
          onClick={handleCopy}
          disabled={!url}
          style={{
            padding: `${spacing['3xs']} ${spacing.sm}`,
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: url ? 'pointer' : 'not-allowed',
            opacity: url ? 1 : 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
      </div>
      <p style={{
        margin: 0,
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        lineHeight: 1.5,
      }}>
        When opened, the {term(vertical, 'vendor').toLowerCase()} sees a banner identifying <strong>{marketName}</strong> as the inviting {term(vertical, 'market').toLowerCase()}.
        They complete the standard {term(vertical, 'vendor').toLowerCase()} signup; once they&apos;re added to {marketName} they appear in the {term(vertical, 'vendor').toLowerCase()} list above.
      </p>
    </div>
  )
}
