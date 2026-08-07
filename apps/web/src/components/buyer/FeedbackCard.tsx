'use client'

import { useState } from 'react'
import { term } from '@/lib/vertical'
import DashboardTile from '@/components/dashboard/DashboardTile'
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
      {/* A TILE whose destination is a modal rather than a page — the whole
          surface is the click target, which is what makes it a tile and not a
          card. See the taxonomy in docs/Codebase_Map/22_Components_UI.md. */}
      <DashboardTile
        onClick={() => setShowFeedbackForm(true)}
        icon="feedback"
        title={t('feedback.share', locale)}
      >
        {t('feedback.suggest_desc', locale, { market: term(vertical, 'market', locale).toLowerCase() })}
      </DashboardTile>

      {showFeedbackForm && (
        <ShopperFeedbackForm
          vertical={vertical}
          onClose={() => setShowFeedbackForm(false)}
        />
      )}
    </>
  )
}
