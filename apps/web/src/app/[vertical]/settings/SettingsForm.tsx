'use client'

import { useState } from 'react'

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

  const handleSave = async () => {
    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName })
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

  const hasChanges = displayName !== initialDisplayName

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Display Name Field */}
      <div>
        <label style={{
          display: 'block',
          fontSize: 14,
          color: '#6b7280',
          marginBottom: 6,
          fontWeight: 500
        }}>
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter your display name"
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Email Field (read-only) */}
      <div>
        <label style={{
          display: 'block',
          fontSize: 14,
          color: '#6b7280',
          marginBottom: 6,
          fontWeight: 500
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
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            backgroundColor: '#f9fafb',
            color: '#6b7280',
            boxSizing: 'border-box'
          }}
        />
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, marginBottom: 0 }}>
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
            backgroundColor: loading || !hasChanges ? '#d1d5db' : primaryColor,
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading || !hasChanges ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 6,
          backgroundColor: message.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: message.type === 'success' ? '#065f46' : '#991b1b',
          fontSize: 14
        }}>
          {message.text}
        </div>
      )}
    </div>
  )
}
