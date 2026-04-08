'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStatusBanner } from '@/hooks/useStatusBanner'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

interface VendorFeeOverrideProps {
  vendorId: string
  currentOverridePercent: number | null
  feeDiscountCode: string | null
  approvedAt: string | null
}

export default function VendorFeeOverride({
  vendorId,
  currentOverridePercent,
  feeDiscountCode,
  approvedAt,
}: VendorFeeOverrideProps) {
  const router = useRouter()
  const { showBanner, StatusBanner } = useStatusBanner()
  const [loading, setLoading] = useState(false)
  const [feeRate, setFeeRate] = useState<string>(
    currentOverridePercent !== null ? String(currentOverridePercent) : ''
  )
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'default' | 'danger'; onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: () => {} })

  const hasCode = feeDiscountCode && feeDiscountCode.trim().length > 0
  const hasOverride = currentOverridePercent !== null

  const handleSave = () => {
    const rate = feeRate.trim() === '' ? null : Number(feeRate)

    if (rate !== null && (isNaN(rate) || rate < 3.6 || rate > 6.5)) {
      showBanner('error', 'Fee rate must be between 3.6% and 6.5%')
      return
    }

    const action = rate === null ? 'Clear' : 'Set'
    const rateDisplay = rate === null ? 'standard (6.5%)' : `${rate}%`

    setConfirmDialog({
      open: true,
      title: `${action} Vendor Fee Rate`,
      message: `${action} the vendor fee rate to ${rateDisplay}? This affects the vendor's payout on all future orders.`,
      confirmLabel: action,
      variant: rate === null ? 'danger' : 'default',
      onConfirm: () => executeSave(rate),
    })
  }

  const executeSave = async (rate: number | null) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/fee-override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_fee_override_percent: rate }),
      })

      if (res.ok) {
        showBanner('success', rate !== null
          ? `Vendor fee set to ${rate}%`
          : 'Vendor fee reset to standard (6.5%)')
        router.refresh()
      } else {
        const err = await res.json()
        showBanner('error', err.error || 'Failed to update fee')
      }
    } catch {
      showBanner('error', 'Failed to update fee override')
    }
    setLoading(false)
  }

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 12,
      padding: 20,
      border: '1px solid #e5e7eb',
    }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600 }}>
        Vendor Fee Discount
      </h3>

      {/* Discount Code Display */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
          Partner / Grant Code
        </div>
        {hasCode ? (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            backgroundColor: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            color: '#92400e',
          }}>
            {feeDiscountCode}
          </div>
        ) : (
          <div style={{ fontSize: 14, color: '#9ca3af', fontStyle: 'italic' }}>
            No code entered by vendor
          </div>
        )}
      </div>

      {/* Current Status */}
      {hasOverride && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: '#d1fae5',
          border: '1px solid #6ee7b7',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 13,
        }}>
          <span style={{ fontWeight: 600, color: '#065f46' }}>
            Active discount: {currentOverridePercent}% vendor fee
          </span>
          {approvedAt && (
            <span style={{ color: '#047857', marginLeft: 8 }}>
              (set {new Date(approvedAt).toLocaleDateString()})
            </span>
          )}
          <span style={{ color: '#065f46', marginLeft: 8 }}>
            — Standard is 6.5%
          </span>
        </div>
      )}

      {/* Fee Rate Input */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, maxWidth: 200 }}>
          <label style={{
            display: 'block',
            marginBottom: 4,
            fontSize: 13,
            fontWeight: 600,
            color: '#374151',
          }}>
            Vendor Fee Rate (%)
          </label>
          <input
            type="number"
            step="0.1"
            min="3.6"
            max="6.5"
            value={feeRate}
            onChange={(e) => setFeeRate(e.target.value)}
            placeholder="6.5"
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 15,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
            Min 3.6% (covers Stripe) — Max 6.5% (standard)
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          style={{
            padding: '8px 20px',
            backgroundColor: loading ? '#ccc' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 14,
            cursor: loading ? 'not-allowed' : 'pointer',
            height: 38,
          }}
        >
          {loading ? 'Saving...' : 'Set Rate'}
        </button>

        {hasOverride && (
          <button
            onClick={() => {
              setFeeRate('')
              setConfirmDialog({
                open: true,
                title: 'Clear Fee Discount',
                message: 'Reset this vendor to the standard 6.5% fee rate? This takes effect on future orders.',
                confirmLabel: 'Clear Discount',
                variant: 'danger',
                onConfirm: () => executeSave(null),
              })
            }}
            disabled={loading}
            style={{
              padding: '8px 16px',
              backgroundColor: loading ? '#ccc' : '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              height: 38,
            }}
          >
            Clear
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
