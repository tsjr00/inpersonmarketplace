'use client'

import { useState, useEffect, useCallback } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import CategoryDocumentUpload from './CategoryDocumentUpload'
import COIUpload from './COIUpload'
import ProhibitedItemsModal from './ProhibitedItemsModal'
import type { Category } from '@/lib/constants'

interface OnboardingStatus {
  gate1: {
    businessDocsUploaded: boolean
    status: string
    notes: string | null
    reviewedAt: string | null
  }
  gate2: {
    requestedCategories: string[]
    categoryStatuses: Record<string, {
      requirementLevel: string
      status: string
      label: string
      documents: unknown[]
    }>
  }
  gate3: {
    coiStatus: string
    coiDocuments: Array<{ url: string; filename: string; uploaded_at: string }>
    coiVerifiedAt: string | null
  }
  prohibitedItemsAcknowledged: boolean
  canSubmitForApproval: boolean
  canPublishListings: boolean
  overallProgress: number
}

interface Props {
  vertical: string
  vendorStatus: string
}

export default function OnboardingChecklist({ vendorStatus }: Props) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedGate, setExpandedGate] = useState<number | null>(null)
  const [showProhibitedItems, setShowProhibitedItems] = useState(false)
  const [uploadingBusinessDoc, setUploadingBusinessDoc] = useState(false)
  const [businessDocError, setBusinessDocError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/vendor/onboarding/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch {
      // Silent fail — checklist just won't show
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  if (loading) {
    return (
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        textAlign: 'center',
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
      }}>
        Loading onboarding status...
      </div>
    )
  }

  if (!status) return null

  // If fully onboarded, show condensed success
  if (status.canPublishListings) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: radius.md,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
      }}>
        <span style={{ fontSize: typography.sizes.lg }}>&#10003;</span>
        <span style={{ fontSize: typography.sizes.sm, color: '#166534', fontWeight: typography.weights.medium }}>
          Onboarding complete — your listings can go live!
        </span>
      </div>
    )
  }

  const gates = [
    {
      number: 1,
      title: 'Business Verification',
      description: 'Upload business formation documents for review',
      status: status.gate1.status,
      complete: status.gate1.status === 'approved',
    },
    {
      number: 2,
      title: 'Category Authorization',
      description: 'Submit required permits for your product categories',
      status: getCategoryGateStatus(status),
      complete: getCategoryGateComplete(status),
    },
    {
      number: 3,
      title: 'Market Ready',
      description: 'Upload Certificate of Insurance (COI)',
      status: status.gate3.coiStatus,
      complete: status.gate3.coiStatus === 'approved',
    },
  ]

  const handleBusinessDocUpload = async (file: File) => {
    setUploadingBusinessDoc(true)
    setBusinessDocError(null)
    try {
      const formData = new FormData()
      formData.append('document', file)
      const res = await fetch('/api/vendor/onboarding/documents', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }
      await fetchStatus()
    } catch (err) {
      setBusinessDocError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingBusinessDoc(false)
    }
  }

  const handleAcknowledgeProhibited = async () => {
    try {
      const res = await fetch('/api/vendor/onboarding/acknowledge-prohibited-items', {
        method: 'POST',
      })
      if (res.ok) {
        setShowProhibitedItems(false)
        await fetchStatus()
      }
    } catch {
      // Silent
    }
  }

  return (
    <div style={{
      backgroundColor: colors.surfaceElevated,
      border: `2px solid ${colors.primary}`,
      borderRadius: radius.lg,
      overflow: 'hidden',
      boxShadow: shadows.md,
    }}>
      {/* Header */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.primaryLight,
        borderBottom: `1px solid ${colors.primary}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{
            margin: 0,
            color: colors.primaryDark,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.bold,
          }}>
            Vendor Onboarding
          </h3>
          <span style={{
            padding: `${spacing['3xs']} ${spacing.xs}`,
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
            color: colors.primaryDark,
          }}>
            {status.overallProgress}% complete
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          marginTop: spacing.xs,
          height: 6,
          backgroundColor: colors.surfaceMuted,
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${status.overallProgress}%`,
            backgroundColor: colors.primary,
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Prohibited items acknowledgment (if not done) */}
      {!status.prohibitedItemsAcknowledged && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#fffbeb',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, color: '#92400e' }}>
              Review Prohibited Items Policy
            </div>
            <div style={{ fontSize: typography.sizes.xs, color: '#78350f', marginTop: 2 }}>
              Required before submitting for approval
            </div>
          </div>
          <button
            onClick={() => setShowProhibitedItems(true)}
            style={{
              padding: `${spacing['3xs']} ${spacing.xs}`,
              backgroundColor: '#d97706',
              color: 'white',
              border: 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.medium,
              cursor: 'pointer',
            }}
          >
            Review & Acknowledge
          </button>
        </div>
      )}

      {/* Gates */}
      {gates.map((gate) => (
        <div key={gate.number} style={{ borderBottom: `1px solid ${colors.border}` }}>
          {/* Gate header */}
          <button
            onClick={() => setExpandedGate(expandedGate === gate.number ? null : gate.number)}
            style={{
              width: '100%',
              padding: spacing.sm,
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              textAlign: 'left',
            }}
          >
            {/* Status icon */}
            <span style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.bold,
              flexShrink: 0,
              ...(gate.complete
                ? { backgroundColor: '#dcfce7', color: '#166534' }
                : gate.status === 'rejected'
                  ? { backgroundColor: '#fee2e2', color: '#991b1b' }
                  : gate.status === 'pending' || gate.status === 'in_review'
                    ? { backgroundColor: '#fef3c7', color: '#92400e' }
                    : { backgroundColor: colors.surfaceMuted, color: colors.textMuted }),
            }}>
              {gate.complete ? '\u2713' : gate.status === 'rejected' ? '\u2717' : gate.number}
            </span>

            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: colors.textPrimary,
              }}>
                {gate.title}
              </div>
              <div style={{
                fontSize: typography.sizes.xs,
                color: colors.textMuted,
                marginTop: 2,
              }}>
                {gate.description}
              </div>
            </div>

            {/* Expand arrow */}
            <span style={{
              color: colors.textMuted,
              fontSize: typography.sizes.sm,
              transform: expandedGate === gate.number ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform 0.2s',
            }}>
              &#9662;
            </span>
          </button>

          {/* Gate content (expanded) */}
          {expandedGate === gate.number && (
            <div style={{ padding: `0 ${spacing.sm} ${spacing.sm}` }}>
              {gate.number === 1 && (
                <Gate1Content
                  status={status}
                  uploading={uploadingBusinessDoc}
                  error={businessDocError}
                  onUpload={handleBusinessDocUpload}
                />
              )}
              {gate.number === 2 && (
                <Gate2Content status={status} onUploaded={fetchStatus} />
              )}
              {gate.number === 3 && (
                <Gate3Content status={status} onUploaded={fetchStatus} />
              )}
            </div>
          )}
        </div>
      ))}

      {/* Submit for approval button */}
      {vendorStatus !== 'approved' && status.gate1.status === 'pending' && status.canSubmitForApproval && (
        <div style={{ padding: spacing.sm, textAlign: 'center' }}>
          <div style={{
            padding: spacing.xs,
            backgroundColor: '#f0fdf4',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            color: '#166534',
          }}>
            All required documents uploaded! Your application is ready for admin review.
          </div>
        </div>
      )}

      {/* Prohibited items modal */}
      {showProhibitedItems && (
        <ProhibitedItemsModal
          onAcknowledge={handleAcknowledgeProhibited}
          onClose={() => setShowProhibitedItems(false)}
        />
      )}
    </div>
  )
}

function getCategoryGateStatus(status: OnboardingStatus): string {
  const cats = status.gate2.categoryStatuses
  const values = Object.values(cats)
  if (values.length === 0) return 'not_submitted'
  if (values.some(v => v.status === 'rejected')) return 'rejected'
  if (values.every(v => v.status === 'approved' || v.status === 'not_required')) return 'approved'
  if (values.some(v => v.status === 'pending')) return 'pending'
  return 'not_submitted'
}

function getCategoryGateComplete(status: OnboardingStatus): boolean {
  const cats = status.gate2.categoryStatuses
  return Object.values(cats).every(v => v.status === 'approved' || v.status === 'not_required')
}

function Gate1Content({
  status,
  uploading,
  error,
  onUpload,
}: {
  status: OnboardingStatus
  uploading: boolean
  error: string | null
  onUpload: (file: File) => void
}) {
  const docs = status.gate1.businessDocsUploaded

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      <div style={{ fontSize: typography.sizes.xs, color: colors.textSecondary }}>
        Upload your business formation documents (business license, DBA, LLC articles, etc.)
      </div>

      {docs && (
        <div style={{
          padding: spacing.xs,
          backgroundColor: '#f0fdf4',
          borderRadius: radius.sm,
          fontSize: typography.sizes.xs,
          color: '#166534',
        }}>
          Business documents uploaded
        </div>
      )}

      {status.gate1.status === 'rejected' && status.gate1.notes && (
        <div style={{
          padding: spacing.xs,
          backgroundColor: '#fee2e2',
          borderRadius: radius.sm,
          fontSize: typography.sizes.xs,
          color: '#991b1b',
        }}>
          <strong>Feedback:</strong> {status.gate1.notes}
        </div>
      )}

      {status.gate1.status !== 'approved' && (
        <div>
          <label
            style={{
              display: 'inline-block',
              padding: `${spacing['3xs']} ${spacing.xs}`,
              backgroundColor: colors.surfaceElevated,
              color: colors.textSecondary,
              border: `1px dashed ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              cursor: uploading ? 'wait' : 'pointer',
            }}
          >
            {uploading ? 'Uploading...' : docs ? '+ Upload Additional' : '+ Upload Document'}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onUpload(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      )}

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

function Gate2Content({
  status,
  onUploaded,
}: {
  status: OnboardingStatus
  onUploaded: () => void
}) {
  const categories = status.gate2.requestedCategories

  if (categories.length === 0) {
    return (
      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
        No categories selected yet. Update your vendor profile to select product categories.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {categories.map((cat) => (
        <CategoryDocumentUpload
          key={cat}
          category={cat as Category}
          verification={status.gate2.categoryStatuses[cat] as unknown as {
            status: string
            doc_type?: string
            documents?: Array<{ url: string; filename: string; doc_type: string; uploaded_at: string }>
            reviewed_at?: string
            notes?: string
          }}
          onUploaded={onUploaded}
        />
      ))}
    </div>
  )
}

function Gate3Content({
  status,
  onUploaded,
}: {
  status: OnboardingStatus
  onUploaded: () => void
}) {
  return (
    <COIUpload
      coiStatus={status.gate3.coiStatus}
      coiDocuments={status.gate3.coiDocuments}
      coiVerifiedAt={status.gate3.coiVerifiedAt}
      onUploaded={onUploaded}
    />
  )
}
