'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

interface SettingsFormProps {
  initialDisplayName: string
  initialPhone: string
  initialSmsConsent: boolean
  userEmail: string
  primaryColor: string
}

export default function SettingsForm({
  initialDisplayName,
  initialPhone,
  initialSmsConsent,
  userEmail,
  primaryColor
}: SettingsFormProps) {
  const params = useParams()
  const vertical = params.vertical as string
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [phone, setPhone] = useState(initialPhone)
  const [smsConsent, setSmsConsent] = useState(initialSmsConsent)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Format phone as user types: (555) 123-4567
  const formatPhone = (value: string): string => {
    const digits = value.replace(/\D/g, '')
    // Remove leading 1 for display formatting
    const local = digits.startsWith('1') && digits.length > 10 ? digits.slice(1) : digits
    if (local.length <= 3) return local
    if (local.length <= 6) return `(${local.slice(0, 3)}) ${local.slice(3)}`
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 10)}`
  }

  const handlePhoneChange = (value: string) => {
    // Only allow digits and formatting chars
    const cleaned = value.replace(/[^\d()\s-]/g, '')
    setPhone(formatPhone(cleaned))
    setMessage(null)
  }

  const phoneDigits = phone.replace(/\D/g, '')
  const hasValidPhone = phoneDigits.length >= 10

  // When phone is cleared, auto-uncheck consent
  const handlePhoneClear = () => {
    setPhone('')
    setSmsConsent(false)
    setMessage(null)
  }

  const hasChanges =
    displayName !== initialDisplayName ||
    phone !== initialPhone ||
    smsConsent !== initialSmsConsent

  const handleSave = async () => {
    setLoading(true)
    setMessage(null)

    // Validate: if consent is checked, phone must be valid
    if (smsConsent && !hasValidPhone) {
      setMessage({ type: 'error', text: 'Please enter a valid phone number to enable SMS notifications' })
      setLoading(false)
      return
    }

    try {
      const body: Record<string, unknown> = {}

      if (displayName !== initialDisplayName) {
        body.display_name = displayName
      }
      if (phone !== initialPhone) {
        body.phone = phone.trim() || null
      }
      if (smsConsent !== initialSmsConsent) {
        body.sms_consent = smsConsent
      }

      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully!' })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to update profile' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Error updating profile' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Display Name Field */}
      <div>
        <label style={{
          display: 'block',
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          marginBottom: 6,
          fontWeight: typography.weights.medium
        }}>
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => { setDisplayName(e.target.value); setMessage(null) }}
          placeholder="Enter your display name"
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Email Field (read-only) */}
      <div>
        <label style={{
          display: 'block',
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          marginBottom: 6,
          fontWeight: typography.weights.medium
        }}>
          Email
        </label>
        <input
          type="email"
          value={userEmail}
          disabled
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            backgroundColor: colors.surfaceMuted,
            color: colors.textMuted,
            boxSizing: 'border-box'
          }}
        />
        <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 4, marginBottom: 0 }}>
          Email changes are not currently available
        </p>
      </div>

      {/* Phone Number Field */}
      <div>
        <label style={{
          display: 'block',
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          marginBottom: 6,
          fontWeight: typography.weights.medium
        }}>
          Phone Number
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, maxWidth: 400 }}>
          <input
            type="tel"
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="(555) 123-4567"
            style={{
              flex: 1,
              padding: '10px 12px',
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              boxSizing: 'border-box'
            }}
          />
          {phone && (
            <button
              type="button"
              onClick={handlePhoneClear}
              style={{
                padding: '10px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                backgroundColor: colors.surfaceMuted,
                color: colors.textMuted,
                fontSize: typography.sizes.sm,
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          )}
        </div>
        <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 4, marginBottom: 0 }}>
          Used for SMS order notifications only
        </p>
      </div>

      {/* SMS Consent Checkbox — only shown when phone number is entered */}
      {hasValidPhone && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.sm,
          border: `1px solid ${colors.border}`,
          maxWidth: 500
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: spacing.xs,
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={smsConsent}
              onChange={(e) => { setSmsConsent(e.target.checked); setMessage(null) }}
              style={{
                width: 18,
                height: 18,
                marginTop: 2,
                flexShrink: 0,
                accentColor: primaryColor,
                cursor: 'pointer'
              }}
            />
            <span style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, lineHeight: '1.5' }}>
              I agree to receive automated SMS/text messages from {term(vertical, 'display_name')} for order
              status alerts, pickup notifications, and cancellation notices. Message frequency varies
              (typically 1-5 per week during active orders). Message and data rates may apply.
              Reply STOP to opt out, HELP for help. See our{' '}
              <a href="/terms#sms-terms" target="_blank" style={{ color: primaryColor }}>Terms of Service</a>
              {' '}and{' '}
              <a href="/terms#privacy-policy" target="_blank" style={{ color: primaryColor }}>Privacy Policy</a>.
            </span>
          </label>
        </div>
      )}

      {/* Save Button */}
      <div>
        <button
          onClick={handleSave}
          disabled={loading || !hasChanges}
          style={{
            padding: '10px 24px',
            backgroundColor: loading || !hasChanges ? colors.border : primaryColor,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: loading || !hasChanges ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          borderRadius: radius.sm,
          backgroundColor: message.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: message.type === 'success' ? '#065f46' : '#991b1b',
          fontSize: typography.sizes.sm
        }}>
          {message.text}
        </div>
      )}
    </div>
  )
}
