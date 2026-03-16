'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import ShopperFeedbackForm from './ShopperFeedbackForm'

interface FeedbackCardProps {
  vertical: string
}

export default function FeedbackCard({ vertical }: FeedbackCardProps) {
  const locale = getClientLocale()
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
          <span>💬</span> {t('feedback.share', locale)}
        </h3>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
          {t('feedback.suggest_desc', locale, { market: term(vertical, 'market', locale).toLowerCase() })}
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
