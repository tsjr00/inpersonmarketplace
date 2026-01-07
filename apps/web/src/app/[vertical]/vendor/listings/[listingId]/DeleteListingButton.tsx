'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface DeleteListingButtonProps {
  vertical: string
  listingId: string
  listingTitle: string
}

export default function DeleteListingButton({
  vertical,
  listingId,
  listingTitle
}: DeleteListingButtonProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${listingTitle}"?\n\nThis action cannot be undone.`
    )

    if (!confirmed) return

    setLoading(true)

    // Soft delete - set deleted_at timestamp
    const { error } = await supabase
      .from('listings')
      .update({
        deleted_at: new Date().toISOString(),
        status: 'archived'
      })
      .eq('id', listingId)

    if (error) {
      alert('Failed to delete listing: ' + error.message)
      setLoading(false)
      return
    }

    router.push(`/${vertical}/vendor/listings`)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      style={{
        padding: '12px 24px',
        backgroundColor: loading ? '#ccc' : '#dc3545',
        color: 'white',
        border: 'none',
        borderRadius: 6,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer'
      }}
    >
      {loading ? 'Deleting...' : 'Delete Listing'}
    </button>
  )
}
