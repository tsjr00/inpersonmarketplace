'use client'

import { useState } from 'react'

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
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
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
      // Tester finding 2026-07-28: the write succeeds (SQL confirmed status flips
      // to 'active'), but router.refresh() did NOT re-render this platform-admin
      // page — the button stayed green and the operator couldn't tell it worked.
      // A full reload guarantees the page reflects the new status (button gone,
      // "Status: active" badge). This is an infrequent admin action, so the hard
      // reload is an acceptable trade for a bulletproof, unambiguous result.
      setDone(true)
      window.location.reload()
    } catch {
      setError('Network error')
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={handleApprove}
          disabled={busy || done}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2d5016',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: (busy || done) ? 'not-allowed' : 'pointer',
            opacity: (busy || done) ? 0.6 : 1,
          }}
        >
          {done ? '✓ Approved — reloading…' : busy ? 'Approving…' : '✓ Approve & make live'}
        </button>
        {error && (
          <span style={{ color: '#991b1b', fontSize: 13 }}>{error}</span>
        )}
      </div>
      <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#4b5563', lineHeight: 1.5, maxWidth: 560 }}>
        Publishes this park — it becomes visible to the public and to food trucks so they can find it
        and book spots. Until you do this, the park stays hidden while you review it.
      </p>
    </div>
  )
}
