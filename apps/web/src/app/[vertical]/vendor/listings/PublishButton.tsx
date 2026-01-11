'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface PublishButtonProps {
  listingId: string
  currentStatus: string
}

export default function PublishButton({ listingId, currentStatus }: PublishButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Only show for draft listings
  if (currentStatus !== 'draft') {
    return null
  }

  async function handlePublish() {
    if (loading) return

    setLoading(true)

    const { error } = await supabase
      .from('listings')
      .update({
        status: 'published',
        updated_at: new Date().toISOString()
      })
      .eq('id', listingId)

    if (error) {
      alert('Failed to publish listing: ' + error.message)
      setLoading(false)
      return
    }

    // Refresh the page to show updated status
    router.refresh()
    setLoading(false)
  }

  return (
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
  )
}
