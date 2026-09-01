'use client'

/**
 * VendorStatusActions — account-status actions for the merged vendor detail
 * (admin UI rebuild phase 4, owner 2026-08-31). This is the old platform
 * VendorActions with its event-approval section REMOVED: the event toggle
 * lives in VendorEventApproval (from the vertical copy), whose rule is the
 * stricter superset (FT + FM, COI-gated, not-applied warning) — keeping the
 * platform copy's FT-only, no-COI-gate toggle too would have rendered two
 * conflicting toggles. Everything else is verbatim: approve via the API
 * route (trial auto-grant + notification live there), the coordinates gate
 * on approval, reject/suspend via direct update (pre-existing pattern,
 * unchanged), reactivate, re-approve.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useStatusBanner } from '@/hooks/useStatusBanner'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

interface VendorStatusActionsProps {
  vendorId: string
  currentStatus: string
  vendorLatitude?: number | null
  vendorLongitude?: number | null
  onboardingComplete?: boolean
}

export default function VendorStatusActions({ vendorId, currentStatus, vendorLatitude, vendorLongitude, onboardingComplete = false }: VendorStatusActionsProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { showBanner, StatusBanner } = useStatusBanner()
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'default' | 'danger'; onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: () => {} })

  const hasValidCoordinates = vendorLatitude != null && vendorLongitude != null

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
    if (newStatus === 'approved' && !hasValidCoordinates) {
      setError('Cannot approve vendor without coordinates. Please set the vendor\'s Latitude and Longitude first using the Location Editor.')
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
      // API route — handles trial auto-grant + notification
      try {
        const res = await fetch(`/api/admin/vendors/${vendorId}/approve`, { method: 'POST' })
        const result = await res.json()
        if (!res.ok) {
          showBanner('error', 'Failed to approve: ' + (result.error || 'Unknown error'))
          setLoading(false)
          return
        }
      } catch {
        showBanner('error', 'Failed to approve vendor')
        setLoading(false)
        return
      }
    } else {
      // Direct DB update for reject/suspend (pre-existing pattern, unchanged)
      const { error } = await supabase
        .from('vendor_profiles')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
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

  const primaryButton = (disabled: boolean, danger = false, amber = false) => ({
    padding: '10px 20px',
    backgroundColor: disabled ? '#ccc' : danger ? '#ef4444' : amber ? '#f59e0b' : '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  })

  return (
    <div>
      {(currentStatus === 'submitted' || currentStatus === 'draft' || currentStatus === 'rejected') && !hasValidCoordinates && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#92400e' }}>Coordinates Required for Approval</p>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#92400e' }}>
                Set the vendor&apos;s location using the Location Editor before approving. Without coordinates, the vendor won&apos;t appear in buyer location searches.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fee2e2', border: '1px solid #ef4444', borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#991b1b' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(currentStatus === 'submitted' || currentStatus === 'draft') && (
          <>
            <button
              onClick={() => updateStatus('approved')}
              disabled={loading || !hasValidCoordinates}
              title={!hasValidCoordinates ? 'Set coordinates first' : 'Preliminary approval — confirms legitimate business'}
              style={{ ...primaryButton(loading || !hasValidCoordinates), opacity: !hasValidCoordinates ? 0.7 : 1 }}
            >
              Approve Vendor Account
            </button>
            <button onClick={() => updateStatus('rejected')} disabled={loading} style={primaryButton(loading, true)}>
              Reject Application
            </button>
          </>
        )}

        {currentStatus === 'approved' && (
          <button onClick={() => updateStatus('suspended')} disabled={loading} style={primaryButton(loading, false, true)}>
            Suspend
          </button>
        )}

        {currentStatus === 'suspended' && (
          <button
            onClick={() => updateStatus('approved')}
            disabled={loading || !hasValidCoordinates}
            title={!hasValidCoordinates ? 'Set coordinates first' : 'Reactivate this vendor'}
            style={{ ...primaryButton(loading || !hasValidCoordinates), opacity: !hasValidCoordinates ? 0.7 : 1 }}
          >
            Reactivate
          </button>
        )}

        {currentStatus === 'rejected' && (
          <button
            onClick={() => updateStatus('approved')}
            disabled={loading || !hasValidCoordinates}
            title={!hasValidCoordinates ? 'Set coordinates first' : 'Approve this vendor account'}
            style={{ ...primaryButton(loading || !hasValidCoordinates), opacity: !hasValidCoordinates ? 0.7 : 1 }}
          >
            Approve Vendor Account
          </button>
        )}
      </div>

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
