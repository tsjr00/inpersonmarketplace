'use client'

import { useState } from 'react'
import TutorialModal from './TutorialModal'

interface TutorialWrapperProps {
  vertical: string
  mode?: 'buyer' | 'vendor'
  /** Vendor tutorial phase: 1 = Getting Approved, 2 = Your Dashboard */
  phase?: 1 | 2
  showTutorial: boolean
}

export default function TutorialWrapper({ vertical, mode = 'buyer', phase = 1, showTutorial }: TutorialWrapperProps) {
  const [isOpen, setIsOpen] = useState(showTutorial)

  const apiEndpoint = mode === 'vendor' ? '/api/vendor/tutorial' : '/api/user/tutorial'

  const handleComplete = async () => {
    try {
      await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', phase })
      })
    } catch (err) {
      console.error('Failed to mark tutorial as complete:', err)
    }
    setIsOpen(false)
  }

  const handleSkip = async () => {
    try {
      await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip', phase })
      })
    } catch (err) {
      console.error('Failed to mark tutorial as skipped:', err)
    }
    setIsOpen(false)
  }

  if (!isOpen) {
    return null
  }

  return (
    <TutorialModal
      vertical={vertical}
      mode={mode}
      phase={phase}
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  )
}
