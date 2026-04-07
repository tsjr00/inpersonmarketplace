'use client'

import { useState } from 'react'
import { colors } from '@/lib/design-tokens'

export default function HighlightEventItems() {
  const [active, setActive] = useState(false)

  function toggle() {
    const next = !active
    setActive(next)

    const cards = document.querySelectorAll('[data-catering="true"]')
    cards.forEach(card => {
      const el = card as HTMLElement
      if (next) {
        el.style.setProperty('border', '2.5px solid #f59e0b', 'important')
        el.style.setProperty('box-shadow', '0 0 0 1px #f59e0b', 'important')
      } else {
        el.style.removeProperty('border')
        el.style.removeProperty('box-shadow')
      }
    })

    if (next && cards.length > 0) {
      cards[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      style={{
        padding: '8px 16px',
        backgroundColor: active ? '#f59e0b' : 'transparent',
        color: active ? 'white' : '#b45309',
        border: '1.5px solid #f59e0b',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {active ? 'Clear Highlight' : 'Show Event-Eligible Items'}
    </button>
  )
}
