'use client'

import { useState } from 'react'
import { formatPrice } from '@/lib/constants'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface ChipInSelectorProps {
  chipinCents: number
  onChange: (cents: number) => void
  beneficiaryName: string
}

const PRESETS = [
  { label: 'No thanks', cents: 0 },
  { label: '$1', cents: 100 },
  { label: '$3', cents: 300 },
  { label: '$5', cents: 500 },
]

/**
 * Community Chip In selector at checkout (event orders with chip-in enabled).
 * Amount-based (mirrors the tip UI's shape). The chosen cents + the event's
 * beneficiary are re-validated server-side at /api/checkout/session.
 */
export function ChipInSelector({ chipinCents, onChange, beneficiaryName }: ChipInSelectorProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const isPreset = !showCustom && PRESETS.some((p) => p.cents === chipinCents)

  return (
    <div style={{
      marginBottom: spacing['2xs'],
      padding: spacing.xs,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.sm,
      border: `1px solid ${colors.border}`,
    }}>
      <div style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing['2xs'] }}>
        Chip in for {beneficiaryName}?
      </div>
      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing['2xs'] }}>
        100% goes to {beneficiaryName}. Not a tax-deductible donation.
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {PRESETS.map((option) => {
          const active = !showCustom && chipinCents === option.cents
          return (
            <button
              key={option.cents}
              type="button"
              onClick={() => { onChange(option.cents); setShowCustom(false); setCustomInput('') }}
              style={{
                flex: 1, minWidth: 52, padding: `${spacing['2xs']} ${spacing['2xs']}`,
                border: active ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                backgroundColor: active ? colors.primaryLight : colors.surfaceElevated,
                cursor: 'pointer', fontSize: typography.sizes.xs,
                fontWeight: active ? typography.weights.semibold : typography.weights.normal,
                color: colors.textPrimary,
              }}
            >
              {option.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => { setShowCustom(true); setCustomInput(chipinCents > 0 && !isPreset ? String(chipinCents / 100) : '') }}
          style={{
            flex: 1, minWidth: 52, padding: `${spacing['2xs']} ${spacing['2xs']}`,
            border: showCustom ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: showCustom ? colors.primaryLight : colors.surfaceElevated,
            cursor: 'pointer', fontSize: typography.sizes.xs,
            fontWeight: showCustom ? typography.weights.semibold : typography.weights.normal,
            color: colors.textPrimary,
          }}
        >
          Custom
        </button>
      </div>
      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], marginTop: spacing['2xs'] }}>
          <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>$</span>
          <input
            type="number"
            min="0"
            max="200"
            step="1"
            value={customInput}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9.]/g, '')
              setCustomInput(val)
              const dollars = parseFloat(val)
              onChange(isNaN(dollars) ? 0 : Math.min(Math.round(dollars * 100), 20000))
            }}
            placeholder="0"
            style={{
              width: 70, padding: `${spacing['2xs']} ${spacing.xs}`,
              border: `1px solid ${colors.border}`, borderRadius: radius.sm,
              fontSize: typography.sizes.sm, textAlign: 'center',
            }}
          />
        </div>
      )}
      {chipinCents > 0 && (
        <div style={{ marginTop: spacing['2xs'], fontSize: typography.sizes.xs, color: colors.textSecondary }}>
          Chipping in {formatPrice(chipinCents)} for {beneficiaryName}
        </div>
      )}
    </div>
  )
}
