'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface OnboardingSkipAckCheckboxProps {
  marketId: string
  /** Which ack flag this checkbox controls. The component knows the
   *  human-readable label + the JSON body key for each. */
  ackType: 'no_existing_vendors_ack' | 'no_placeholders_ack'
  initialValue: boolean
}

const LABELS: Record<OnboardingSkipAckCheckboxProps['ackType'], string> = {
  no_existing_vendors_ack: 'I have no existing on-platform vendors at this market yet.',
  no_placeholders_ack: 'I have no off-platform vendors (booth placeholders) at this market yet.',
}

/**
 * Mig 145: lets a manager mark a vendors / placeholders step as
 * legitimately empty so the onboarding checklist counts it as
 * complete. The alternative would be either lying ("just add a fake
 * row") or having the step remain forever-incomplete for new markets
 * with no vendors yet. Server-truth is stored on markets via the
 * onboarding-acks PUT route.
 *
 * Optimistic update: toggle flips the box immediately, calls the API,
 * reverts on error. No need to reload the page — onboarding-progress
 * is read on next navigation.
 */
export default function OnboardingSkipAckCheckbox({
  marketId,
  ackType,
  initialValue,
}: OnboardingSkipAckCheckboxProps) {
  const [checked, setChecked] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = async (nextValue: boolean) => {
    setChecked(nextValue) // optimistic
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/onboarding-acks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [ackType]: nextValue }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to save')
        setChecked(!nextValue) // revert
      }
    } catch {
      setError('Network error')
      setChecked(!nextValue)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: colors.surfaceBase,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      marginBottom: spacing.sm,
    }}>
      <label style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.xs,
        cursor: saving ? 'wait' : 'pointer',
        fontSize: typography.sizes.sm,
        color: colors.textPrimary,
        lineHeight: 1.5,
      }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => handleChange(e.target.checked)}
          disabled={saving}
          style={{ marginTop: 3, cursor: saving ? 'wait' : 'pointer' }}
        />
        <span>
          {LABELS[ackType]}{' '}
          <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>
            Check this to mark the step done while you wait to add them.
          </span>
        </span>
      </label>
      {error && (
        <div style={{
          marginTop: spacing['3xs'],
          fontSize: typography.sizes.xs,
          color: '#b91c1c',
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
