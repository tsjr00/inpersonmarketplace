'use client'

import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import type { PaymentMethod } from './types'

interface PaymentMethodSelectorProps {
  methods: PaymentMethod[]
  selected: string | null
  onSelect: (id: string) => void
}

export function PaymentMethodSelector({ methods, selected, onSelect }: PaymentMethodSelectorProps) {
  if (methods.length <= 1) {
    if (methods.length === 1) {
      return (
        <div style={{
          marginBottom: spacing.sm,
          padding: spacing.xs,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.md,
          fontSize: typography.sizes.sm,
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs
        }}>
          <span>{methods[0].icon}</span>
          <span>Pay with {methods[0].name}</span>
        </div>
      )
    }
    return null
  }

  return (
    <div style={{
      marginBottom: spacing.sm,
      padding: spacing.sm,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      border: `1px solid ${colors.border}`
    }}>
      <h3 style={{
        margin: `0 0 ${spacing.xs} 0`,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary
      }}>
        Payment Method
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {methods.map(method => (
          <label
            key={method.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              padding: spacing.xs,
              backgroundColor: selected === method.id ? colors.primaryLight : colors.surfaceElevated,
              border: selected === method.id ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              cursor: 'pointer'
            }}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={method.id}
              checked={selected === method.id}
              onChange={() => onSelect(method.id)}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontSize: typography.sizes.lg }}>{method.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: typography.weights.medium, fontSize: typography.sizes.sm }}>
                {method.name}
              </div>
              <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                {method.description}
              </div>
            </div>
          </label>
        ))}
      </div>
      {selected && selected !== 'stripe' && (
        <p style={{
          margin: `${spacing.xs} 0 0 0`,
          fontSize: typography.sizes.xs,
          color: colors.textMuted,
          fontStyle: 'italic'
        }}>
          {selected === 'cash'
            ? 'You will pay in cash when you pick up your order.'
            : `You will be redirected to complete payment via ${methods.find(m => m.id === selected)?.name}.`
          }
        </p>
      )}
    </div>
  )
}
