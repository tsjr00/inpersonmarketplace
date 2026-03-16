'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface SettingsFormProps {
  initialDisplayName: string
  userEmail: string
  primaryColor: string
  locale?: string
}

export default function SettingsForm({
  initialDisplayName,
  userEmail,
  primaryColor
}: SettingsFormProps) {
  const locale = getClientLocale()
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const trimmedName = displayName.trim()
  const nameError = trimmedName.length < 2 ? t('settings.display_name_error', locale) : null
  const hasChanges = displayName !== initialDisplayName

  const handleSave = async () => {
    if (nameError) {
      setMessage({ type: 'error', text: nameError })
      return
    }
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
        setMessage({ type: 'success', text: t('settings.profile_updated', locale) })
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || t('settings.profile_update_failed', locale) })
      }
    } catch {
      setMessage({ type: 'error', text: t('settings.profile_update_error', locale) })
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
          {t('settings.display_name', locale)} <span style={{ color: '#dc2626' }}>*</span>
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => { setDisplayName(e.target.value); setMessage(null) }}
          placeholder={t('settings.display_name_placeholder', locale)}
          required
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            border: `1px solid ${nameError && trimmedName.length > 0 ? '#dc2626' : colors.border}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            color: colors.textPrimary,
            backgroundColor: colors.inputBg,
            boxSizing: 'border-box'
          }}
        />
        {nameError && trimmedName.length > 0 && (
          <p style={{ fontSize: typography.sizes.xs, color: '#dc2626', marginTop: 4, marginBottom: 0 }}>
            {nameError}
          </p>
        )}
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
          {t('settings.email', locale)}
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
          {t('settings.email_unavailable', locale)}
        </p>
      </div>

      {/* Save Button */}
      <div>
        <button
          onClick={handleSave}
          disabled={loading || !hasChanges || !!nameError}
          style={{
            padding: '10px 24px',
            backgroundColor: loading || !hasChanges || nameError ? colors.border : primaryColor,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: loading || !hasChanges ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? t('settings.saving', locale) : t('settings.save_changes', locale)}
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
