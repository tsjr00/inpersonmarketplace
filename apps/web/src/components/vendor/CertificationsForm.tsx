'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

// Predefined certification types with display info
const CERTIFICATION_TYPES = [
  {
    type: 'cottage_goods',
    label: 'Cottage Food License',
    description: 'State-registered home kitchen food production',
    badgeColor: '#d97706', // amber
    badgeBg: '#fef3c7',
    icon: '🏠'
  },
  {
    type: 'organic',
    label: 'USDA Organic',
    description: 'Certified organic by USDA-accredited certifying agent',
    badgeColor: '#059669', // green
    badgeBg: '#d1fae5',
    icon: '🌱'
  },
  {
    type: 'regenerative',
    label: 'Regenerative Certified',
    description: 'Regenerative organic or similar certification',
    badgeColor: '#0284c7', // blue
    badgeBg: '#dbeafe',
    icon: '♻️'
  },
  {
    type: 'gap_certified',
    label: 'GAP Certified',
    description: 'Good Agricultural Practices certification',
    badgeColor: '#7c3aed', // purple
    badgeBg: '#ede9fe',
    icon: '✓'
  },
  {
    type: 'other',
    label: 'Other Certification',
    description: 'Other food safety or agricultural certification',
    badgeColor: '#6b7280', // gray
    badgeBg: '#f3f4f6',
    icon: '📜'
  }
]

export interface Certification {
  type: string
  label: string
  registration_number: string
  state: string
  expires_at?: string
  verified?: boolean
}

interface CertificationsFormProps {
  vendorId: string
  currentCertifications: Certification[]
}

export default function CertificationsForm({
  vendorId,
  currentCertifications
}: CertificationsFormProps) {
  const [certifications, setCertifications] = useState<Certification[]>(
    currentCertifications || []
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCert, setNewCert] = useState<Partial<Certification>>({
    type: '',
    label: '',
    registration_number: '',
    state: ''
  })

  const handleAddCertification = () => {
    if (!newCert.type || !newCert.registration_number || !newCert.state) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' })
      return
    }

    // Get the label from the type
    const typeInfo = CERTIFICATION_TYPES.find(t => t.type === newCert.type)
    const label = newCert.type === 'other' && newCert.label
      ? newCert.label
      : typeInfo?.label || newCert.type

    const cert: Certification = {
      type: newCert.type,
      label,
      registration_number: newCert.registration_number,
      state: newCert.state.toUpperCase(),
      expires_at: newCert.expires_at || undefined,
      verified: false
    }

    setCertifications([...certifications, cert])
    setNewCert({ type: '', label: '', registration_number: '', state: '' })
    setShowAddForm(false)
    setMessage(null)
  }

  const handleRemoveCertification = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/vendor/profile/certifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certifications })
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ type: 'success', text: 'Certifications saved successfully!' })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save certifications' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save certifications' })
    } finally {
      setSaving(false)
    }
  }

  const getTypeInfo = (type: string) => {
    return CERTIFICATION_TYPES.find(t => t.type === type) || CERTIFICATION_TYPES[CERTIFICATION_TYPES.length - 1]
  }

  const US_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ]

  return (
    <div style={{
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      border: `1px solid ${colors.border}`
    }}>
      <h2 style={{
        margin: `0 0 ${spacing.xs} 0`,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary
      }}>
        Registrations & Certifications
      </h2>
      <p style={{
        margin: `0 0 ${spacing.md} 0`,
        fontSize: typography.sizes.sm,
        color: colors.textSecondary
      }}>
        Add your food safety certifications, licenses, and registrations. These will be displayed on your vendor profile.
      </p>

      {/* Message */}
      {message && (
        <div style={{
          padding: spacing.sm,
          marginBottom: spacing.md,
          borderRadius: radius.sm,
          backgroundColor: message.type === 'success' ? '#dcfce7' : '#fef2f2',
          color: message.type === 'success' ? '#166534' : '#991b1b',
          fontSize: typography.sizes.sm
        }}>
          {message.text}
        </div>
      )}

      {/* Current Certifications */}
      {certifications.length > 0 && (
        <div style={{ marginBottom: spacing.md }}>
          {certifications.map((cert, index) => {
            const typeInfo = getTypeInfo(cert.type)
            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: spacing.sm,
                  marginBottom: spacing.xs,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.border}`
                }}
              >
                {/* Badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing['2xs'],
                  padding: `${spacing['2xs']} ${spacing.xs}`,
                  backgroundColor: typeInfo.badgeBg,
                  color: typeInfo.badgeColor,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  whiteSpace: 'nowrap'
                }}>
                  <span>{typeInfo.icon}</span>
                  <span>{cert.label}</span>
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: typography.sizes.sm,
                    color: colors.textPrimary
                  }}>
                    #{cert.registration_number}
                  </div>
                  <div style={{
                    fontSize: typography.sizes.xs,
                    color: colors.textMuted
                  }}>
                    {cert.state}
                    {cert.expires_at && ` • Expires: ${new Date(cert.expires_at).toLocaleDateString()}`}
                  </div>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => handleRemoveCertification(index)}
                  style={{
                    padding: spacing['2xs'],
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: colors.textMuted,
                    cursor: 'pointer',
                    fontSize: typography.sizes.lg
                  }}
                  title="Remove certification"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add New Certification Form */}
      {showAddForm ? (
        <div style={{
          padding: spacing.sm,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.sm,
          marginBottom: spacing.md
        }}>
          <h3 style={{
            margin: `0 0 ${spacing.sm} 0`,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold
          }}>
            Add Certification
          </h3>

          {/* Type Selection */}
          <div style={{ marginBottom: spacing.sm }}>
            <label style={{
              display: 'block',
              marginBottom: spacing['2xs'],
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium
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
                minHeight: 44
              }}
            >
              <option value="">Select type...</option>
              {CERTIFICATION_TYPES.map(type => (
                <option key={type.type} value={type.type}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>
            {newCert.type && (
              <p style={{
                margin: `${spacing['2xs']} 0 0 0`,
                fontSize: typography.sizes.xs,
                color: colors.textMuted
              }}>
                {getTypeInfo(newCert.type).description}
              </p>
            )}
          </div>

          {/* Custom Label for "Other" type */}
          {newCert.type === 'other' && (
            <div style={{ marginBottom: spacing.sm }}>
              <label style={{
                display: 'block',
                marginBottom: spacing['2xs'],
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium
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
                  minHeight: 44,
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}

          {/* Registration Number and State */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px',
            gap: spacing.sm,
            marginBottom: spacing.sm
          }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: spacing['2xs'],
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium
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
                  minHeight: 44,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                marginBottom: spacing['2xs'],
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium
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
                  minHeight: 44
                }}
              >
                <option value="">--</option>
                {US_STATES.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Expiration Date (optional) */}
          <div style={{ marginBottom: spacing.md }}>
            <label style={{
              display: 'block',
              marginBottom: spacing['2xs'],
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium
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
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <button
              onClick={handleAddCertification}
              style={{
                padding: `${spacing.xs} ${spacing.md}`,
                backgroundColor: colors.primary,
                color: colors.textInverse,
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                cursor: 'pointer',
                minHeight: 44
              }}
            >
              Add Certification
            </button>
            <button
              onClick={() => {
                setShowAddForm(false)
                setNewCert({ type: '', label: '', registration_number: '', state: '' })
              }}
              style={{
                padding: `${spacing.xs} ${spacing.md}`,
                backgroundColor: 'transparent',
                color: colors.textSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                cursor: 'pointer',
                minHeight: 44
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
              padding: spacing.sm,
              backgroundColor: colors.surfaceMuted,
              color: colors.textSecondary,
              border: `1px dashed ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              cursor: 'pointer',
              marginBottom: spacing.md,
              minHeight: 44
            }}
          >
            + Add Certification
          </button>
        )
      )}

      {/* Limit Notice */}
      {certifications.length >= 4 && (
        <p style={{
          margin: `0 0 ${spacing.md} 0`,
          fontSize: typography.sizes.xs,
          color: colors.textMuted,
          fontStyle: 'italic'
        }}>
          Maximum of 4 certifications reached.
        </p>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%',
          padding: spacing.sm,
          backgroundColor: saving ? colors.borderMuted : colors.primary,
          color: colors.textInverse,
          border: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          cursor: saving ? 'not-allowed' : 'pointer',
          minHeight: 48
        }}
      >
        {saving ? 'Saving...' : 'Save Certifications'}
      </button>
    </div>
  )
}

// Export certification types for use in other components
export { CERTIFICATION_TYPES }
