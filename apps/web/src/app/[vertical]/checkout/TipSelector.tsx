'use client'

import { useState } from 'react'
import { formatPrice } from '@/lib/constants'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface TipSelectorProps {
  tipPercentage: number
  onTipChange: (percentage: number) => void
  tipAmountCents: number
}

export function TipSelector({ tipPercentage, onTipChange, tipAmountCents }: TipSelectorProps) {
  const [customTipInput, setCustomTipInput] = useState<string>('')
  const [showCustomTip, setShowCustomTip] = useState(false)

  return (
    <div style={{
      marginBottom: spacing['2xs'],
      padding: spacing.xs,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.sm,
      border: `1px solid ${colors.border}`,
    }}>
      <div style={{
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
        marginBottom: spacing['2xs'],
      }}>
        Add a tip
      </div>
      <div style={{
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        marginBottom: spacing['2xs'],
      }}>
        Your tip goes directly to the vendor
      </div>
      <div style={{
        display: 'flex',
        gap: 4,
        flexWrap: 'wrap',
      }}>
        {[
          { label: 'No Tip', value: 0 },
          { label: '10%', value: 10 },
          { label: '15%', value: 15 },
          { label: '20%', value: 20 },
        ].map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onTipChange(option.value)
              setShowCustomTip(false)
              setCustomTipInput('')
            }}
            style={{
              flex: 1,
              minWidth: 52,
              padding: `${spacing['2xs']} ${spacing['2xs']}`,
              border: tipPercentage === option.value && !showCustomTip
                ? `2px solid ${colors.primary}`
                : `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              backgroundColor: tipPercentage === option.value && !showCustomTip
                ? colors.primaryLight
                : colors.surfaceElevated,
              cursor: 'pointer',
              fontSize: typography.sizes.xs,
              fontWeight: tipPercentage === option.value && !showCustomTip
                ? typography.weights.semibold
                : typography.weights.normal,
              color: colors.textPrimary,
            }}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setShowCustomTip(true)
            setCustomTipInput(tipPercentage > 0 ? String(tipPercentage) : '')
          }}
          style={{
            flex: 1,
            minWidth: 52,
            padding: `${spacing['2xs']} ${spacing['2xs']}`,
            border: showCustomTip
              ? `2px solid ${colors.primary}`
              : `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            backgroundColor: showCustomTip ? colors.primaryLight : colors.surfaceElevated,
            cursor: 'pointer',
            fontSize: typography.sizes.xs,
            fontWeight: showCustomTip ? typography.weights.semibold : typography.weights.normal,
            color: colors.textPrimary,
          }}
        >
          Custom
        </button>
      </div>
      {showCustomTip && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing['2xs'],
          marginTop: spacing['2xs'],
        }}>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={customTipInput}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, '')
              setCustomTipInput(val)
              const num = parseInt(val, 10)
              onTipChange(isNaN(num) ? 0 : Math.min(num, 100))
            }}
            placeholder="0"
            style={{
              width: 60,
              padding: `${spacing['2xs']} ${spacing.xs}`,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              textAlign: 'center',
            }}
          />
          <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>%</span>
        </div>
      )}
      {tipAmountCents > 0 && (
        <div style={{
          marginTop: spacing['2xs'],
          fontSize: typography.sizes.xs,
          color: colors.textSecondary,
        }}>
          Tip: {formatPrice(tipAmountCents)}
        </div>
      )}
    </div>
  )
}
