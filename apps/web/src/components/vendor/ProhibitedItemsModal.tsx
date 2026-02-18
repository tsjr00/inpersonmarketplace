'use client'

import { useEffect } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { getVerticalProhibitedItems } from '@/lib/onboarding/category-requirements'

interface Props {
  vertical: string
  onAcknowledge: () => void
  onClose: () => void
}

export default function ProhibitedItemsModal({ vertical, onAcknowledge, onClose }: Props) {
  const prohibitedItems = getVerticalProhibitedItems(vertical)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: spacing.sm,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          maxWidth: 560,
          width: '100%',
          maxHeight: '85vh',
          overflow: 'auto',
          padding: spacing.md,
        }}
      >
        <h2 style={{
          margin: `0 0 ${spacing.xs} 0`,
          color: colors.textPrimary,
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.bold,
        }}>
          Prohibited Items Policy
        </h2>

        <p style={{
          margin: `0 0 ${spacing.sm} 0`,
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
          lineHeight: 1.5,
        }}>
          The following items are strictly prohibited from being sold on our platform.
          Violations may result in immediate account suspension.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {prohibitedItems.map((item, i) => (
            <div key={i} style={{
              padding: spacing.xs,
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: radius.sm,
            }}>
              <div style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: '#991b1b',
              }}>
                {i + 1}. {item.item}
              </div>
              <div style={{
                fontSize: typography.sizes.xs,
                color: '#7f1d1d',
                marginTop: 2,
              }}>
                {item.description}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: spacing.md,
          display: 'flex',
          gap: spacing.xs,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              backgroundColor: 'transparent',
              color: colors.textMuted,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              fontSize: typography.sizes.sm,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onAcknowledge}
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              backgroundColor: colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: radius.md,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer',
            }}
          >
            I Acknowledge This Policy
          </button>
        </div>
      </div>
    </div>
  )
}
