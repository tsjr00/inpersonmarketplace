'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Toast, { type ToastType } from '@/components/shared/Toast'

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
  const [showConfirm, setShowConfirm] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  const handleDelete = async () => {
    setShowConfirm(false)
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
      setToast({ message: 'Failed to delete listing: ' + error.message, type: 'error' })
      setLoading(false)
      return
    }

    router.push(`/${vertical}/vendor/listings`)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
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
      <ConfirmDialog
        open={showConfirm}
        title="Delete Listing"
        message={`Are you sure you want to delete "${listingTitle}"?\n\nThis action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}
