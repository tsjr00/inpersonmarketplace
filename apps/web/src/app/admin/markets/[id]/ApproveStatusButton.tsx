'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Admin one-click approve for markets in `status='pending'` — the state
 * produced by the public market-manager intake form (POST
 * /api/market-manager/intake). Flips status to 'active' so the market
 * becomes visible to public browse + nearby + vendors-with-listings.
 *
 * Renders nothing when status !== 'pending'. The existing edit form
 * (admin/markets/[id]/edit) still handles all other field changes;
 * this is purely the publish gate.
 *
 * Calls PUT /api/admin/markets/[id] with { status: 'active' }. The route
 * handler at src/app/api/admin/markets/[id]/route.ts:119 already updates
 * status when provided.
 */
interface ApproveStatusButtonProps {
  marketId: string
  status: string
}

export default function ApproveStatusButton({ marketId, status }: ApproveStatusButtonProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status !== 'pending') return null

  const handleApprove = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/markets/${marketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Approve failed')
        setBusy(false)
        return
      }
      router.refresh()
    } catch {
      setError('Network error')
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={handleApprove}
        disabled={busy}
        style={{
          padding: '10px 20px',
          backgroundColor: '#2d5016',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Approving…' : '✓ Approve & activate'}
      </button>
      {error && (
        <span style={{ color: '#991b1b', fontSize: 13 }}>{error}</span>
      )}
    </div>
  )
}
