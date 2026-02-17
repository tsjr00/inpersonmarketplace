'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { DOC_TYPE_LABELS, type DocType } from '@/lib/onboarding/category-requirements'

interface Verification {
  status: string
  documents: Array<{ url: string; filename: string; type: string; uploaded_at: string }>
  notes: string | null
  reviewed_at: string | null
  requested_categories: string[]
  category_verifications: Record<string, {
    status: string
    doc_type?: string
    documents?: Array<{ url: string; filename: string; doc_type: string }>
    notes?: string
    reviewed_at?: string
  }>
  coi_status: string
  coi_documents: Array<{ url: string; filename: string; uploaded_at: string }>
  coi_verified_at: string | null
  prohibited_items_acknowledged_at: string | null
  onboarding_completed_at: string | null
}

interface Props {
  vendorId: string
  verification: Verification | null
  onRefresh: () => void
}

export default function VendorVerificationPanel({ vendorId, verification, onRefresh }: Props) {
  const [notes, setNotes] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [categoryNotes, setCategoryNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    setNotes('')
    setCategoryNotes({})
  }, [vendorId])

  if (!verification) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceMuted,
        borderRadius: radius.md,
        fontSize: typography.sizes.sm,
        color: colors.textMuted,
      }}>
        No verification record found for this vendor.
      </div>
    )
  }

  const handleAction = async (endpoint: string, body: Record<string, unknown>) => {
    const key = `${endpoint}-${JSON.stringify(body)}`
    setActionLoading(key)
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Action failed')
      }
      onRefresh()
    } catch {
      alert('Network error')
    } finally {
      setActionLoading(null)
    }
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      pending: { bg: '#fef3c7', text: '#92400e' },
      in_review: { bg: '#dbeafe', text: '#1e40af' },
      approved: { bg: '#dcfce7', text: '#166534' },
      rejected: { bg: '#fee2e2', text: '#991b1b' },
      not_submitted: { bg: '#f3f4f6', text: '#6b7280' },
    }
    const s = styles[status] || styles.not_submitted
    return (
      <span style={{
        padding: `2px ${spacing.xs}`,
        backgroundColor: s.bg,
        color: s.text,
        borderRadius: radius.sm,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.medium,
      }}>
        {status.replace('_', ' ')}
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      {/* Onboarding completion status */}
      {verification.onboarding_completed_at && (
        <div style={{
          padding: spacing.xs,
          backgroundColor: colors.primaryLight,
          border: `1px solid ${colors.primary}`,
          borderRadius: radius.md,
          fontSize: typography.sizes.sm,
          color: colors.primaryDark,
          fontWeight: typography.weights.medium,
        }}>
          Onboarding completed on {new Date(verification.onboarding_completed_at).toLocaleDateString()}
        </div>
      )}

      {/* Gate 1: Business Verification */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
          <h4 style={{ margin: 0, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
            Gate 1: Business Verification
          </h4>
          {statusBadge(verification.status)}
        </div>

        {/* Business documents */}
        {verification.documents.length > 0 ? (
          <div style={{ marginBottom: spacing.xs }}>
            <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing['3xs'] }}>Documents:</div>
            {verification.documents.map((doc, i) => (
              <a
                key={i}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  marginRight: spacing['2xs'],
                  marginBottom: spacing['3xs'],
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: colors.primaryLight,
                  color: colors.primaryDark,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                  textDecoration: 'none',
                }}
              >
                {doc.filename || `Document ${i + 1}`}
              </a>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing.xs }}>
            No business documents uploaded yet.
          </div>
        )}

        {/* Prohibited items acknowledgment */}
        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing.xs }}>
          Prohibited items: {verification.prohibited_items_acknowledged_at
            ? <span style={{ color: colors.primaryDark }}>Acknowledged {new Date(verification.prohibited_items_acknowledged_at).toLocaleDateString()}</span>
            : <span style={{ color: '#991b1b' }}>Not acknowledged</span>
          }
        </div>

        {verification.status !== 'approved' && verification.documents.length > 0 && (
          <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                style={{
                  width: '100%',
                  padding: spacing['3xs'],
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                }}
              />
            </div>
            <button
              onClick={() => handleAction('verify', { action: 'approve', notes })}
              disabled={!!actionLoading}
              style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: colors.primaryDark,
                color: 'white',
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                cursor: 'pointer',
              }}
            >
              Approve
            </button>
            <button
              onClick={() => handleAction('verify', { action: 'reject', notes })}
              disabled={!!actionLoading}
              style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: '#991b1b',
                color: 'white',
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                cursor: 'pointer',
              }}
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Gate 2: Category Authorization */}
      {verification.requested_categories.length > 0 && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: colors.surfaceElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
        }}>
          <h4 style={{ margin: `0 0 ${spacing.xs} 0`, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
            Gate 2: Category Authorization
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            {verification.requested_categories.map((cat) => {
              const catVer = verification.category_verifications[cat]
              const catStatus = catVer?.status || 'not_submitted'
              const docs = catVer?.documents || []

              return (
                <div key={cat} style={{
                  padding: spacing.xs,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.sm,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, color: colors.textPrimary }}>
                      {cat}
                    </span>
                    {statusBadge(catStatus)}
                  </div>

                  {docs.length > 0 && (
                    <div style={{ marginTop: spacing['3xs'] }}>
                      {docs.map((doc, i) => (
                        <a
                          key={i}
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-block',
                            marginRight: spacing['2xs'],
                            padding: `2px ${spacing.xs}`,
                            backgroundColor: colors.primaryLight,
                            color: colors.primaryDark,
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.xs,
                            textDecoration: 'none',
                          }}
                        >
                          {doc.filename} ({DOC_TYPE_LABELS[doc.doc_type as DocType] || doc.doc_type})
                        </a>
                      ))}
                    </div>
                  )}

                  {catStatus === 'pending' && docs.length > 0 && (
                    <div style={{ marginTop: spacing['2xs'], display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={categoryNotes[cat] || ''}
                        onChange={(e) => setCategoryNotes({ ...categoryNotes, [cat]: e.target.value })}
                        placeholder="Notes"
                        style={{
                          flex: 1,
                          padding: spacing['3xs'],
                          border: `1px solid ${colors.border}`,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                        }}
                      />
                      <button
                        onClick={() => handleAction('verify-category', { category: cat, action: 'approve', notes: categoryNotes[cat] })}
                        disabled={!!actionLoading}
                        style={{
                          padding: `2px ${spacing.xs}`,
                          backgroundColor: colors.primaryDark,
                          color: 'white',
                          border: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          cursor: 'pointer',
                        }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction('verify-category', { category: cat, action: 'reject', notes: categoryNotes[cat] })}
                        disabled={!!actionLoading}
                        style={{
                          padding: `2px ${spacing.xs}`,
                          backgroundColor: '#991b1b',
                          color: 'white',
                          border: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          cursor: 'pointer',
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Gate 3: COI */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
          <h4 style={{ margin: 0, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
            Gate 3: Certificate of Insurance
          </h4>
          {statusBadge(verification.coi_status)}
        </div>

        {verification.coi_documents.length > 0 ? (
          <div style={{ marginBottom: spacing.xs }}>
            {verification.coi_documents.map((doc, i) => (
              <a
                key={i}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  marginRight: spacing['2xs'],
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: colors.primaryLight,
                  color: colors.primaryDark,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                  textDecoration: 'none',
                }}
              >
                {doc.filename || `COI ${i + 1}`}
              </a>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing.xs }}>
            No COI uploaded yet.
          </div>
        )}

        {verification.coi_status === 'pending' && verification.coi_documents.length > 0 && (
          <div style={{ display: 'flex', gap: spacing.xs }}>
            <button
              onClick={() => handleAction('verify-coi', { action: 'approve' })}
              disabled={!!actionLoading}
              style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: colors.primaryDark,
                color: 'white',
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                cursor: 'pointer',
              }}
            >
              Approve COI
            </button>
            <button
              onClick={() => handleAction('verify-coi', { action: 'reject' })}
              disabled={!!actionLoading}
              style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: '#991b1b',
                color: 'white',
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                cursor: 'pointer',
              }}
            >
              Reject COI
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
