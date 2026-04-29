'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStatusBanner } from '@/hooks/useStatusBanner'

interface PublishButtonProps {
  listingId: string
  currentStatus: string
}

export default function PublishButton({ listingId, currentStatus }: PublishButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { showBanner, StatusBanner } = useStatusBanner()

  // Only show for draft listings
  if (currentStatus !== 'draft') {
    return null
  }

  async function handlePublish() {
    if (loading) return

    setLoading(true)

    // Server-side route enforces canPublishListings gate (P1-7 fix). Replaces
    // the prior client-side direct Supabase update which bypassed the gate.
    const res = await fetch(`/api/vendor/listings/${listingId}/publish`, {
      method: 'POST',
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      showBanner('error', body.error || 'Failed to publish listing')
      setLoading(false)
      return
    }

    // Refresh the page to show updated status
    router.refresh()
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={handlePublish}
        disabled={loading}
        style={{
          flex: 1,
          padding: '8px 12px',
          backgroundColor: loading ? '#ccc' : '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          fontSize: 14,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? 'Publishing...' : 'Publish'}
      </button>
      <StatusBanner />
    </>
  )
}
