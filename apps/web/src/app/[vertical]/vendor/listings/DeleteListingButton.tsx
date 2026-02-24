'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { useStatusBanner } from '@/hooks/useStatusBanner'

interface DeleteListingButtonProps {
  listingId: string
  listingTitle: string
}

export default function DeleteListingButton({ listingId, listingTitle }: DeleteListingButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const { showBanner, StatusBanner } = useStatusBanner()

  async function handleDelete() {
    setShowConfirm(false)
    setDeleting(true)

    try {
      const res = await fetch(`/api/listings/${listingId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        showBanner('error', error.error || 'Failed to delete listing')
        return
      }

      // Refresh the page to show updated listings
      router.refresh()
    } catch (error) {
      console.error('Error deleting listing:', error)
      showBanner('error', 'Failed to delete listing')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
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
      <ConfirmDialog
        open={showConfirm}
        title="Delete Listing"
        message={`Are you sure you want to delete "${listingTitle}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
      <StatusBanner />
    </>
  )
}
