'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import {
  getCategoryRequirement,
  requiresDocuments,
  DOC_TYPE_LABELS,
  FOOD_TRUCK_PERMIT_REQUIREMENTS,
  FOOD_TRUCK_DOC_TYPE_LABELS,
  FM_DOC_BADGES,
  FT_PERMIT_BADGES,
  VOLUNTARY_CERT_BADGES,
  GATE_TO_CERT_EQUIV,
  type DocType,
  type FoodTruckDocType,
  type BadgeConfig,
} from '@/lib/onboarding/category-requirements'
import { CERTIFICATION_TYPES, type Certification } from './CertificationsForm'
import type { Category } from '@/lib/constants'

// Gate doc status shape from /api/vendor/onboarding/status
interface GateDocStatus {
  requirementLevel: string
  status: 'not_required' | 'not_submitted' | 'pending' | 'approved' | 'rejected'
  label: string
  documents: Array<{ url: string; filename: string; doc_type: string; uploaded_at?: string }>
  required?: boolean
  notes?: string
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  not_submitted: { bg: '#f3f4f6', text: '#6b7280', label: 'Not submitted' },
  pending: { bg: '#fef3c7', text: '#92400e', label: 'Pending review' },
  approved: { bg: '#d1fae5', text: '#065f46', label: 'Approved' },
  rejected: { bg: '#fee2e2', text: '#991b1b', label: 'Needs attention' },
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]

interface Props {
  vendorId: string
  vertical: string
  currentCertifications: Certification[]
}

export default function DocumentsCertificationsSection({
  vendorId,
  vertical,
  currentCertifications,
}: Props) {
  const isFoodTruck = vertical === 'food_trucks'

  // === GATE DOCS STATE ===
  const [gateStatuses, setGateStatuses] = useState<Record<string, GateDocStatus>>({})
  const [gateItems, setGateItems] = useState<string[]>([])
  const [gateLoading, setGateLoading] = useState(true)
  const [uploadingGate, setUploadingGate] = useState<string | null>(null)
  const [gateMessage, setGateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedDocTypes, setSelectedDocTypes] = useState<Record<string, string>>({})
  const gateFileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // === CERTIFICATIONS STATE ===
  const [certifications, setCertifications] = useState<Certification[]>(currentCertifications || [])
  const [certSaving, setCertSaving] = useState(false)
  const [certMessage, setCertMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCert, setNewCert] = useState<Partial<Certification>>({ type: '', label: '', registration_number: '', state: '' })
  const [newCertFile, setNewCertFile] = useState<File | null>(null)
  const [addingWithUpload, setAddingWithUpload] = useState(false)
  const newFileInputRef = useRef<HTMLInputElement | null>(null)
  const certFileRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [uploadingCertIdx, setUploadingCertIdx] = useState<number | null>(null)

  // === FETCH GATE STATUS ===
  const fetchGateStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/vendor/onboarding/status')
      if (res.ok) {
        const data = await res.json()
        setGateStatuses(data.gate2?.categoryStatuses || {})
        setGateItems(data.gate2?.requestedCategories || [])
      }
    } catch {
      // Silent fail — section just won't show gate docs
    } finally {
      setGateLoading(false)
    }
  }, [])

  useEffect(() => { fetchGateStatus() }, [fetchGateStatus])

  // === DERIVED VALUES ===
  const requiredGateItems = isFoodTruck
    ? gateItems
    : gateItems.filter(item => requiresDocuments(item as Category))

  // Track approved gate doc types for dedup with voluntary certs
  const approvedGateDocTypes = new Set<string>()
  for (const [key, status] of Object.entries(gateStatuses)) {
    if (status.status === 'approved') {
      if (isFoodTruck) {
        approvedGateDocTypes.add(key)
      } else if (status.documents?.[0]?.doc_type) {
        approvedGateDocTypes.add(status.documents[0].doc_type)
      }
    }
  }

  // Exclude cert types already covered by approved gate docs
  const excludedCertTypes = new Set<string>()
  for (const [gateType, certType] of Object.entries(GATE_TO_CERT_EQUIV)) {
    if (approvedGateDocTypes.has(gateType)) {
      excludedCertTypes.add(certType)
    }
  }

  const availableCertTypes = CERTIFICATION_TYPES.filter(ct =>
    !excludedCertTypes.has(ct.type) && !certifications.some(c => c.type === ct.type && ct.type !== 'other')
  )

  // === GATE DOC HANDLERS ===
  const handleGateUpload = async (itemKey: string, file: File) => {
    setUploadingGate(itemKey)
    setGateMessage(null)

    const existing = gateStatuses[itemKey]
    let docType: string

    if (isFoodTruck) {
      docType = itemKey
    } else {
      docType = existing?.documents?.[0]?.doc_type
        || selectedDocTypes[itemKey]
        || getCategoryRequirement(itemKey as Category).acceptedDocTypes[0]
    }

    try {
      const formData = new FormData()
      formData.append('document', file)
      formData.append('category', itemKey)
      formData.append('doc_type', docType)

      const res = await fetch('/api/vendor/onboarding/category-documents', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      setGateMessage({ type: 'success', text: 'Document uploaded. Pending admin review.' })
      await fetchGateStatus()
    } catch (err) {
      setGateMessage({ type: 'error', text: err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      setUploadingGate(null)
    }
  }

  // === CERT HANDLERS ===
  const uploadCertDoc = async (file: File): Promise<string | null> => {
    const formData = new FormData()
    formData.append('document', file)
    try {
      const res = await fetch('/api/vendor/profile/certifications/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (res.ok && data.documentUrl) return data.documentUrl
      setCertMessage({ type: 'error', text: data.error || 'Failed to upload document' })
      return null
    } catch {
      setCertMessage({ type: 'error', text: 'Failed to upload document' })
      return null
    }
  }

  const handleUploadForExistingCert = async (index: number, file: File) => {
    setUploadingCertIdx(index)
    setCertMessage(null)
    const url = await uploadCertDoc(file)
    if (url) {
      const updated = [...certifications]
      updated[index] = { ...updated[index], document_url: url }
      setCertifications(updated)
      setCertMessage({ type: 'success', text: 'Document uploaded. Click "Save" to keep changes.' })
    }
    setUploadingCertIdx(null)
  }

  const handleAddCert = async () => {
    if (!newCert.type || !newCert.registration_number || !newCert.state) {
      setCertMessage({ type: 'error', text: 'Please fill in all required fields' })
      return
    }

    const typeInfo = CERTIFICATION_TYPES.find(t => t.type === newCert.type)
    const label = newCert.type === 'other' && newCert.label ? newCert.label : typeInfo?.label || newCert.type

    let documentUrl: string | undefined
    if (newCertFile) {
      setAddingWithUpload(true)
      const url = await uploadCertDoc(newCertFile)
      if (url) documentUrl = url
      setAddingWithUpload(false)
    }

    const cert: Certification = {
      type: newCert.type,
      label,
      registration_number: newCert.registration_number,
      state: newCert.state.toUpperCase(),
      expires_at: newCert.expires_at || undefined,
      verified: false,
      document_url: documentUrl,
    }

    setCertifications([...certifications, cert])
    setNewCert({ type: '', label: '', registration_number: '', state: '' })
    setNewCertFile(null)
    if (newFileInputRef.current) newFileInputRef.current.value = ''
    setShowAddForm(false)
    setCertMessage(null)
  }

  const handleRemoveCert = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index))
  }

  const handleSaveCerts = async () => {
    setCertSaving(true)
    setCertMessage(null)
    try {
      const res = await fetch('/api/vendor/profile/certifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certifications }),
      })
      const data = await res.json()
      if (res.ok) {
        setCertMessage({ type: 'success', text: 'Certifications saved successfully!' })
      } else {
        setCertMessage({ type: 'error', text: data.error || 'Failed to save' })
      }
    } catch {
      setCertMessage({ type: 'error', text: 'Failed to save certifications' })
    } finally {
      setCertSaving(false)
    }
  }

  // === HELPERS ===
  const getGateItemInfo = (key: string) => {
    if (isFoodTruck) {
      const permit = FOOD_TRUCK_PERMIT_REQUIREMENTS.find(p => p.docType === key)
      return {
        name: permit?.label || FOOD_TRUCK_DOC_TYPE_LABELS[key as FoodTruckDocType] || key,
        description: permit?.description || '',
        isRequired: permit?.required ?? true,
      }
    }
    const req = getCategoryRequirement(key as Category)
    return { name: key, description: req.description, isRequired: true }
  }

  const getGateBadge = (key: string, docStatus: GateDocStatus): BadgeConfig | null => {
    if (isFoodTruck) return FT_PERMIT_BADGES[key as FoodTruckDocType] || null
    const docType = docStatus.documents?.[0]?.doc_type
    if (!docType) return null
    return (FM_DOC_BADGES as Record<string, BadgeConfig>)[docType] || null
  }

  const getFileExtLabel = (url: string) => {
    if (url.endsWith('.pdf')) return 'PDF'
    if (url.endsWith('.png')) return 'PNG'
    return 'JPG'
  }

  // === RENDER ===
  return (
    <div style={{
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      border: `1px solid ${colors.border}`,
    }}>
      <h2 style={{
        margin: `0 0 ${spacing.xs} 0`,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        Documents & Certifications
      </h2>
      <p style={{
        margin: `0 0 ${spacing.md} 0`,
        fontSize: typography.sizes.sm,
        color: colors.textSecondary,
      }}>
        Your required permits and optional certifications in one place. Approved documents appear as badges on your public profile.
      </p>

      {/* ==================== REQUIRED DOCUMENTS ==================== */}
      {gateLoading ? (
        <div style={{
          padding: spacing.sm,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          textAlign: 'center',
          marginBottom: spacing.md,
        }}>
          Loading required documents...
        </div>
      ) : requiredGateItems.length > 0 ? (
        <div style={{ marginBottom: spacing.md }}>
          <h3 style={{
            margin: `0 0 ${spacing.xs} 0`,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
          }}>
            Required Documents
          </h3>

          {gateMessage && (
            <div style={{
              padding: spacing.xs,
              marginBottom: spacing.xs,
              borderRadius: radius.sm,
              backgroundColor: gateMessage.type === 'success' ? '#d1fae5' : '#fee2e2',
              color: gateMessage.type === 'success' ? '#065f46' : '#991b1b',
              fontSize: typography.sizes.xs,
            }}>
              {gateMessage.text}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            {requiredGateItems.map(key => {
              const docStatus = gateStatuses[key] || { status: 'not_submitted' as const, documents: [], label: '', requirementLevel: '' }
              if (docStatus.status === 'not_required') return null

              const info = getGateItemInfo(key)
              const statusStyle = STATUS_STYLES[docStatus.status] || STATUS_STYLES.not_submitted
              const badge = docStatus.status === 'approved' ? getGateBadge(key, docStatus) : null
              const isUploading = uploadingGate === key
              const docs = (docStatus.documents || []) as Array<{ url: string; filename: string; doc_type: string }>

              // Doc type selector for FM categories with multiple accepted types
              const requirement = !isFoodTruck ? getCategoryRequirement(key as Category) : null
              const needsDocTypeSelector = requirement && requirement.acceptedDocTypes.length > 1
                && docStatus.status !== 'approved' && docs.length === 0

              return (
                <div key={key} style={{
                  padding: spacing.sm,
                  backgroundColor: colors.surfaceMuted,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                }}>
                  {/* Header: name + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: typography.sizes.sm,
                        fontWeight: typography.weights.semibold,
                        color: colors.textPrimary,
                      }}>
                        {info.name}
                        {!info.isRequired && (
                          <span style={{
                            fontSize: typography.sizes.xs,
                            color: colors.textMuted,
                            fontWeight: typography.weights.normal,
                            marginLeft: spacing['2xs'],
                          }}>
                            (recommended)
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: typography.sizes.xs,
                        color: colors.textMuted,
                        marginTop: spacing['3xs'],
                      }}>
                        {info.description}
                      </div>
                    </div>
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.text,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.medium,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      {statusStyle.label}
                    </span>
                  </div>

                  {/* Badge preview (when approved) */}
                  {badge && docStatus.status === 'approved' && (
                    <div style={{
                      marginTop: spacing.xs,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: spacing['2xs'],
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: badge.bg,
                      color: badge.color,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                    }}>
                      <span>{badge.icon}</span>
                      <span>{badge.label}</span>
                      <span style={{ color: colors.textMuted, fontWeight: typography.weights.normal }}>
                        — shows on profile
                      </span>
                    </div>
                  )}

                  {/* Rejection notes */}
                  {docStatus.status === 'rejected' && docStatus.notes && (
                    <div style={{
                      marginTop: spacing.xs,
                      padding: spacing.xs,
                      backgroundColor: '#fee2e2',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      color: '#991b1b',
                    }}>
                      <strong>Feedback:</strong> {docStatus.notes}
                    </div>
                  )}

                  {/* Uploaded documents */}
                  {docs.length > 0 && (
                    <div style={{ marginTop: spacing.xs, display: 'flex', flexWrap: 'wrap', gap: spacing['2xs'] }}>
                      {docs.map((doc, i) => (
                        <a
                          key={i}
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
                      ))}
                    </div>
                  )}

                  {/* Doc type selector (FM, multiple accepted types, not yet submitted) */}
                  {needsDocTypeSelector && (
                    <div style={{ marginTop: spacing.xs }}>
                      <label style={{
                        fontSize: typography.sizes.xs,
                        color: colors.textSecondary,
                        fontWeight: typography.weights.medium,
                      }}>
                        Document type:
                      </label>
                      <div style={{ display: 'flex', gap: spacing['2xs'], marginTop: spacing['3xs'], flexWrap: 'wrap' }}>
                        {requirement.acceptedDocTypes.map(dt => (
                          <button
                            key={dt}
                            type="button"
                            onClick={() => setSelectedDocTypes(prev => ({ ...prev, [key]: dt }))}
                            style={{
                              padding: `${spacing['3xs']} ${spacing.xs}`,
                              backgroundColor: selectedDocTypes[key] === dt ? colors.primaryLight : colors.surfaceElevated,
                              color: selectedDocTypes[key] === dt ? colors.primaryDark : colors.textSecondary,
                              border: `1px solid ${selectedDocTypes[key] === dt ? colors.primaryDark : colors.border}`,
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

                  {/* Upload button */}
                  <div style={{ marginTop: spacing.xs }}>
                    <button
                      type="button"
                      onClick={() => gateFileRefs.current[key]?.click()}
                      disabled={isUploading || (!!needsDocTypeSelector && !selectedDocTypes[key])}
                      style={{
                        padding: `${spacing['3xs']} ${spacing.xs}`,
                        backgroundColor: isUploading ? colors.surfaceMuted : colors.surfaceElevated,
                        color: colors.textSecondary,
                        border: `1px dashed ${colors.border}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        cursor: isUploading || (!!needsDocTypeSelector && !selectedDocTypes[key]) ? 'not-allowed' : 'pointer',
                        opacity: (!!needsDocTypeSelector && !selectedDocTypes[key]) ? 0.5 : 1,
                      }}
                    >
                      {isUploading ? 'Uploading...'
                        : docs.length > 0
                          ? docStatus.status === 'approved' ? 'Upload Renewal' : '+ Upload Additional'
                          : '+ Upload Document'}
                    </button>
                    <input
                      ref={el => { gateFileRefs.current[key] = el }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleGateUpload(key, file)
                        e.target.value = ''
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : !gateLoading ? (
        <div style={{
          padding: spacing.sm,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          marginBottom: spacing.md,
        }}>
          No required documents for your categories.
        </div>
      ) : null}

      {/* ==================== OPTIONAL CERTIFICATIONS ==================== */}
      <div>
        <h3 style={{
          margin: `0 0 ${spacing.xs} 0`,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Optional Certifications
        </h3>
        <p style={{
          margin: `0 0 ${spacing.sm} 0`,
          fontSize: typography.sizes.xs,
          color: colors.textMuted,
        }}>
          Add certifications to show badges on your public profile. These are voluntary — not required for selling.
        </p>

        {certMessage && (
          <div style={{
            padding: spacing.xs,
            marginBottom: spacing.sm,
            borderRadius: radius.sm,
            backgroundColor: certMessage.type === 'success' ? '#d1fae5' : '#fee2e2',
            color: certMessage.type === 'success' ? '#065f46' : '#991b1b',
            fontSize: typography.sizes.xs,
          }}>
            {certMessage.text}
          </div>
        )}

        {/* Existing certifications */}
        {certifications.length > 0 && (
          <div style={{ marginBottom: spacing.sm }}>
            {certifications.map((cert, index) => {
              const badgeConfig = VOLUNTARY_CERT_BADGES[cert.type] || VOLUNTARY_CERT_BADGES.other
              const isUploading = uploadingCertIdx === index

              return (
                <div key={index} style={{
                  padding: spacing.sm,
                  marginBottom: spacing.xs,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.border}`,
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: spacing.xs,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: spacing['2xs'],
                        padding: `${spacing['3xs']} ${spacing.xs}`,
                        backgroundColor: badgeConfig.bg,
                        color: badgeConfig.color,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold,
                        marginBottom: spacing['3xs'],
                      }}>
                        <span>{badgeConfig.icon}</span>
                        <span>{cert.label}</span>
                      </div>
                      <div style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>
                        #{cert.registration_number} &bull; {cert.state}
                        {cert.expires_at && ` \u2022 Expires: ${new Date(cert.expires_at).toLocaleDateString()}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveCert(index)}
                      style={{
                        padding: spacing['3xs'],
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: colors.textMuted,
                        cursor: 'pointer',
                        fontSize: typography.sizes.lg,
                        lineHeight: 1,
                      }}
                      title="Remove certification"
                    >
                      &times;
                    </button>
                  </div>

                  {/* Document row */}
                  <div style={{ marginTop: spacing.xs, display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                    {cert.document_url ? (
                      <>
                        <a
                          href={cert.document_url}
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
                          {getFileExtLabel(cert.document_url)} attached — View
                        </a>
                        <button
                          onClick={() => certFileRefs.current[index]?.click()}
                          disabled={isUploading}
                          style={{
                            padding: `${spacing['3xs']} ${spacing.xs}`,
                            backgroundColor: 'transparent',
                            color: colors.textMuted,
                            border: `1px solid ${colors.border}`,
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.xs,
                            cursor: isUploading ? 'wait' : 'pointer',
                          }}
                        >
                          {isUploading ? 'Uploading...' : 'Replace'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => certFileRefs.current[index]?.click()}
                        disabled={isUploading}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: colors.surfaceElevated,
                          color: colors.textSecondary,
                          border: `1px dashed ${colors.border}`,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          cursor: isUploading ? 'wait' : 'pointer',
                        }}
                      >
                        {isUploading ? 'Uploading...' : '+ Attach Document'}
                      </button>
                    )}
                    <input
                      ref={el => { certFileRefs.current[index] = el }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleUploadForExistingCert(index, file)
                        e.target.value = ''
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Add certification form */}
        {showAddForm ? (
          <div style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.sm,
            marginBottom: spacing.sm,
          }}>
            <h4 style={{
              margin: `0 0 ${spacing.sm} 0`,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
            }}>
              Add Certification
            </h4>

            {/* Type selection */}
            <div style={{ marginBottom: spacing.sm }}>
              <label style={{
                display: 'block',
                marginBottom: spacing['2xs'],
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
              }}>
                Certification Type *
              </label>
              <select
                value={newCert.type}
                onChange={(e) => setNewCert({ ...newCert, type: e.target.value, label: '' })}
                style={{
                  width: '100%',
                  padding: spacing.xs,
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.border}`,
                  fontSize: typography.sizes.base,
                  minHeight: 44,
                }}
              >
                <option value="">Select type...</option>
                {availableCertTypes.map(type => (
                  <option key={type.type} value={type.type}>
                    {(VOLUNTARY_CERT_BADGES[type.type] || VOLUNTARY_CERT_BADGES.other).icon} {type.label}
                  </option>
                ))}
              </select>
              {newCert.type && (
                <p style={{
                  margin: `${spacing['2xs']} 0 0 0`,
                  fontSize: typography.sizes.xs,
                  color: colors.textMuted,
                }}>
                  {availableCertTypes.find(t => t.type === newCert.type)?.description}
                </p>
              )}
            </div>

            {/* Custom label for "other" */}
            {newCert.type === 'other' && (
              <div style={{ marginBottom: spacing.sm }}>
                <label style={{
                  display: 'block',
                  marginBottom: spacing['2xs'],
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.medium,
                }}>
                  Certification Name *
                </label>
                <input
                  type="text"
                  value={newCert.label || ''}
                  onChange={(e) => setNewCert({ ...newCert, label: e.target.value })}
                  placeholder="e.g., Food Handler Certificate"
                  style={{
                    width: '100%',
                    padding: spacing.xs,
                    borderRadius: radius.sm,
                    border: `1px solid ${colors.border}`,
                    fontSize: typography.sizes.base,
                    minHeight: 38,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Registration # + State */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px',
              gap: spacing.sm,
              marginBottom: spacing.sm,
            }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: spacing['2xs'],
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.medium,
                }}>
                  Registration/License # *
                </label>
                <input
                  type="text"
                  value={newCert.registration_number || ''}
                  onChange={(e) => setNewCert({ ...newCert, registration_number: e.target.value })}
                  placeholder="e.g., 12345"
                  style={{
                    width: '100%',
                    padding: spacing.xs,
                    borderRadius: radius.sm,
                    border: `1px solid ${colors.border}`,
                    fontSize: typography.sizes.base,
                    minHeight: 38,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: spacing['2xs'],
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.medium,
                }}>
                  State *
                </label>
                <select
                  value={newCert.state || ''}
                  onChange={(e) => setNewCert({ ...newCert, state: e.target.value })}
                  style={{
                    width: '100%',
                    padding: spacing.xs,
                    borderRadius: radius.sm,
                    border: `1px solid ${colors.border}`,
                    fontSize: typography.sizes.base,
                    minHeight: 38,
                  }}
                >
                  <option value="">--</option>
                  {US_STATES.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Expiration date */}
            <div style={{ marginBottom: spacing.sm }}>
              <label style={{
                display: 'block',
                marginBottom: spacing['2xs'],
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
              }}>
                Expiration Date (optional)
              </label>
              <input
                type="date"
                value={newCert.expires_at || ''}
                onChange={(e) => setNewCert({ ...newCert, expires_at: e.target.value })}
                style={{
                  width: '100%',
                  padding: spacing.xs,
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.border}`,
                  fontSize: typography.sizes.base,
                  minHeight: 44,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Document upload */}
            <div style={{ marginBottom: spacing.md }}>
              <label style={{
                display: 'block',
                marginBottom: spacing['2xs'],
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
              }}>
                Supporting Document (optional)
              </label>
              <input
                ref={newFileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setNewCertFile(e.target.files?.[0] || null)}
                style={{
                  width: '100%',
                  padding: spacing.xs,
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.border}`,
                  fontSize: typography.sizes.sm,
                  boxSizing: 'border-box',
                }}
              />
              <p style={{
                margin: `${spacing['3xs']} 0 0 0`,
                fontSize: typography.sizes.xs,
                color: colors.textMuted,
              }}>
                PDF, JPG, or PNG up to 10MB.
              </p>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: spacing.sm }}>
              <button
                onClick={handleAddCert}
                disabled={addingWithUpload}
                style={{
                  padding: `${spacing['2xs']} ${spacing.sm}`,
                  backgroundColor: colors.primary,
                  color: colors.textInverse,
                  border: 'none',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  cursor: addingWithUpload ? 'wait' : 'pointer',
                  opacity: addingWithUpload ? 0.7 : 1,
                  minHeight: 38,
                }}
              >
                {addingWithUpload ? 'Uploading...' : 'Add Certification'}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setNewCert({ type: '', label: '', registration_number: '', state: '' })
                  setNewCertFile(null)
                  if (newFileInputRef.current) newFileInputRef.current.value = ''
                }}
                style={{
                  padding: `${spacing['2xs']} ${spacing.sm}`,
                  backgroundColor: 'transparent',
                  color: colors.textSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.medium,
                  cursor: 'pointer',
                  minHeight: 38,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          certifications.length < 4 && (
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                width: '100%',
                padding: spacing.xs,
                backgroundColor: colors.surfaceMuted,
                color: colors.textSecondary,
                border: `1px dashed ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                cursor: 'pointer',
                marginBottom: spacing.sm,
                minHeight: 38,
              }}
            >
              + Add Certification
            </button>
          )
        )}

        {certifications.length >= 4 && (
          <p style={{
            margin: `0 0 ${spacing.sm} 0`,
            fontSize: typography.sizes.xs,
            color: colors.textMuted,
            fontStyle: 'italic',
          }}>
            Maximum of 4 certifications reached.
          </p>
        )}

        {/* Save certifications */}
        <button
          onClick={handleSaveCerts}
          disabled={certSaving}
          style={{
            width: '100%',
            padding: spacing.xs,
            backgroundColor: certSaving ? colors.borderMuted : colors.primary,
            color: colors.textInverse,
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            cursor: certSaving ? 'not-allowed' : 'pointer',
            minHeight: 44,
          }}
        >
          {certSaving ? 'Saving...' : 'Save Certifications'}
        </button>
      </div>
    </div>
  )
}
