'use client'
import { useState } from 'react'
import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'

interface Props {
  vendorId: string
  currentLeadMinutes: number
  /** mig 216: slot length the vendor's pickup capacity was set against, if any. */
  capacitySlotMinutes?: number | null | undefined
}

export default function PickupLeadTimeForm({ vendorId, currentLeadMinutes, capacitySlotMinutes }: Props) {
  const [leadMinutes, setLeadMinutes] = useState(currentLeadMinutes)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [capacityStale, setCapacityStale] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setMessage('')

    try {
      const res = await fetch('/api/vendor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          pickup_lead_minutes: leadMinutes
        })
      })

      if (res.ok) {
        setMessage('Lead time updated!')
        setTimeout(() => setMessage(''), 3000)
        // mig 216: lead time IS the slot length (time-slots.ts:49). Changing it
        // silently invalidates a capacity number set for the old slot length —
        // e.g. 30→15 halves every slot, so the old cap is ~2x too high.
        if (capacitySlotMinutes != null && capacitySlotMinutes !== leadMinutes) {
          setCapacityStale(true)
        }
      } else {
        const data = await res.json()
        setMessage(data.error || 'Failed to update')
      }
    } catch {
      setMessage('Error updating lead time')
    } finally {
      setSaving(false)
    }
  }

  const hasChanged = leadMinutes !== currentLeadMinutes

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: Number(radius.md.replace('px', '')),
      padding: spacing.md,
      border: `1px solid ${colors.border}`
    }}>
      <h2 style={{
        margin: `0 0 ${spacing.xs} 0`,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold
      }}>
        Pickup Prep Time
      </h2>
      <p style={{
        margin: `0 0 ${spacing.sm} 0`,
        fontSize: typography.sizes.sm,
        color: colors.textMuted
      }}>
        Choose the minimum time you need to prepare an order after a buyer places it. If you select 15 minutes, you guarantee at least 15 minutes of prep time before the buyer arrives. If you select 30 minutes, you get at least 30. Based on the pick-up time the customer selects when they place their order, you may have much more prep time — 15 or 30 minutes is just the minimum.
      </p>

      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm }}>
        {[15, 30].map(val => (
          <button
            key={val}
            onClick={() => setLeadMinutes(val)}
            style={{
              flex: 1,
              padding: `${spacing.sm} ${spacing.md}`,
              borderRadius: radius.sm,
              border: `2px solid ${leadMinutes === val ? colors.primary : colors.border}`,
              backgroundColor: leadMinutes === val ? `${colors.primary}10` : 'white',
              color: leadMinutes === val ? colors.primary : colors.textSecondary,
              fontWeight: leadMinutes === val ? typography.weights.bold : typography.weights.medium,
              fontSize: typography.sizes.base,
              cursor: 'pointer',
              minHeight: '48px',
              transition: 'all 0.15s ease'
            }}
          >
            {val} min
          </button>
        ))}
      </div>

      <p style={{
        margin: `0 0 ${spacing.sm} 0`,
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        fontStyle: 'italic'
      }}>
        {leadMinutes === 15
          ? 'Fast prep — you will have at least 15 minutes between when a buyer orders and when they arrive. Arrival times shown in 15-minute increments.'
          : 'Standard prep — you will have at least 30 minutes between when a buyer orders and when they arrive. Arrival times shown in 30-minute increments.'}
      </p>

      {capacityStale && (
        <div style={{
          padding: spacing.sm, marginBottom: spacing.sm, borderRadius: radius.sm,
          background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e',
          fontSize: typography.sizes.sm, lineHeight: 1.5,
        }}>
          <strong>Your order capacity is set based on your order lead time — your order capacity probably needs to be
          changed to match your new lead time.</strong><br />
          Your pickup slots are now {leadMinutes} minutes long, but your capacity was set for {capacitySlotMinutes}-minute
          slots. Update it in <strong>Pickup Capacity</strong> below.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanged}
          style={{
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: hasChanged ? colors.primary : colors.border,
            color: hasChanged ? 'white' : colors.textMuted,
            border: 'none',
            borderRadius: radius.sm,
            fontWeight: typography.weights.semibold,
            fontSize: typography.sizes.sm,
            cursor: hasChanged ? 'pointer' : 'default',
            opacity: saving ? 0.6 : 1,
            minHeight: '40px'
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {message && (
          <span style={{
            fontSize: typography.sizes.sm,
            color: message.includes('updated') ? statusColors.success : statusColors.danger,
            fontWeight: typography.weights.medium
          }}>
            {message}
          </span>
        )}
      </div>
    </div>
  )
}
