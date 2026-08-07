'use client'

import { useState } from 'react'
import VendorFeedbackForm from './VendorFeedbackForm'
import DashboardTile from '@/components/dashboard/DashboardTile'

interface VendorFeedbackCardProps {
  vertical: string
}

export default function VendorFeedbackCard({ vertical }: VendorFeedbackCardProps) {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)

  return (
    <>
      {/* A TILE whose destination is a modal — see FeedbackCard for the rule. */}
      <DashboardTile
        onClick={() => setShowFeedbackForm(true)}
        icon="feedback"
        title="My Vendor Feedback"
      >
        Suggest a market, report issues, request features, or get help
      </DashboardTile>

      {showFeedbackForm && (
        <VendorFeedbackForm
          vertical={vertical}
          onClose={() => setShowFeedbackForm(false)}
        />
      )}
    </>
  )
}
