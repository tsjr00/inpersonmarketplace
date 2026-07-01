'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { term } from '@/lib/vertical/terminology'
import ManagerCard from './ManagerCard'
import {
  DOCUMENT_TYPE_DEFINITIONS,
  getDocumentTypeLabel,
  MAX_DOCUMENT_BYTES,
  type MarketDocumentRow,
  type MarketDocumentType,
} from '@/lib/markets/document-types'

/**
 * Manager-facing card for uploading + listing verification documents.
 * Rendered on the manager dashboard below the onboarding checklist.
 *
 * Upload flow:
 *   1. Manager picks a document_type from the dropdown
 *   2. Manager selects a file (PDF/JPG/PNG/WebP, ≤3MB)
 *   3. Optional notes (≤200 chars)
 *   4. POST to /api/market-manager/[marketId]/documents (multipart)
 *   5. New row inserted at top of the list
 *
 * View flow:
 *   - Click a row's "View" link → GET /api/.../documents/[id] returns
 *     a short-lived signed URL → open in a new tab
 *
 * Delete flow:
 *   - Click "Remove" → ConfirmDialog → DELETE /api/.../documents/[id]
 *     Both storage object + DB row are removed; row falls off the list
 *
 * APIs: see src/app/api/market-manager/[marketId]/documents/*
 */

interface VerificationDocumentsCardProps {
  vertical: string
  marketId: string
}

const MAX_NOTES_CHARS = 200

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadedAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function VerificationDocumentsCard({ vertical, marketId }: VerificationDocumentsCardProps) {
  const [documents, setDocuments] = useState<MarketDocumentRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Upload form state
  const [documentType, setDocumentType] = useState<MarketDocumentType | ''>('')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Per-row state
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState<{
    id: string
    label: string
  } | null>(null)

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-manager/${marketId}/documents`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(data.error || 'Failed to load documents')
        setDocuments([])
        return
      }
      setDocuments((data.documents as MarketDocumentRow[]) || [])
    } catch {
      setLoadError('Network error loading documents')
      setDocuments([])
    }
  }, [marketId])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    setUploadError(null)
    setUploadSuccess(null)

    if (!documentType) {
      setUploadError('Pick a document type before uploading.')
      return
    }
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setUploadError('Choose a file to upload.')
      return
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setUploadError(
        `File is ${formatFileSize(file.size)} — must be under ${formatFileSize(MAX_DOCUMENT_BYTES)}.`
      )
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('document_type', documentType)
      if (notes.trim().length > 0) formData.append('notes', notes.trim())

      const res = await fetch(`/api/market-manager/${marketId}/documents`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUploadError(data.error || 'Upload failed')
        setUploading(false)
        return
      }

      // Prepend new row to list, reset form
      setDocuments((prev) => [data.document as MarketDocumentRow, ...(prev || [])])
      setDocumentType('')
      setNotes('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      setUploadSuccess(`Uploaded "${(data.document as MarketDocumentRow).file_name}".`)
      window.setTimeout(() => setUploadSuccess(null), 3000)
    } catch {
      setUploadError('Network error — please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleView = async (docId: string) => {
    setOpeningId(docId)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/documents/${docId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.signed_url) {
        setLoadError(data.error || 'Could not generate a download link')
        return
      }
      window.open(data.signed_url as string, '_blank', 'noopener,noreferrer')
    } catch {
      setLoadError('Network error opening document')
    } finally {
      setOpeningId(null)
    }
  }

  const requestRemove = (docId: string, fileName: string, docType: string) => {
    const label = `${getDocumentTypeLabel(docType)} — ${fileName}`
    setConfirmingRemove({ id: docId, label })
  }

  const performRemove = async () => {
    if (!confirmingRemove) return
    const docId = confirmingRemove.id
    setConfirmingRemove(null)
    setRemovingId(docId)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/documents/${docId}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(data.error || 'Failed to remove document')
        return
      }
      setDocuments((prev) => (prev || []).filter((d) => d.id !== docId))
    } catch {
      setLoadError('Network error removing document')
    } finally {
      setRemovingId(null)
    }
  }

  const currentTypeDef = DOCUMENT_TYPE_DEFINITIONS.find((d) => d.value === documentType)

  return (
    <ManagerCard
      title="Verification Documents"
      description={`Upload documents that help the platform admin verify your ${term(vertical, 'market').toLowerCase()} is legitimate. Keeps your ${term(vertical, 'booth').toLowerCase()}-rental payments safe and speeds up approval. Files are private — only you and the platform admin can view them.`}
    >
      {/* Upload form */}
      <form
        onSubmit={handleUpload}
        style={{
          padding: spacing.sm,
          backgroundColor: colors.surfaceBase,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.sm,
          marginBottom: spacing.md,
        }}
      >
        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>Document type *</label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value as MarketDocumentType | '')}
            disabled={uploading}
            style={inputStyle}
          >
            <option value="">— Select —</option>
            {DOCUMENT_TYPE_DEFINITIONS.map((def) => (
              <option key={def.value} value={def.value}>
                {def.label}
              </option>
            ))}
          </select>
          {currentTypeDef && (
            <p style={{
              margin: `${spacing['3xs']} 0 0 0`,
              fontSize: typography.sizes.xs,
              color: colors.textMuted,
              lineHeight: 1.5,
            }}>
              {currentTypeDef.helpText}
            </p>
          )}
        </div>

        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>File *</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
            disabled={uploading}
            style={{ ...inputStyle, padding: spacing['2xs'] }}
          />
          <p style={{
            margin: `${spacing['3xs']} 0 0 0`,
            fontSize: typography.sizes.xs,
            color: colors.textMuted,
          }}>
            PDF, JPG, PNG, or WebP. Max {formatFileSize(MAX_DOCUMENT_BYTES)}.
          </p>
        </div>

        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={uploading}
            maxLength={MAX_NOTES_CHARS}
            rows={2}
            placeholder="Short label — especially useful for 'Other'"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{
            textAlign: 'right',
            fontSize: typography.sizes.xs,
            color: colors.textMuted,
          }}>
            {notes.length}/{MAX_NOTES_CHARS}
          </div>
        </div>

        {uploadError && (
          <div style={errorBoxStyle}>{uploadError}</div>
        )}
        {uploadSuccess && (
          <div style={successBoxStyle}>{uploadSuccess}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={uploading || !documentType}
            style={{
              ...primaryButtonStyle,
              opacity: uploading || !documentType ? 0.6 : 1,
              cursor: uploading || !documentType ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? 'Uploading…' : 'Upload document'}
          </button>
        </div>
      </form>

      {/* List */}
      {loadError && (
        <div style={errorBoxStyle}>{loadError}</div>
      )}

      {documents === null ? (
        <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
          Loading documents…
        </div>
      ) : documents.length === 0 ? (
        <div style={{
          padding: spacing.sm,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          fontStyle: 'italic',
        }}>
          No documents uploaded yet.
        </div>
      ) : (
        <ul style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.xs,
        }}>
          {documents.map((doc) => (
            <li key={doc.id}>
              <div style={{
                padding: spacing.sm,
                backgroundColor: colors.surfaceBase,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: spacing.xs,
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: '1 1 250px', minWidth: 0 }}>
                  <div style={{
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary,
                  }}>
                    {getDocumentTypeLabel(doc.document_type)}
                  </div>
                  <div style={{
                    fontSize: typography.sizes.xs,
                    color: colors.textMuted,
                    overflowWrap: 'anywhere',
                  }}>
                    {doc.file_name} · {formatFileSize(doc.file_size_bytes)} · uploaded {formatUploadedAt(doc.uploaded_at)}
                  </div>
                  {doc.notes && (
                    <div style={{
                      fontSize: typography.sizes.xs,
                      color: colors.textPrimary,
                      marginTop: spacing['3xs'],
                      fontStyle: 'italic',
                    }}>
                      “{doc.notes}”
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: spacing['2xs'] }}>
                  <button
                    onClick={() => handleView(doc.id)}
                    disabled={openingId === doc.id || removingId === doc.id}
                    style={secondaryButtonStyle}
                  >
                    {openingId === doc.id ? 'Opening…' : 'View'}
                  </button>
                  <button
                    onClick={() => requestRemove(doc.id, doc.file_name, doc.document_type)}
                    disabled={removingId === doc.id || openingId === doc.id}
                    style={dangerButtonStyle}
                  >
                    {removingId === doc.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmingRemove}
        title="Remove this document?"
        message={`Remove ${confirmingRemove?.label ?? 'this document'}? The file will be deleted from storage and can't be recovered. You can upload a replacement afterward.`}
        variant="danger"
        confirmLabel="Remove"
        onConfirm={performRemove}
        onCancel={() => setConfirmingRemove(null)}
      />
    </ManagerCard>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  color: colors.textPrimary,
  marginBottom: spacing['3xs'],
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: `${spacing.xs} ${spacing.sm}`,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  backgroundColor: 'white',
  color: colors.textPrimary,
  boxSizing: 'border-box',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.md}`,
  backgroundColor: colors.primary,
  color: 'white',
  border: 'none',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: `${spacing['3xs']} ${spacing.sm}`,
  backgroundColor: 'transparent',
  color: colors.primary,
  border: `1px solid ${colors.primary}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.xs,
  fontWeight: typography.weights.semibold,
  cursor: 'pointer',
}

const dangerButtonStyle: React.CSSProperties = {
  padding: `${spacing['3xs']} ${spacing.sm}`,
  backgroundColor: 'transparent',
  color: '#991b1b',
  border: '1px solid #991b1b',
  borderRadius: radius.sm,
  fontSize: typography.sizes.xs,
  fontWeight: typography.weights.semibold,
  cursor: 'pointer',
}

const errorBoxStyle: React.CSSProperties = {
  padding: spacing.sm,
  marginBottom: spacing.sm,
  backgroundColor: '#f8d7da',
  color: '#721c24',
  border: '1px solid #f5c6cb',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
}

const successBoxStyle: React.CSSProperties = {
  padding: spacing.sm,
  marginBottom: spacing.sm,
  backgroundColor: '#d4edda',
  color: '#155724',
  border: '1px solid #c3e6cb',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
}
