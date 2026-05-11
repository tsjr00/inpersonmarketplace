'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface InviteVendorLinkProps {
  vertical: string
  marketId: string
  marketName: string
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
export default function InviteVendorLink({ vertical, marketId, marketName }: InviteVendorLinkProps) {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setUrl(`${window.location.origin}/${vertical}/vendor-signup?market=${marketId}`)
  }, [vertical, marketId])

  const handleCopy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may fail in older browsers / non-https contexts;
      // user can still select-all-and-copy from the input directly.
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap' }}>
        <input
          type="text"
          value={url}
          readOnly
          onFocus={(e) => e.target.select()}
          aria-label="Vendor invite URL"
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
        When opened, the vendor sees a banner identifying <strong>{marketName}</strong> as the inviting market.
        They complete the standard vendor signup; once they&apos;re added to {marketName} they appear in the vendor list above.
      </p>
    </div>
  )
}
