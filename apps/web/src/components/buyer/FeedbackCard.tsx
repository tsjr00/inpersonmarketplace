'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import ShopperFeedbackForm from './ShopperFeedbackForm'

interface FeedbackCardProps {
  vertical: string
}

export default function FeedbackCard({ vertical }: FeedbackCardProps) {
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
          <span>💬</span> Share Feedback
        </h3>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
          {`Suggest a ${term(vertical, 'market').toLowerCase()}, report an issue, or tell us how to improve`}
        </p>
      </button>

      {showFeedbackForm && (
        <ShopperFeedbackForm
          vertical={vertical}
          onClose={() => setShowFeedbackForm(false)}
        />
      )}
    </>
  )
}
