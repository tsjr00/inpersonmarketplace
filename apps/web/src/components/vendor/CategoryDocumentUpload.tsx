'use client'

import { useState, useRef } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import {
  getCategoryRequirement,
  requiresDocuments,
  DOC_TYPE_LABELS,
  type DocType,
} from '@/lib/onboarding/category-requirements'
import type { Category } from '@/lib/constants'

interface CategoryDoc {
  url: string
  filename: string
  doc_type: string
  uploaded_at: string
}

interface CategoryVerification {
  status: string
  doc_type?: string
  documents?: CategoryDoc[]
  reviewed_at?: string
  notes?: string
}

interface Props {
  category: Category
  verification?: CategoryVerification
  onUploaded: () => void
}

export default function CategoryDocumentUpload({ category, verification, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDocType, setSelectedDocType] = useState<DocType | ''>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const requirement = getCategoryRequirement(category)

  if (!requiresDocuments(category)) return null

  const documents = verification?.documents || []
  const status = verification?.status || 'not_submitted'

  const handleUpload = async (file: File) => {
    if (!selectedDocType && requirement.acceptedDocTypes.length > 1) {
      setError('Please select a document type first')
      return
    }

    const docType = selectedDocType || requirement.acceptedDocTypes[0]
    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('document', file)
      formData.append('category', category)
      formData.append('doc_type', docType)

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
      setUploading(false)
    }
  }

  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    not_submitted: { bg: '#f3f4f6', text: '#6b7280', label: 'Not submitted' },
    pending: { bg: '#fef3c7', text: '#92400e', label: 'Pending review' },
    approved: { bg: '#dcfce7', text: '#166534', label: 'Approved' },
    rejected: { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
  }

  const statusInfo = statusColors[status] || statusColors.not_submitted

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
            {category}
          </div>
          <div style={{
            fontSize: typography.sizes.xs,
            color: colors.textMuted,
            marginTop: spacing['3xs'],
          }}>
            {requirement.description}
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

      {/* Document type selector (when multiple options available) */}
      {requirement.acceptedDocTypes.length > 1 && status !== 'approved' && (
        <div style={{ marginTop: spacing.xs }}>
          <label style={{
            fontSize: typography.sizes.xs,
            color: colors.textSecondary,
            fontWeight: typography.weights.medium,
          }}>
            Document type:
          </label>
          <div style={{ display: 'flex', gap: spacing['2xs'], marginTop: spacing['3xs'], flexWrap: 'wrap' }}>
            {requirement.acceptedDocTypes.map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => setSelectedDocType(dt)}
                style={{
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: selectedDocType === dt ? colors.primaryLight : colors.surfaceMuted,
                  color: selectedDocType === dt ? colors.primaryDark : colors.textSecondary,
                  border: `1px solid ${selectedDocType === dt ? colors.primaryDark : colors.border}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                  cursor: 'pointer',
                }}
              >
                {DOC_TYPE_LABELS[dt]}
              </button>
            ))}
          </div>
        </div>
      )}

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
                  backgroundColor: '#dcfce7',
                  color: '#166534',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.medium,
                  textDecoration: 'none',
                }}
              >
                {doc.filename || 'Document'} — View
              </a>
              {doc.doc_type && (
                <span style={{
                  fontSize: typography.sizes.xs,
                  color: colors.textMuted,
                }}>
                  ({DOC_TYPE_LABELS[doc.doc_type as DocType] || doc.doc_type})
                </span>
              )}
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
            {uploading ? 'Uploading...' : documents.length > 0 ? '+ Upload Additional' : '+ Upload Document'}
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
