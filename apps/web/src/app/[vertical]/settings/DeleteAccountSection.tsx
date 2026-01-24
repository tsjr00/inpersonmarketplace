'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface DeleteAccountSectionProps {
  vertical: string
  userEmail: string
}

export default function DeleteAccountSection({ vertical, userEmail }: DeleteAccountSectionProps) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDeleteAccount = async () => {
    if (confirmEmail !== userEmail) {
      setError('Email does not match your account email')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail })
      })

      if (res.ok) {
        // Redirect to home page after deletion
        router.push(`/${vertical}`)
        router.refresh()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to delete account')
      }
    } catch {
      setError('Error deleting account')
    } finally {
      setLoading(false)
    }
  }

  if (!showConfirm) {
    return (
      <div>
        <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#6b7280' }}>
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <button
          onClick={() => setShowConfirm(true)}
          style={{
            padding: '10px 24px',
            backgroundColor: 'white',
            color: '#dc2626',
            border: '1px solid #dc2626',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Delete My Account
        </button>
      </div>
    )
  }

  return (
    <div style={{
      padding: 16,
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: 8
    }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600, color: '#991b1b' }}>
        Are you sure?
      </h3>
      <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#991b1b' }}>
        This will permanently delete:
      </p>
      <ul style={{ margin: '0 0 16px 0', paddingLeft: 20, fontSize: 14, color: '#991b1b' }}>
        <li>Your user profile and settings</li>
        <li>Your order history</li>
        <li>Your saved payment methods</li>
        <li>Any vendor profiles you own</li>
        <li>All listings and data associated with your account</li>
      </ul>

      <div style={{ marginBottom: 16 }}>
        <label style={{
          display: 'block',
          fontSize: 14,
          color: '#991b1b',
          marginBottom: 6,
          fontWeight: 500
        }}>
          Type your email to confirm: <strong>{userEmail}</strong>
        </label>
        <input
          type="email"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          placeholder="Enter your email"
          style={{
            width: '100%',
            maxWidth: 400,
            padding: '10px 12px',
            border: '1px solid #fecaca',
            borderRadius: 6,
            fontSize: 14,
            boxSizing: 'border-box'
          }}
        />
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          marginBottom: 16,
          borderRadius: 6,
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          fontSize: 14
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => {
            setShowConfirm(false)
            setConfirmEmail('')
            setError(null)
          }}
          style={{
            padding: '10px 24px',
            backgroundColor: 'white',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleDeleteAccount}
          disabled={loading || confirmEmail !== userEmail}
          style={{
            padding: '10px 24px',
            backgroundColor: loading || confirmEmail !== userEmail ? '#fca5a5' : '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading || confirmEmail !== userEmail ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Deleting...' : 'Permanently Delete Account'}
        </button>
      </div>
    </div>
  )
}
