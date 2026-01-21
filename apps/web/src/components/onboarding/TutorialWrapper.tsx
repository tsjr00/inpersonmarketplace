'use client'

import { useState } from 'react'
import TutorialModal from './TutorialModal'

interface TutorialWrapperProps {
  vertical: string
  mode?: 'buyer' | 'vendor'
  showTutorial: boolean
}

export default function TutorialWrapper({ vertical, mode = 'buyer', showTutorial }: TutorialWrapperProps) {
  const [isOpen, setIsOpen] = useState(showTutorial)

  const apiEndpoint = mode === 'vendor' ? '/api/vendor/tutorial' : '/api/user/tutorial'

  const handleComplete = async () => {
    try {
      await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' })
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
        body: JSON.stringify({ action: 'skip' })
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
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  )
}
