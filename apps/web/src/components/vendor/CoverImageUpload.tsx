'use client'
import { useState } from 'react'
import Image from 'next/image'
import { resizeImage, isValidImageType, formatFileSize } from '@/lib/utils/image-resize'
import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'

interface Props {
  currentImageUrl?: string | null
  vertical?: string
}

export default function CoverImageUpload({ currentImageUrl, vertical }: Props) {
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(currentImageUrl || '')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!isValidImageType(file)) {
      setError('Please select a JPG, PNG, GIF, or WebP image')
      return
    }

    setError('')
    setSuccess('')
    setUploading(true)

    try {
      // Resize to landscape-friendly dimensions before upload
      const resized = await resizeImage(file, {
        maxDimension: 1200,
        quality: 0.82,
        outputType: 'image/jpeg',
      })

      // Preview
      const reader = new FileReader()
      reader.onload = (ev) => setPreviewUrl(ev.target?.result as string)
      reader.readAsDataURL(resized)

      // Upload
      const formData = new FormData()
      formData.append('image', resized)

      const url = vertical
        ? `/api/vendor/cover-image?vertical=${vertical}`
        : '/api/vendor/cover-image'

      const res = await fetch(url, { method: 'POST', body: formData })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await res.json()
      setPreviewUrl(data.imageUrl)
      setSuccess(`Cover photo updated (${formatFileSize(resized.size)})`)
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to upload image'
      setError(message)
      setPreviewUrl(currentImageUrl || '')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: Number(radius.md.replace('px', '')),
      padding: spacing.md,
      border: `1px solid ${colors.border}`,
    }}>
      <h2 style={{
        margin: `0 0 ${spacing.xs} 0`,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
      }}>
        Cover Photo
      </h2>
      <p style={{
        margin: `0 0 ${spacing.sm} 0`,
        fontSize: typography.sizes.sm,
        color: colors.textMuted,
      }}>
        Show off your truck, farm stand, or booth. Landscape photos work best.
      </p>

      {/* Preview */}
      <div style={{
        width: '100%',
        height: 180,
        borderRadius: radius.sm,
        overflow: 'hidden',
        marginBottom: spacing.sm,
        backgroundColor: colors.surfaceMuted,
        border: `1px solid ${colors.border}`,
      }}>
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Cover photo"
            width={600}
            height={180}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.textMuted,
            fontSize: typography.sizes.sm,
          }}>
            <span style={{ fontSize: 32, marginBottom: 8 }}>📷</span>
            No cover photo yet
          </div>
        )}
      </div>

      {/* Upload button */}
      <label style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: `${spacing.xs} ${spacing.md}`,
        backgroundColor: colors.primary,
        color: 'white',
        borderRadius: radius.sm,
        fontWeight: typography.weights.semibold,
        fontSize: typography.sizes.sm,
        cursor: uploading ? 'not-allowed' : 'pointer',
        opacity: uploading ? 0.6 : 1,
        minHeight: '40px',
      }}>
        {uploading ? 'Uploading...' : previewUrl ? 'Change Photo' : 'Upload Photo'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </label>

      <span style={{
        marginLeft: spacing.sm,
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
      }}>
        JPG, PNG, or WebP. Max 3MB. Auto-resized.
      </span>

      {error && (
        <p style={{ margin: `${spacing.xs} 0 0 0`, fontSize: typography.sizes.sm, color: statusColors.danger }}>
          {error}
        </p>
      )}
      {success && (
        <p style={{ margin: `${spacing.xs} 0 0 0`, fontSize: typography.sizes.sm, color: statusColors.success }}>
          {success}
        </p>
      )}
    </div>
  )
}
