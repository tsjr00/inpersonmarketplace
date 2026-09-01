'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { useStatusBanner } from '@/hooks/useStatusBanner'

/**
 * Market detail action strip (admin UI rebuild phase 5, owner 2026-08-31).
 *
 * The row-level actions from the vertical markets LIST page, made available
 * on the market DETAIL page so phones don't need landscape mode to reach
 * approve / suspend / delete (owner finding 2026-08-30). Same rules as the
 * list rows:
 *  - Approve / Reject → vendor-suggested markets (approval_status='pending';
 *    rejected markets can be re-approved)
 *  - Suspend / Unsuspend → private_pickup only (admin PUT for private
 *    pickups accepts ONLY status — all other fields are vendor-managed)
 *  - Delete → any type; the server blocks deletion when the market has
 *    listings or booth/park/credit financial history (ADM-3 guard in
 *    /api/admin/markets/[id] DELETE)
 *
 * All calls go through the GUARDED admin API (/api/admin/markets/[id]) —
 * never /api/markets/[id], whose DELETE has no financial-history guard.
 */
interface MarketDetailActionsProps {
  marketId: string
  marketName: string
  marketType: string
  status: string
  approvalStatus: string | null
  /** Where Delete returns to (the vertical or platform markets list). */
  listHref: string
}

export default function MarketDetailActions({
  marketId,
  marketName,
  marketType,
  status,
  approvalStatus,
  listHref,
}: MarketDetailActionsProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const { showBanner, StatusBanner } = useStatusBanner()
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'default' | 'danger'; showInput?: boolean; inputLabel?: string;
    onConfirm: (input?: string) => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: () => {} })

  const put = async (body: Record<string, unknown>, failMsg: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/markets/${marketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        router.refresh()
      } else {
        const error = await res.json().catch(() => ({}))
        showBanner('error', error.error || failMsg)
      }
    } catch {
      showBanner('error', failMsg)
    } finally {
      setBusy(false)
    }
  }

  const executeDelete = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/markets/${marketId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push(listHref)
      } else {
        const error = await res.json().catch(() => ({}))
        showBanner('error', error.error || 'Failed to delete market')
        setBusy(false)
      }
    } catch {
      showBanner('error', 'Failed to delete market')
      setBusy(false)
    }
  }

  const btn = (bg: string, fg = 'white'): CSSProperties => ({
    padding: '8px 14px',
    backgroundColor: bg,
    color: fg,
    border: 'none',
    borderRadius: 6,
    cursor: busy ? 'not-allowed' : 'pointer',
    fontSize: 14,
    fontWeight: 500,
    opacity: busy ? 0.6 : 1,
  })

  const isSuspended = status === 'suspended'

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Approve / Reject for vendor-suggested markets */}
      {approvalStatus === 'pending' && (
        <>
          <button
            disabled={busy}
            onClick={() => put({ approval_status: 'approved' }, 'Failed to approve market')}
            style={btn('#16a34a')}
          >
            Approve suggestion
          </button>
          <button
            disabled={busy}
            onClick={() => setConfirmDialog({
              open: true, title: 'Reject Market', variant: 'danger', confirmLabel: 'Reject',
              message: 'Are you sure you want to reject this market suggestion?',
              showInput: true, inputLabel: 'Reason for rejection (optional)',
              onConfirm: (reason) => put({ approval_status: 'rejected', rejection_reason: reason || null }, 'Failed to reject market'),
            })}
            style={btn('#ef4444')}
          >
            Reject
          </button>
        </>
      )}
      {approvalStatus === 'rejected' && (
        <button
          disabled={busy}
          onClick={() => put({ approval_status: 'approved' }, 'Failed to approve market')}
          style={btn('#16a34a')}
        >
          Approve suggestion
        </button>
      )}

      {/* Suspend / Unsuspend — private pickups only (admin PUT accepts only status for them) */}
      {marketType === 'private_pickup' && (
        <button
          disabled={busy}
          onClick={() => setConfirmDialog({
            open: true,
            title: `${isSuspended ? 'Unsuspend' : 'Suspend'} Market`,
            variant: isSuspended ? 'default' : 'danger',
            confirmLabel: isSuspended ? 'Unsuspend' : 'Suspend',
            message: `Are you sure you want to ${isSuspended ? 'unsuspend' : 'suspend'} "${marketName}"?${!isSuspended ? ' This will prevent buyers from seeing this pickup location.' : ''}`,
            onConfirm: () => put({ status: isSuspended ? 'active' : 'suspended' }, `Failed to ${isSuspended ? 'unsuspend' : 'suspend'} market`),
          })}
          style={btn(isSuspended ? '#16a34a' : '#f59e0b')}
        >
          {isSuspended ? 'Unsuspend' : 'Suspend'}
        </button>
      )}

      <button
        disabled={busy}
        onClick={() => setConfirmDialog({
          open: true, title: 'Delete Market', variant: 'danger', confirmLabel: 'Delete',
          message: `Delete market "${marketName}"? This will affect all vendor listings at this market. Deletion is blocked if the market has listings or financial history (booth rentals, park bookings, credits) — deactivate it instead.`,
          onConfirm: () => executeDelete(),
        })}
        style={{ ...btn('#fff', '#dc3545'), border: '1px solid #dc3545' }}
      >
        Delete
      </button>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        showInput={confirmDialog.showInput}
        inputLabel={confirmDialog.inputLabel}
        onConfirm={(input) => {
          confirmDialog.onConfirm(input)
          setConfirmDialog(prev => ({ ...prev, open: false }))
        }}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
      <StatusBanner />
    </div>
  )
}
