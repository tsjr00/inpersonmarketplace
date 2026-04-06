'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export default function ScrollToSection() {
  const searchParams = useSearchParams()
  const section = searchParams.get('section')

  useEffect(() => {
    if (section) {
      const el = document.getElementById(`${section}-section`)
      if (el) {
        // Small delay to ensure layout is settled
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      }
    }
  }, [section])

  return null
}
