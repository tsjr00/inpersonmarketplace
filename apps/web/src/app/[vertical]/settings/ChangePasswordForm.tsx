'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { colors } from '@/lib/design-tokens'

interface ChangePasswordFormProps {
  primaryColor: string
}

export default function ChangePasswordForm({ primaryColor }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleChangePassword = async () => {
    setMessage(null)

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please fill in all fields' })
      return
    }

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters' })
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
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
          setMessage({ type: 'error', text: 'New password must be different from current password' })
        } else {
          setMessage({ type: 'error', text: error.message || 'Failed to change password' })
        }
      } else {
        setMessage({ type: 'success', text: 'Password changed successfully!' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch {
      setMessage({ type: 'error', text: 'Error changing password' })
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
          Current Password
        </label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Enter current password"
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            color: colors.textPrimary,
            boxSizing: 'border-box'
          }}
        />
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
          New Password
        </label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new password (min 8 characters)"
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            color: colors.textPrimary,
            boxSizing: 'border-box'
          }}
        />
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
          Confirm New Password
        </label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter new password"
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            color: colors.textPrimary,
            boxSizing: 'border-box'
          }}
        />
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
          {loading ? 'Changing...' : 'Change Password'}
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
