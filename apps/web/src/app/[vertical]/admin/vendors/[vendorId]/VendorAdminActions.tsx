'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface VendorAdminActionsProps {
  vendorId: string
  vertical: string
  currentStatus: string
  eventApproved: boolean
  hasCoiApproved: boolean
}

export default function VendorAdminActions({
  vendorId,
  vertical,
  currentStatus,
  eventApproved: initialEventApproved,
  hasCoiApproved,
}: VendorAdminActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [eventApproved, setEventApproved] = useState(initialEventApproved)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'default' | 'danger'; onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: () => {} })

  const toggleEventApproval = (approve: boolean) => {
    if (approve && !hasCoiApproved) {
      setMessage({ type: 'error', text: 'Vendor must have approved Certificate of Insurance before event approval.' })
      return
    }
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
    setConfirmDialog(prev => ({ ...prev, open: false }))
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/event-approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_approved: approve }),
      })
      if (res.ok) {
        setEventApproved(approve)
        setMessage({ type: 'success', text: approve ? 'Vendor approved for events' : 'Event approval revoked' })
        router.refresh()
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.error || 'Failed to update event approval' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update event approval' })
    }
    setLoading(false)
  }

  const isEventEnabled = vertical === 'food_trucks' || vertical === 'farmers_market'
  const isApproved = currentStatus === 'approved'

  return (
    <div>
      {message && (
        <div style={{
          padding: spacing.xs,
          backgroundColor: message.type === 'success' ? '#d1fae5' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#6ee7b7' : '#fca5a5'}`,
          borderRadius: radius.sm,
          color: message.type === 'success' ? '#065f46' : '#991b1b',
          fontSize: typography.sizes.sm,
          marginBottom: spacing.xs,
        }}>
          {message.text}
        </div>
      )}

      {/* Event Approval — FT approved vendors only */}
      {isEventEnabled && isApproved && (
        <div>
          {!eventApproved ? (
            <button
              onClick={() => toggleEventApproval(true)}
              disabled={loading}
              style={{
                padding: `${spacing.xs} ${spacing.md}`,
                backgroundColor: loading ? colors.surfaceMuted : '#059669',
                color: 'white',
                border: 'none',
                borderRadius: radius.md,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Approve for Events
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
              <span style={{
                padding: `${spacing['3xs']} ${spacing.sm}`,
                backgroundColor: '#d1fae5',
                color: '#065f46',
                borderRadius: radius.full,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
              }}>
                Event Approved
              </span>
              <button
                onClick={() => toggleEventApproval(false)}
                disabled={loading}
                style={{
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: 'transparent',
                  color: '#991b1b',
                  border: `1px solid #fca5a5`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                Revoke
              </button>
            </div>
          )}
        </div>
      )}

      {/* Not eligible message */}
      {isEventEnabled && !isApproved && (
        <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: 0 }}>
          Vendor must be approved before event eligibility.
        </p>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
    </div>
  )
}
