'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DOCUMENT_TYPE_DEFINITIONS,
  getDocumentTypeLabel,
  type MarketDocumentRow,
} from '@/lib/markets/document-types'

/**
 * Admin-side, read-only viewer for a market's verification documents.
 *
 * Rendered in two places that both need admin auth + signed-URL access:
 *   - Platform admin detail page (apps/web/src/app/admin/markets/[id]/page.tsx)
 *   - Vertical admin edit form (apps/web/src/app/[vertical]/admin/markets/page.tsx)
 *
 * Fetches /api/admin/markets/[id]/documents on mount; clicking View
 * fetches /api/admin/markets/[id]/documents/[documentId] for a fresh
 * signed URL (~1hr TTL) and opens in a new tab.
 *
 * Read-only: no upload, no delete. Manager owns the evidence trail
 * (NEW-7 design). Admin escalates fraudulent uploads by rejecting the
 * market or contacting the manager off-platform.
 *
 * Plain DOM styling (no design-tokens import) so it renders the same
 * way under both admin surfaces — platform admin is a server component
 * shell with inline-styled children, vertical admin uses design tokens
 * but accepts plain HTML inside the edit form. Compact + neutral.
 */

interface MarketDocumentsViewerProps {
  marketId: string
  /** Header text. Defaults to a stock label; callers can customize per
   *  surface (e.g., "Verification Documents (manager-uploaded)"). */
  heading?: string
  /** When true, shows the empty state with copy explaining what the
   *  manager would upload. When false, hides the component entirely
   *  on empty (compact mode for surfaces that already explain context). */
  showEmptyState?: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadedAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function MarketDocumentsViewer({
  marketId,
  heading = 'Verification Documents',
  showEmptyState = true,
}: MarketDocumentsViewerProps) {
  const [documents, setDocuments] = useState<MarketDocumentRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/markets/${marketId}/documents`)
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

  const handleView = async (docId: string) => {
    setOpeningId(docId)
    try {
      const res = await fetch(`/api/admin/markets/${marketId}/documents/${docId}`)
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

  // Loading
  if (documents === null && !loadError) {
    return (
      <div style={cardStyle}>
        <div style={headingStyle}>{heading}</div>
        <div style={mutedStyle}>Loading documents…</div>
      </div>
    )
  }

  // Empty — hide entirely if showEmptyState=false
  if ((documents || []).length === 0) {
    if (!showEmptyState) return null
    return (
      <div style={cardStyle}>
        <div style={headingStyle}>{heading}</div>
        {loadError ? (
          <div style={errorStyle}>{loadError}</div>
        ) : (
          <div style={mutedStyle}>
            No verification documents uploaded yet. The manager can upload entity filings,
            insurance certificates, venue proof, etc. from their dashboard.
          </div>
        )}
      </div>
    )
  }

  // List
  return (
    <div style={cardStyle}>
      <div style={headerRowStyle}>
        <div style={headingStyle}>{heading}</div>
        <div style={countStyle}>{documents!.length} file{documents!.length === 1 ? '' : 's'}</div>
      </div>

      {loadError && <div style={errorStyle}>{loadError}</div>}

      {/* Group by document_type for at-a-glance scan; ordering matches
          DOCUMENT_TYPE_DEFINITIONS (legal_entity_filing first, "other" last). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {DOCUMENT_TYPE_DEFINITIONS.map((def) => {
          const inThisType = (documents || []).filter((d) => d.document_type === def.value)
          if (inThisType.length === 0) return null
          return (
            <div key={def.value}>
              <div style={typeHeadingStyle}>{def.label}</div>
              <ul style={listStyle}>
                {inThisType.map((doc) => (
                  <li key={doc.id} style={rowStyle}>
                    <div style={{ flex: '1 1 250px', minWidth: 0 }}>
                      <div style={fileNameStyle}>{doc.file_name}</div>
                      <div style={metaStyle}>
                        {formatFileSize(doc.file_size_bytes)} · uploaded {formatUploadedAt(doc.uploaded_at)}
                      </div>
                      {doc.notes && (
                        <div style={notesStyle}>“{doc.notes}”</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleView(doc.id)}
                      disabled={openingId === doc.id}
                      style={viewButtonStyle}
                    >
                      {openingId === doc.id ? 'Opening…' : 'View'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        {/* Catch-all for any document_type not in the definitions list
            (shouldn't happen given the DB CHECK constraint, but defensive). */}
        {(() => {
          const known = new Set(DOCUMENT_TYPE_DEFINITIONS.map((d) => d.value as string))
          const unknown = (documents || []).filter((d) => !known.has(d.document_type as string))
          if (unknown.length === 0) return null
          return (
            <div>
              <div style={typeHeadingStyle}>Other (unknown type)</div>
              <ul style={listStyle}>
                {unknown.map((doc) => (
                  <li key={doc.id} style={rowStyle}>
                    <div style={{ flex: '1 1 250px', minWidth: 0 }}>
                      <div style={fileNameStyle}>{doc.file_name}</div>
                      <div style={metaStyle}>
                        {getDocumentTypeLabel(doc.document_type)} · {formatFileSize(doc.file_size_bytes)} · uploaded {formatUploadedAt(doc.uploaded_at)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleView(doc.id)}
                      disabled={openingId === doc.id}
                      style={viewButtonStyle}
                    >
                      {openingId === doc.id ? 'Opening…' : 'View'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// --- Styles (plain CSS-in-JS, neutral colors so the component fits both
//      platform admin's blue/white theme and vertical admin's design-tokens
//      surface). ---

const cardStyle: React.CSSProperties = {
  padding: 16,
  backgroundColor: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  marginBottom: 12,
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 12,
}

const headingStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: '#1a1a1a',
}

const countStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#737373',
}

const typeHeadingStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 4,
  paddingBottom: 4,
  borderBottom: '1px solid #f3f4f6',
}

const listStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 10px',
  backgroundColor: '#fafafa',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  gap: 12,
  flexWrap: 'wrap',
}

const fileNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: '#1a1a1a',
  overflowWrap: 'anywhere',
}

const metaStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#737373',
}

const notesStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#374151',
  marginTop: 2,
  fontStyle: 'italic',
}

const viewButtonStyle: React.CSSProperties = {
  padding: '4px 12px',
  backgroundColor: 'transparent',
  color: '#2d5016',
  border: '1px solid #2d5016',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const mutedStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#737373',
  lineHeight: 1.5,
}

const errorStyle: React.CSSProperties = {
  padding: 10,
  marginBottom: 8,
  backgroundColor: '#fef2f2',
  color: '#991b1b',
  border: '1px solid #fecaca',
  borderRadius: 6,
  fontSize: 13,
}
