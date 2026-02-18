'use client'

import { useState, useRef } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import {
  FOOD_TRUCK_PERMIT_REQUIREMENTS,
  FOOD_TRUCK_DOC_TYPE_LABELS,
  type FoodTruckDocType,
} from '@/lib/onboarding/category-requirements'

interface PermitDoc {
  url: string
  filename: string
  doc_type: string
  uploaded_at: string
}

interface PermitVerification {
  status: string
  documents?: PermitDoc[]
  reviewed_at?: string
  notes?: string
}

interface Props {
  categoryStatuses: Record<string, {
    requirementLevel: string
    status: string
    label: string
    documents: unknown[]
    required?: boolean
  }>
  onUploaded: () => void
}

export default function FoodTruckPermitUpload({ categoryStatuses, onUploaded }: Props) {
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const handleUpload = async (permitDocType: FoodTruckDocType, file: File) => {
    setUploading(permitDocType)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('document', file)
      formData.append('category', permitDocType)
      formData.append('doc_type', permitDocType)

      const response = await fetch('/api/vendor/onboarding/category-documents', {
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
      setUploading(null)
    }
  }

  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    not_submitted: { bg: '#f3f4f6', text: '#6b7280', label: 'Not submitted' },
    pending: { bg: '#fef3c7', text: '#92400e', label: 'Pending review' },
    approved: { bg: colors.primaryLight, text: colors.primaryDark, label: 'Approved' },
    rejected: { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {FOOD_TRUCK_PERMIT_REQUIREMENTS.map((permit) => {
        const permitStatus = categoryStatuses[permit.docType]
        const status = permitStatus?.status || 'not_submitted'
        const documents = (permitStatus?.documents || []) as PermitDoc[]
        const verification = permitStatus as unknown as PermitVerification | undefined
        const statusInfo = statusColors[status] || statusColors.not_submitted

        return (
          <div key={permit.docType} style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing['2xs'],
                }}>
                  <span style={{
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary,
                  }}>
                    {FOOD_TRUCK_DOC_TYPE_LABELS[permit.docType]}
                  </span>
                  <span style={{
                    padding: `1px ${spacing['2xs']}`,
                    backgroundColor: permit.required ? '#fef2f2' : '#f0fdf4',
                    color: permit.required ? '#991b1b' : '#166534',
                    borderRadius: radius.sm,
                    fontSize: '10px',
                    fontWeight: typography.weights.medium,
                  }}>
                    {permit.required ? 'Required' : 'Recommended'}
                  </span>
                </div>
                <div style={{
                  fontSize: typography.sizes.xs,
                  color: colors.textMuted,
                  marginTop: spacing['3xs'],
                }}>
                  {permit.description}
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
                marginLeft: spacing.xs,
              }}>
                {statusInfo.label}
              </span>
            </div>

            {/* Uploaded documents */}
            {documents.length > 0 && (
              <div style={{ marginTop: spacing.xs }}>
                {documents.map((doc, i) => (
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
                      {doc.filename || 'Document'} — View
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Rejection notes */}
            {status === 'rejected' && verification?.notes && (
              <div style={{
                marginTop: spacing.xs,
                padding: spacing.xs,
                backgroundColor: '#fee2e2',
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                color: '#991b1b',
              }}>
                <strong>Feedback:</strong> {verification.notes}
              </div>
            )}

            {/* Upload button (show when not approved) */}
            {status !== 'approved' && (
              <div style={{ marginTop: spacing.xs }}>
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[permit.docType]?.click()}
                  disabled={uploading === permit.docType}
                  style={{
                    padding: `${spacing['3xs']} ${spacing.xs}`,
                    backgroundColor: uploading === permit.docType ? colors.surfaceMuted : colors.surfaceElevated,
                    color: colors.textSecondary,
                    border: `1px dashed ${colors.border}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    cursor: uploading === permit.docType ? 'wait' : 'pointer',
                  }}
                >
                  {uploading === permit.docType
                    ? 'Uploading...'
                    : documents.length > 0
                      ? '+ Upload Additional'
                      : '+ Upload Document'}
                </button>
                <input
                  ref={(el) => { fileInputRefs.current[permit.docType] = el }}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(permit.docType, file)
                    e.target.value = ''
                  }}
                />
              </div>
            )}
          </div>
        )
      })}

      {error && (
        <div style={{
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
