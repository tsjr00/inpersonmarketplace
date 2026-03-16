'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface DeleteAccountSectionProps {
  vertical: string
  userEmail: string
}

export default function DeleteAccountSection({ vertical, userEmail }: DeleteAccountSectionProps) {
  const locale = getClientLocale()
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDeleteAccount = async () => {
    if (confirmEmail !== userEmail) {
      setError(t('delete.email_mismatch', locale))
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
        setError(data.error || t('delete.failed', locale))
      }
    } catch {
      setError(t('delete.error', locale))
    } finally {
      setLoading(false)
    }
  }

  if (!showConfirm) {
    return (
      <div>
        <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#6b7280' }}>
          {t('delete.warning', locale)}
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
          {t('delete.btn', locale)}
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
        {t('delete.confirm_title', locale)}
      </h3>
      <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#991b1b' }}>
        {t('delete.will_delete', locale)}
      </p>
      <ul style={{ margin: '0 0 16px 0', paddingLeft: 20, fontSize: 14, color: '#991b1b' }}>
        <li>{t('delete.item_profile', locale)}</li>
        <li>{t('delete.item_orders', locale)}</li>
        <li>{t('delete.item_payments', locale)}</li>
        <li>{t('delete.item_vendor', locale)}</li>
        <li>{t('delete.item_data', locale)}</li>
      </ul>

      <div style={{ marginBottom: 16 }}>
        <label style={{
          display: 'block',
          fontSize: 14,
          color: '#991b1b',
          marginBottom: 6,
          fontWeight: 500
        }}>
          {t('delete.type_email', locale)} <strong>{userEmail}</strong>
        </label>
        <input
          type="email"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          placeholder={t('delete.email_placeholder', locale)}
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
          {t('delete.cancel', locale)}
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
          {loading ? t('delete.deleting', locale) : t('delete.confirm_btn', locale)}
        </button>
      </div>
    </div>
  )
}
