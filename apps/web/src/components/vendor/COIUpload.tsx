'use client'

import { useState, useRef } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface COIDoc {
  url: string
  filename: string
  uploaded_at: string
}

interface Props {
  coiStatus: string
  coiDocuments: COIDoc[]
  coiVerifiedAt: string | null
  onUploaded: () => void
}

export default function COIUpload({ coiStatus, coiDocuments, coiVerifiedAt, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('document', file)

      const response = await fetch('/api/vendor/onboarding/coi', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }

      onUploaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    not_submitted: { bg: '#f3f4f6', text: '#6b7280', label: 'Not submitted' },
    pending: { bg: '#fef3c7', text: '#92400e', label: 'Pending review' },
    approved: { bg: colors.primaryLight, text: colors.primaryDark, label: 'Approved' },
    rejected: { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
  }

  const statusInfo = statusColors[coiStatus] || statusColors.not_submitted

  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
          }}>
            Certificate of Insurance (COI)
          </div>
          <div style={{
            fontSize: typography.sizes.xs,
            color: colors.textMuted,
            marginTop: spacing['3xs'],
          }}>
            General liability insurance is required before your listings can go live at market. Upload your current certificate of insurance.
          </div>
        </div>
        <span style={{
          padding: `${spacing['3xs']} ${spacing.xs}`,
          backgroundColor: statusInfo.bg,
          color: statusInfo.text,
          borderRadius: radius.sm,
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.medium,
          whiteSpace: 'nowrap',
        }}>
          {statusInfo.label}
        </span>
      </div>

      {/* Uploaded documents */}
      {coiDocuments.length > 0 && (
        <div style={{ marginTop: spacing.xs }}>
          {coiDocuments.map((doc, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing['2xs'],
              marginTop: i > 0 ? spacing['3xs'] : 0,
            }}>
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: spacing['3xs'],
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: colors.primaryLight,
                  color: colors.primaryDark,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.medium,
                  textDecoration: 'none',
                }}
              >
                {doc.filename || 'COI Document'} — View
              </a>
            </div>
          ))}
        </div>
      )}

      {coiStatus === 'approved' && coiVerifiedAt && (
        <div style={{
          marginTop: spacing.xs,
          fontSize: typography.sizes.xs,
          color: colors.primaryDark,
        }}>
          Verified on {new Date(coiVerifiedAt).toLocaleDateString()}
        </div>
      )}

      {/* Upload button (show when not approved) */}
      {coiStatus !== 'approved' && (
        <div style={{ marginTop: spacing.xs }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: `${spacing['3xs']} ${spacing.xs}`,
              backgroundColor: uploading ? colors.surfaceMuted : colors.surfaceElevated,
              color: colors.textSecondary,
              border: `1px dashed ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              cursor: uploading ? 'wait' : 'pointer',
            }}
          >
            {uploading ? 'Uploading...' : coiDocuments.length > 0 ? 'Replace COI' : '+ Upload COI'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {error && (
        <div style={{
          marginTop: spacing.xs,
          padding: spacing.xs,
          backgroundColor: '#fee2e2',
          borderRadius: radius.sm,
          fontSize: typography.sizes.xs,
          color: '#991b1b',
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
