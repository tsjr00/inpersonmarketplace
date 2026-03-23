'use client'
import { useState } from 'react'
import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'

interface Props {
  vendorId: string
  currentLeadMinutes: number
}

export default function PickupLeadTimeForm({ vendorId, currentLeadMinutes }: Props) {
  const [leadMinutes, setLeadMinutes] = useState(currentLeadMinutes)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

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
        Choose the minimum time you need to prepare an order after a buyer places it. If you select 15 minutes, you guarantee at least 15 minutes of prep time before the buyer arrives. If you select 30 minutes, you get at least 30. The actual window may be longer — this is just the minimum.
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
