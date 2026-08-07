'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import DashboardCard from '@/components/dashboard/DashboardCard'
import BoothMapViewer from './BoothMapViewer'

/**
 * Manager dashboard card for the booth/spot map (mig 205). Upload / replace /
 * remove a map image or PDF showing where booths (FM) / truck spots (FT) are
 * located. Shown to vendors during the booth-rental flow and on their bookings.
 *
 * API: POST/DELETE /api/market-manager/[marketId]/booth-map
 */
interface MarketMapCardProps {
  marketId: string
  vertical: string
  initialBoothMapUrl: string | null
}

export default function MarketMapCard({ marketId, vertical, initialBoothMapUrl }: MarketMapCardProps) {
  const router = useRouter()
  const isFt = vertical === 'food_trucks'
  const noun = isFt ? 'spot map' : 'booth map'
  const [mapUrl, setMapUrl] = useState<string | null>(initialBoothMapUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
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
      const res = await fetch(`/api/market-manager/${marketId}/booth-map`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || `Failed to upload ${noun}`)
        return
      }
      setMapUrl(data.booth_map_url)
      setSuccess(`${isFt ? 'Spot' : 'Booth'} map uploaded.`)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const requestRemove = () => {
    setError(null)
    setSuccess(null)
    setConfirmingRemove(true)
  }

  const performRemove = async () => {
    setConfirmingRemove(false)
    setUploading(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-map`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || `Failed to remove ${noun}`)
        return
      }
      setMapUrl(null)
      setSuccess(`${isFt ? 'Spot' : 'Booth'} map removed.`)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setUploading(false)
    }
  }

  return (
    <DashboardCard
      title={isFt ? 'Spot map' : 'Booth map'}
      description={`Upload a map of where your ${isFt ? 'truck spots' : 'booths'} are located. Vendors see it while booking a ${isFt ? 'spot' : 'booth'} and when they check their bookings — it helps them find where they'll be set up.`}
    >
      {mapUrl ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, marginBottom: spacing.sm }}>
          <BoothMapViewer url={mapUrl} alt={`${isFt ? 'Spot' : 'Booth'} map`} maxHeight={260} />
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
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
              onClick={requestRemove}
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
          {uploading ? 'Uploading…' : `Upload ${noun}`}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
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
        JPG, PNG, GIF, WebP, or PDF. Max 3 MB.
      </p>

      <ConfirmDialog
        open={confirmingRemove}
        title={`Remove ${noun}?`}
        message={`Remove the current ${noun}? Vendors will no longer see it while booking. You can upload a new one any time.`}
        variant="danger"
        confirmLabel="Remove"
        onConfirm={performRemove}
        onCancel={() => setConfirmingRemove(false)}
      />
    </DashboardCard>
  )
}
