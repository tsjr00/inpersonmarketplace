'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface VendorActionsProps {
  vendorId: string
  currentStatus: string
}

export default function VendorActions({ vendorId, currentStatus }: VendorActionsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const updateStatus = async (newStatus: string) => {
    const confirmMessage: Record<string, string> = {
      approved: 'Approve this vendor? Their listings will become visible to buyers.',
      rejected: 'Reject this vendor? They will need to reapply.',
      suspended: 'Suspend this vendor? Their listings will be hidden.'
    }

    if (!confirm(confirmMessage[newStatus] || `Change status to ${newStatus}?`)) {
      return
    }

    setLoading(true)

    // Use id, not vendor_id
    const { error } = await supabase
      .from('vendor_profiles')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', vendorId)

    if (error) {
      alert('Failed to update status: ' + error.message)
      setLoading(false)
      return
    }

    router.refresh()
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {(currentStatus === 'submitted' || currentStatus === 'draft') && (
        <>
          <button
            onClick={() => updateStatus('approved')}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: loading ? '#ccc' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            Approve
          </button>
          <button
            onClick={() => updateStatus('rejected')}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: loading ? '#ccc' : '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            Reject
          </button>
        </>
      )}

      {currentStatus === 'approved' && (
        <button
          onClick={() => updateStatus('suspended')}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#ccc' : '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          Suspend
        </button>
      )}

      {currentStatus === 'suspended' && (
        <button
          onClick={() => updateStatus('approved')}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#ccc' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          Reactivate
        </button>
      )}

      {currentStatus === 'rejected' && (
        <button
          onClick={() => updateStatus('approved')}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#ccc' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          Approve
        </button>
      )}
    </div>
  )
}
