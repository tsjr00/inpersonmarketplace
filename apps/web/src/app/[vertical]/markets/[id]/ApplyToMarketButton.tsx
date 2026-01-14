'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ApplyToMarketButtonProps {
  marketId: string
  vendorProfileId: string
}

export default function ApplyToMarketButton({ marketId, vendorProfileId }: ApplyToMarketButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const handleApply = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/markets/${marketId}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_profile_id: vendorProfileId,
          notes: notes.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to apply')
      }

      // Success - refresh page
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        style={{
          padding: '10px 20px',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Apply to Sell Here
      </button>
    )
  }

  return (
    <div style={{
      backgroundColor: '#f8f9fa',
      borderRadius: 8,
      padding: 16,
      minWidth: 280,
    }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
        Apply to Market
      </h4>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional: Add notes for the market admin..."
        style={{
          width: '100%',
          padding: 10,
          border: '1px solid #ddd',
          borderRadius: 6,
          fontSize: 14,
          resize: 'vertical',
          minHeight: 80,
          marginBottom: 12,
          boxSizing: 'border-box',
        }}
      />

      {error && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: 6,
          fontSize: 13,
          marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleApply}
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px 16px',
            backgroundColor: loading ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Applying...' : 'Submit Application'}
        </button>
        <button
          onClick={() => setShowForm(false)}
          disabled={loading}
          style={{
            padding: '10px 16px',
            backgroundColor: '#f0f0f0',
            color: '#666',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
