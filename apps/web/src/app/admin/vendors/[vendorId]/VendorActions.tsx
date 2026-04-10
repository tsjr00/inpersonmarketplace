'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useStatusBanner } from '@/hooks/useStatusBanner'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

interface VendorActionsProps {
  vendorId: string
  currentStatus: string
  vendorLatitude?: number | null
  vendorLongitude?: number | null
  eventApproved?: boolean
  verticalId?: string
  onboardingComplete?: boolean
}

export default function VendorActions({ vendorId, currentStatus, vendorLatitude, vendorLongitude, eventApproved = false, verticalId, onboardingComplete = false }: VendorActionsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { showBanner, StatusBanner } = useStatusBanner()
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'default' | 'danger'; onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: () => {} })

  const [eventApprovedState, setEventApprovedState] = useState(eventApproved)

  const hasValidCoordinates = vendorLatitude != null && vendorLongitude != null

  const toggleEventApproval = (approve: boolean) => {
    setConfirmDialog({
      open: true,
      title: approve ? 'Approve for Events' : 'Revoke Event Approval',
      message: approve
        ? 'Approve this vendor for private events? They will be able to mark menu items as event-ready.'
        : 'Revoke event approval? The vendor will no longer be able to mark items as event-ready.',
      confirmLabel: approve ? 'Approve' : 'Revoke',
      variant: approve ? 'default' : 'danger',
      onConfirm: () => executeEventApproval(approve),
    })
  }

  const executeEventApproval = async (approve: boolean) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/event-approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_approved: approve }),
      })
      if (res.ok) {
        setEventApprovedState(approve)
        showBanner('success', approve ? 'Vendor approved for events' : 'Event approval revoked')
        router.refresh()
      } else {
        const err = await res.json()
        showBanner('error', err.error || 'Failed to update event approval')
      }
    } catch {
      showBanner('error', 'Failed to update event approval')
    }
    setLoading(false)
  }

  const onboardingWarning = !onboardingComplete
    ? '\n\n⚠️ This vendor has NOT completed onboarding documents. Approving them grants account access, but they will not be able to publish listings until their documents are verified.'
    : ''

  const confirmMessages: Record<string, string> = {
    approved: 'Approve this vendor account? This confirms they are a legitimate business. They will still need to upload and have documents verified before publishing listings.' + onboardingWarning,
    rejected: 'Reject this application? The vendor will need to reapply.',
    suspended: 'Suspend this vendor? Their listings will be hidden.'
  }

  const updateStatus = (newStatus: string) => {
    setError('')

    // Check coordinates before approving
    if (newStatus === 'approved' && !hasValidCoordinates) {
      setError('Cannot approve vendor without coordinates. Please set the vendor\'s Latitude and Longitude first using the Location Editor above.')
      return
    }

    const variant = (newStatus === 'rejected' || newStatus === 'suspended') ? 'danger' : 'default'
    const confirmLabel = newStatus === 'approved' ? 'Approve' : newStatus === 'rejected' ? 'Reject' : 'Suspend'

    setConfirmDialog({
      open: true,
      title: `${confirmLabel} Vendor`,
      message: confirmMessages[newStatus] || `Change status to ${newStatus}?`,
      confirmLabel,
      variant,
      onConfirm: () => executeUpdateStatus(newStatus),
    })
  }

  const executeUpdateStatus = async (newStatus: string) => {
    setLoading(true)

    if (newStatus === 'approved') {
      // Use API route for approve — handles trial auto-grant + notification
      try {
        const res = await fetch(`/api/admin/vendors/${vendorId}/approve`, { method: 'POST' })
        const result = await res.json()
        if (!res.ok) {
          showBanner('error', 'Failed to approve: ' + (result.error || 'Unknown error'))
          setLoading(false)
          return
        }
      } catch (err) {
        showBanner('error', 'Failed to approve vendor')
        setLoading(false)
        return
      }
    } else {
      // Direct DB update for reject/suspend (no trial logic needed)
      const { error } = await supabase
        .from('vendor_profiles')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', vendorId)

      if (error) {
        showBanner('error', 'Failed to update status: ' + error.message)
        setLoading(false)
        return
      }
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
            title={!hasValidCoordinates ? 'Set coordinates first' : 'Preliminary approval — confirms legitimate business'}
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
            Approve Vendor Account
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
            Reject Application
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
          title={!hasValidCoordinates ? 'Set coordinates first' : 'Approve this vendor account'}
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
          Approve Vendor Account
        </button>
      )}
      </div>

      {/* Event Approval — only for approved FT vendors */}
      {currentStatus === 'approved' && verticalId === 'food_trucks' && (
        <div style={{ marginTop: 12 }}>
          {!eventApprovedState ? (
            <button
              onClick={() => toggleEventApproval(true)}
              disabled={loading}
              style={{
                padding: '10px 20px',
                backgroundColor: loading ? '#ccc' : '#059669',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Approve for Events
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                padding: '4px 10px',
                backgroundColor: '#d1fae5',
                color: '#065f46',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 600,
              }}>
                ✓ Event Approved
              </span>
              <button
                onClick={() => toggleEventApproval(false)}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  backgroundColor: loading ? '#ccc' : '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                Revoke
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, open: false })) }}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
      <StatusBanner />
    </div>
  )
}
