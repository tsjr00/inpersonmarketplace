'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface MarketManagerAssignmentProps {
  marketId: string
  managerEmail: string | null
  managerUserId: string | null
  managerInvitedAt: string | null
  managerAcceptedAt: string | null
}

/**
 * Admin UI on the market detail page for assigning / clearing the
 * market manager.
 *
 * State display:
 *  - No manager assigned       → input + "Assign" button
 *  - Email assigned, not signed up → email shown + "Pending sign-up" badge
 *                                    + "Reassign" / "Clear" buttons
 *  - Email + user_id linked    → email shown + "Active since [date]" badge
 *                                + "Reassign" / "Clear" buttons
 *
 * Calls POST /api/admin/markets/[marketId]/manager.
 */
export default function MarketManagerAssignment({
  marketId,
  managerEmail,
  managerUserId,
  managerInvitedAt,
  managerAcceptedAt,
}: MarketManagerAssignmentProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [editing, setEditing] = useState(!managerEmail)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isAssigned = !!managerEmail
  const isLinked = !!managerUserId

  const formatDate = (iso: string | null): string => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const handleAssign = async () => {
    setError(null)
    setSuccess(null)
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/markets/${marketId}/manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to assign manager')
      } else {
        setSuccess(`Manager assigned to ${data.manager_email}`)
        setEmail('')
        setEditing(false)
        router.refresh()
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    if (!confirm('Remove this market manager? They will lose dashboard access immediately.')) return
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/markets/${marketId}/manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to clear manager')
      } else {
        setSuccess('Manager cleared')
        setEditing(true)
        router.refresh()
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {!editing && isAssigned && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#333' }}>{managerEmail}</span>
            {isLinked ? (
              <span style={{
                padding: '3px 8px',
                backgroundColor: '#d4edda',
                color: '#155724',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
              }}>
                Active since {formatDate(managerAcceptedAt)}
              </span>
            ) : (
              <span style={{
                padding: '3px 8px',
                backgroundColor: '#fff3cd',
                color: '#856404',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
              }}>
                Pending sign-up
              </span>
            )}
          </div>
          {managerInvitedAt && (
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              Invited {formatDate(managerInvitedAt)}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            type="email"
            placeholder="manager@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            style={{
              flex: '1 1 220px',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 6,
              fontSize: 14,
            }}
          />
          <button
            onClick={handleAssign}
            disabled={loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Saving...' : isAssigned ? 'Reassign' : 'Assign'}
          </button>
          {isAssigned && (
            <button
              onClick={() => {
                setEditing(false)
                setEmail('')
                setError(null)
              }}
              disabled={loading}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#666',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {!editing && isAssigned && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setEditing(true)}
            disabled={loading}
            style={{
              padding: '8px 14px',
              backgroundColor: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reassign
          </button>
          <button
            onClick={handleClear}
            disabled={loading}
            style={{
              padding: '8px 14px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Working...' : 'Remove manager'}
          </button>
        </div>
      )}

      {!isAssigned && !editing && (
        <p style={{ margin: 0, color: '#888', fontSize: 14 }}>No manager assigned to this market.</p>
      )}

      {error && (
        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: 6,
          fontSize: 13,
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          backgroundColor: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb',
          borderRadius: 6,
          fontSize: 13,
        }}>
          {success}
        </div>
      )}

      <p style={{ marginTop: 12, marginBottom: 0, color: '#888', fontSize: 12, lineHeight: 1.5 }}>
        Assigning by email links the user when they next sign in (if not already signed up,
        ask them to register with this email). They&apos;ll see a &ldquo;My Markets&rdquo; card
        on their buyer dashboard with a link to manage this market.
      </p>
    </div>
  )
}
