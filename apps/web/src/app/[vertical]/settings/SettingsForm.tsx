'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface SettingsFormProps {
  initialDisplayName: string
  userEmail: string
  primaryColor: string
}

export default function SettingsForm({
  initialDisplayName,
  userEmail,
  primaryColor
}: SettingsFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const hasChanges = displayName !== initialDisplayName

  const handleSave = async () => {
    setLoading(true)
    setMessage(null)

    try {
      const body: Record<string, unknown> = {}
      if (displayName !== initialDisplayName) {
        body.display_name = displayName
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
            color: colors.textPrimary,
            backgroundColor: colors.inputBg,
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
          backgroundColor: message.type === 'success' ? colors.primaryLight : '#fee2e2',
          color: message.type === 'success' ? colors.primaryDark : '#991b1b',
          fontSize: typography.sizes.sm
        }}>
          {message.text}
        </div>
      )}
    </div>
  )
}
