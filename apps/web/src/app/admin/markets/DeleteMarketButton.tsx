'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface DeleteMarketButtonProps {
  marketId: string
  marketName: string
}

export default function DeleteMarketButton({ marketId, marketName }: DeleteMarketButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleDelete = async () => {
    setLoading(true)

    try {
      const response = await fetch(`/api/markets/${marketId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete')
      }

      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete market')
    } finally {
      setLoading(false)
      setShowConfirm(false)
    }
  }

  if (showConfirm) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 24,
          maxWidth: 400,
          width: '90%',
        }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>Delete Market?</h3>
          <p style={{ color: '#666', margin: '0 0 20px 0' }}>
            Are you sure you want to delete <strong>{marketName}</strong>? This will also remove all schedules and vendor associations. This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowConfirm(false)}
              disabled={loading}
              style={{
                padding: '10px 20px',
                backgroundColor: '#f0f0f0',
                color: '#333',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              style={{
                padding: '10px 20px',
                backgroundColor: loading ? '#ccc' : '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      style={{
        padding: '6px 12px',
        backgroundColor: '#fff',
        color: '#dc3545',
        border: '1px solid #dc3545',
        borderRadius: 4,
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      Delete
    </button>
  )
}
