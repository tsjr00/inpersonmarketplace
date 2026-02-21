'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface VendorActionsProps {
  vendorId: string
  currentStatus: string
  vendorLatitude?: number | null
  vendorLongitude?: number | null
}

export default function VendorActions({ vendorId, currentStatus, vendorLatitude, vendorLongitude }: VendorActionsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const hasValidCoordinates = vendorLatitude != null && vendorLongitude != null

  const updateStatus = async (newStatus: string) => {
    setError('')

    // Check coordinates before approving
    if (newStatus === 'approved' && !hasValidCoordinates) {
      setError('Cannot approve vendor without coordinates. Please set the vendor\'s Latitude and Longitude first using the Location Editor above.')
      return
    }

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
    <div>
      {/* Coordinates warning for pending approval */}
      {(currentStatus === 'submitted' || currentStatus === 'draft' || currentStatus === 'rejected') && !hasValidCoordinates && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: 8,
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                Coordinates Required for Approval
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#92400e' }}>
                Set the vendor&apos;s location using the Location Editor above before approving. Without coordinates, the vendor won&apos;t appear in buyer location searches.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fee2e2',
          border: '1px solid #ef4444',
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 13,
          color: '#991b1b',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
      {(currentStatus === 'submitted' || currentStatus === 'draft') && (
        <>
          <button
            onClick={() => updateStatus('approved')}
            disabled={loading || !hasValidCoordinates}
            title={!hasValidCoordinates ? 'Set coordinates first' : 'Approve this vendor'}
            style={{
              padding: '10px 20px',
              backgroundColor: loading || !hasValidCoordinates ? '#ccc' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: loading || !hasValidCoordinates ? 'not-allowed' : 'pointer',
              opacity: !hasValidCoordinates ? 0.7 : 1
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
          disabled={loading || !hasValidCoordinates}
          title={!hasValidCoordinates ? 'Set coordinates first' : 'Reactivate this vendor'}
          style={{
            padding: '10px 20px',
            backgroundColor: loading || !hasValidCoordinates ? '#ccc' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: loading || !hasValidCoordinates ? 'not-allowed' : 'pointer',
            opacity: !hasValidCoordinates ? 0.7 : 1
          }}
        >
          Reactivate
        </button>
      )}

      {currentStatus === 'rejected' && (
        <button
          onClick={() => updateStatus('approved')}
          disabled={loading || !hasValidCoordinates}
          title={!hasValidCoordinates ? 'Set coordinates first' : 'Approve this vendor'}
          style={{
            padding: '10px 20px',
            backgroundColor: loading || !hasValidCoordinates ? '#ccc' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: loading || !hasValidCoordinates ? 'not-allowed' : 'pointer',
            opacity: !hasValidCoordinates ? 0.7 : 1
          }}
        >
          Approve
        </button>
      )}
      </div>
    </div>
  )
}
