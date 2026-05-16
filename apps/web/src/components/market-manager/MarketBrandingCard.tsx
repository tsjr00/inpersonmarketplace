'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Manager dashboard card for market co-branding.
 *
 * Sections:
 *   1. Logo — upload / replace / remove. Renders on public market
 *      profile + vendor invite landing.
 *   2. Description (A3, 2026-05-16) — short text the manager controls.
 *      Renders on public market profile + invite landing intro.
 *
 * APIs:
 *   POST/DELETE /api/market-manager/[marketId]/logo
 *   PATCH       /api/market-manager/[marketId]/branding   (description)
 */
interface MarketBrandingCardProps {
  marketId: string
  initialLogoUrl: string | null
  initialDescription: string | null
}

const DESCRIPTION_MAX = 1000

export default function MarketBrandingCard({
  marketId,
  initialLogoUrl,
  initialDescription,
}: MarketBrandingCardProps) {
  const router = useRouter()
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Description editor state
  const [description, setDescription] = useState<string>(initialDescription ?? '')
  const [savedDescription, setSavedDescription] = useState<string>(initialDescription ?? '')
  const [savingDescription, setSavingDescription] = useState(false)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [descriptionSavedFlash, setDescriptionSavedFlash] = useState(false)

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

  const handleSaveDescription = async () => {
    setDescriptionError(null)
    setDescriptionSavedFlash(false)
    if (description.length > DESCRIPTION_MAX) {
      setDescriptionError(`Description must be ${DESCRIPTION_MAX} characters or fewer.`)
      return
    }
    setSavingDescription(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/branding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDescriptionError(data.error || 'Failed to save description')
        return
      }
      const saved = (data.description ?? '') as string
      setDescription(saved)
      setSavedDescription(saved)
      setDescriptionSavedFlash(true)
      setTimeout(() => setDescriptionSavedFlash(false), 2000)
      router.refresh()
    } catch {
      setDescriptionError('Network error — please try again')
    } finally {
      setSavingDescription(false)
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

      {/* Description editor (A3, 2026-05-16). Writes to markets.description
          via PATCH /api/market-manager/[marketId]/branding. Renders on the
          public market profile page + the vendor invite landing intro. */}
      <div style={{
        marginTop: spacing.lg,
        paddingTop: spacing.md,
        borderTop: `1px solid ${colors.border}`,
      }}>
        <h3 style={{
          marginTop: 0,
          marginBottom: spacing['2xs'],
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Market description
        </h3>
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          lineHeight: 1.5,
        }}>
          A short blurb about your market — what makes it special, what
          vendors should know. Appears on your public market profile and
          on the vendor invite page.
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What makes your market special? Who comes? What do you focus on?"
          rows={4}
          maxLength={DESCRIPTION_MAX}
          disabled={savingDescription}
          style={{
            width: '100%',
            padding: spacing.xs,
            fontSize: typography.sizes.sm,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
            color: colors.textPrimary,
            backgroundColor: colors.surfaceBase,
          }}
        />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: spacing['2xs'],
          gap: spacing.sm,
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: typography.sizes.xs,
            color: colors.textMuted,
          }}>
            {description.length}/{DESCRIPTION_MAX}
          </span>
          <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
            {descriptionSavedFlash && (
              <span style={{
                fontSize: typography.sizes.xs,
                color: '#155724',
                fontWeight: typography.weights.semibold,
              }}>
                ✓ Saved
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveDescription}
              disabled={savingDescription || description === savedDescription}
              style={{
                padding: `${spacing['3xs']} ${spacing.sm}`,
                backgroundColor: (savingDescription || description === savedDescription) ? colors.surfaceBase : colors.primary,
                color: (savingDescription || description === savedDescription) ? colors.textMuted : 'white',
                border: `1px solid ${(savingDescription || description === savedDescription) ? colors.border : colors.primary}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                cursor: (savingDescription || description === savedDescription) ? 'not-allowed' : 'pointer',
              }}
            >
              {savingDescription ? 'Saving…' : 'Save description'}
            </button>
          </div>
        </div>
        {descriptionError && (
          <div style={{
            marginTop: spacing.xs,
            padding: spacing.xs,
            backgroundColor: '#f8d7da',
            color: '#721c24',
            border: '1px solid #f5c6cb',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
          }}>
            {descriptionError}
          </div>
        )}
      </div>
    </div>
  )
}
