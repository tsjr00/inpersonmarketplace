'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { colors } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface ChangePasswordFormProps {
  primaryColor: string
}

export default function ChangePasswordForm({ primaryColor }: ChangePasswordFormProps) {
  const locale = getClientLocale()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleChangePassword = async () => {
    setMessage(null)

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: t('password.fill_all', locale) })
      return
    }

    if (newPassword.length < 9) {
      setMessage({ type: 'error', text: t('password.min_length', locale) })
      return
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setMessage({ type: 'error', text: t('password.requirements', locale) })
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('password.no_match', locale) })
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      // Supabase's updateUser for password change
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        // Handle specific errors
        if (error.message.includes('same')) {
          setMessage({ type: 'error', text: t('password.same_as_current', locale) })
        } else {
          setMessage({ type: 'error', text: error.message || t('password.failed', locale) })
        }
      } else {
        setMessage({ type: 'success', text: t('password.success', locale) })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch {
      setMessage({ type: 'error', text: t('password.error', locale) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Current Password */}
      <div>
        <label style={{
          display: 'block',
          fontSize: 14,
          color: '#6b7280',
          marginBottom: 6,
          fontWeight: 500
        }}>
          {t('password.current', locale)}
        </label>
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <input
            type={showCurrent ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={t('password.current_placeholder', locale)}
            style={{
              width: '100%',
              padding: '10px 40px 10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              color: colors.textPrimary,
              backgroundColor: colors.inputBg,
              boxSizing: 'border-box'
            }}
          />
          <button
            type="button"
            onClick={() => setShowCurrent(!showCurrent)}
            aria-label={showCurrent ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              fontSize: 18,
              color: '#9ca3af',
              lineHeight: 1,
              minHeight: 44,
              minWidth: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {showCurrent ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      {/* New Password */}
      <div>
        <label style={{
          display: 'block',
          fontSize: 14,
          color: '#6b7280',
          marginBottom: 6,
          fontWeight: 500
        }}>
          {t('password.new', locale)}
        </label>
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <input
            type={showNew ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('password.new_placeholder', locale)}
            style={{
              width: '100%',
              padding: '10px 40px 10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              color: colors.textPrimary,
              backgroundColor: colors.inputBg,
              boxSizing: 'border-box'
            }}
          />
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            aria-label={showNew ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              fontSize: 18,
              color: '#9ca3af',
              lineHeight: 1,
              minHeight: 44,
              minWidth: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {showNew ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      {/* Confirm New Password */}
      <div>
        <label style={{
          display: 'block',
          fontSize: 14,
          color: '#6b7280',
          marginBottom: 6,
          fontWeight: 500
        }}>
          {t('password.confirm', locale)}
        </label>
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <input
            type={showConfirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('password.confirm_placeholder', locale)}
            style={{
              width: '100%',
              padding: '10px 40px 10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              color: colors.textPrimary,
              backgroundColor: colors.inputBg,
              boxSizing: 'border-box'
            }}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            aria-label={showConfirm ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              fontSize: 18,
              color: '#9ca3af',
              lineHeight: 1,
              minHeight: 44,
              minWidth: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {showConfirm ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      {/* Change Password Button */}
      <div>
        <button
          onClick={handleChangePassword}
          disabled={loading}
          style={{
            padding: '10px 24px',
            backgroundColor: loading ? '#d1d5db' : primaryColor,
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? t('password.changing', locale) : t('password.change', locale)}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 6,
          backgroundColor: message.type === 'success' ? colors.primaryLight : '#fee2e2',
          color: message.type === 'success' ? colors.primaryDark : '#991b1b',
          fontSize: 14
        }}>
          {message.text}
        </div>
      )}
    </div>
  )
}
