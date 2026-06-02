'use client'

import { useState } from 'react'

/**
 * Click-to-view link for a vendor-documents file. Replaces direct
 * <a href={doc.url}> usage now that the vendor-documents bucket is private
 * (mig 151 / X3). On click, fetches a short-lived signed URL from
 * /api/vendor-documents/signed-url and opens it in a new tab.
 *
 * Auth: the API endpoint enforces vendor-owns / admin / manager-with-consent.
 * Caller doesn't need to pre-check — if not authorized, click yields an
 * error toast inline and nothing opens.
 *
 * Manager use: pass `marketId` so the endpoint can verify
 * isMarketManager + info-sharing consent. Vendor + admin paths don't need it.
 *
 * Path extraction: if you have a stored public URL (e.g., from older
 * certifications data that only saved `document_url`), use
 * `extractVendorDocPathFromPublicUrl(url)` to derive the path first.
 */

export interface VendorDocLinkProps {
  /** Storage path within the vendor-documents bucket (e.g., `coi/<vp_id>/<filename>`). */
  path: string
  /** Optional: pass when the caller is a market manager — required for the
   *  consent gate. Omit for vendor or admin contexts. */
  marketId?: string
  /** Display text for the link. Defaults to "View". */
  children?: React.ReactNode
  /** Optional className passthrough for styling. */
  className?: string
  /** Optional inline style passthrough. */
  style?: React.CSSProperties
}

/**
 * Extract the storage path from a Supabase public URL.
 * Returns null if the URL doesn't match the expected vendor-documents shape.
 *
 * Example input:
 *   https://abcd.supabase.co/storage/v1/object/public/vendor-documents/coi/xx/file.pdf
 * Returns:
 *   coi/xx/file.pdf
 *
 * Used for legacy data where only `document_url` was stored
 * (vendor_profiles.certifications JSONB).
 */
export function extractVendorDocPathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const marker = '/storage/v1/object/public/vendor-documents/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const path = url.slice(idx + marker.length)
  if (!path || path.includes('..')) return null
  return path
}

export default function VendorDocLink({
  path,
  marketId,
  children,
  className,
  style,
}: VendorDocLinkProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ path })
      if (marketId) qs.set('marketId', marketId)
      const res = await fetch(`/api/vendor-documents/signed-url?${qs.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.signed_url) {
        setError(data?.error || 'Could not open document')
        return
      }
      window.open(data.signed_url as string, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Network error — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <a
        href="#"
        onClick={handleClick}
        className={className}
        style={style}
        aria-busy={busy}
      >
        {busy ? 'Loading…' : (children ?? 'View')}
      </a>
      {error && (
        <span
          style={{
            display: 'inline-block',
            marginLeft: 8,
            fontSize: 12,
            color: '#991b1b',
          }}
        >
          {error}
        </span>
      )}
    </>
  )
}
