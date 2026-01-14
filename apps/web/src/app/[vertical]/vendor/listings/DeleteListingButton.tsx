'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface DeleteListingButtonProps {
  listingId: string
  listingTitle: string
}

export default function DeleteListingButton({ listingId, listingTitle }: DeleteListingButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete "${listingTitle}"? This cannot be undone.`)) {
      return
    }

    setDeleting(true)

    try {
      const res = await fetch(`/api/listings/${listingId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to delete listing')
        return
      }

      // Refresh the page to show updated listings
      router.refresh()
    } catch (error) {
      console.error('Error deleting listing:', error)
      alert('Failed to delete listing')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 12px',
        backgroundColor: deleting ? '#ccc' : '#dc2626',
        color: 'white',
        border: 'none',
        borderRadius: 4,
        fontSize: 14,
        fontWeight: 600,
        cursor: deleting ? 'not-allowed' : 'pointer',
        minHeight: 44
      }}
    >
      {deleting ? 'Deleting...' : 'Delete'}
    </button>
  )
}
