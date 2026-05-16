'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Manager dashboard card for market co-branding. v1 scope (Phase B):
 *   - Upload / replace / remove a logo image
 *   - Logo renders on the public market profile page and on the
 *     vendor invite landing
 *
 * Description editing and color theming are deferred — `markets.description`
 * is editable via the admin path today; a separate manager-side description
 * editor can land in a follow-up.
 *
 * API: POST/DELETE /api/market-manager/[marketId]/logo
 */
interface MarketBrandingCardProps {
  marketId: string
  initialLogoUrl: string | null
}

export default function MarketBrandingCard({
  marketId,
  initialLogoUrl,
}: MarketBrandingCardProps) {
  const router = useRouter()
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadFile(file)
  }

  const uploadFile = async (file: File) => {
    setError(null)
    setSuccess(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch(`/api/market-manager/${marketId}/logo`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to upload logo')
        return
      }
      setLogoUrl(data.logo_url)
      setSuccess('Logo uploaded.')
      // Refresh server-rendered surfaces (market profile + invite landing
      // pick up the new URL on next request anyway, but the dashboard's
      // own market row is cached on this page load — refresh keeps it
      // in sync with what the server sees).
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    setError(null)
    setSuccess(null)
    if (!confirm('Remove the current logo? The default platform branding will be used in its place.')) {
      return
    }
    setUploading(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/logo`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to remove logo')
        return
      }
      setLogoUrl(null)
      setSuccess('Logo removed.')
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    }}>
      <h2 style={{
        marginTop: 0,
        marginBottom: spacing.xs,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        Branding
      </h2>
      <p style={{
        margin: 0,
        marginBottom: spacing.sm,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        lineHeight: 1.5,
      }}>
        Upload your market&apos;s logo. It will appear on your public market
        profile and on the co-branded vendor invite page.
      </p>

      {logoUrl ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', marginBottom: spacing.sm }}>
          {/* Logo preview — keep it small enough to fit on mobile but
              large enough to recognize. eslint-disable next-line for img
              since we deliberately don't run Next image optimization on
              user-uploaded logos (storage URL not in remotePatterns). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="Market logo"
            style={{
              width: 120,
              height: 120,
              objectFit: 'contain',
              borderRadius: radius.sm,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surfaceBase,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                padding: `${spacing.xs} ${spacing.md}`,
                backgroundColor: 'transparent',
                color: colors.primary,
                border: `2px solid ${colors.primary}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                cursor: uploading ? 'not-allowed' : 'pointer',
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? 'Working…' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              style={{
                padding: `${spacing.xs} ${spacing.md}`,
                backgroundColor: 'transparent',
                color: colors.textMuted,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                cursor: uploading ? 'not-allowed' : 'pointer',
                opacity: uploading ? 0.6 : 1,
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: `${spacing.sm} ${spacing.md}`,
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? 'Uploading…' : 'Upload logo'}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {error && (
        <div style={{
          marginTop: spacing.sm,
          padding: spacing.xs,
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          marginTop: spacing.sm,
          padding: spacing.xs,
          backgroundColor: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
        }}>
          {success}
        </div>
      )}

      <p style={{
        marginTop: spacing.sm,
        marginBottom: 0,
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        lineHeight: 1.5,
      }}>
        JPG, PNG, GIF, or WebP. Max 3 MB. Square images render best.
      </p>
    </div>
  )
}
