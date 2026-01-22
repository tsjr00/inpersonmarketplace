'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import VendorFeedbackForm from './VendorFeedbackForm'

interface VendorFeedbackCardProps {
  vertical: string
}

export default function VendorFeedbackCard({ vertical }: VendorFeedbackCardProps) {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)

  return (
    <>
      <button
        onClick={() => setShowFeedbackForm(true)}
        style={{
          display: 'block',
          width: '100%',
          padding: spacing.md,
          backgroundColor: colors.surfaceElevated,
          color: colors.textPrimary,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          textDecoration: 'none',
          textAlign: 'left',
          cursor: 'pointer'
        }}
      >
        <h3 style={{
          marginTop: 0,
          marginBottom: spacing['2xs'],
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs
        }}>
          <span>💬</span> Vendor Feedback
        </h3>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
          Suggest a market, report issues, request features, or get help
        </p>
      </button>

      {showFeedbackForm && (
        <VendorFeedbackForm
          vertical={vertical}
          onClose={() => setShowFeedbackForm(false)}
        />
      )}
    </>
  )
}
