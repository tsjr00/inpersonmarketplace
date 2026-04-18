'use client'

import { useState } from 'react'
import { getClientLocale, setClientLocale } from '@/lib/locale/client'
import { SUPPORTED_LOCALES, getLocaleLabel } from '@/lib/locale'
import type { Locale } from '@/lib/locale'

interface LanguageSelectorProps {
  /** Current locale (pass from server to avoid hydration mismatch) */
  locale?: Locale
  /** Visual style variant */
  variant?: 'compact' | 'full'
}

/**
 * Language toggle — lets users switch between English and Spanish.
 * Sets an httpOnly cookie via API and reloads the page.
 */
export default function LanguageSelector({ locale: serverLocale, variant = 'compact' }: LanguageSelectorProps) {
  const [switching, setSwitching] = useState(false)
  const currentLocale = serverLocale ?? getClientLocale()

  async function handleChange(newLocale: Locale) {
    if (newLocale === currentLocale || switching) return
    setSwitching(true)
    try {
      await setClientLocale(newLocale)
    } catch {
      setSwitching(false)
    }
  }

  if (variant === 'full') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, color: '#666' }}>
          {currentLocale === 'es' ? 'Idioma:' : 'Language:'}
        </span>
        {SUPPORTED_LOCALES.map((loc) => (
          <button
            key={loc}
            onClick={() => handleChange(loc)}
            disabled={switching}
            style={{
              padding: '6px 14px',
              fontSize: 14,
              fontWeight: loc === currentLocale ? 600 : 400,
              border: loc === currentLocale ? '2px solid currentColor' : '1px solid #ccc',
              borderRadius: 6,
              background: loc === currentLocale ? 'rgba(0,0,0,0.05)' : 'transparent',
              cursor: switching ? 'wait' : 'pointer',
              opacity: switching ? 0.5 : 1,
            }}
          >
            {getLocaleLabel(loc)}
          </button>
        ))}
      </div>
    )
  }

  // Compact: shows just the other language as a clickable toggle
  const otherLocale = currentLocale === 'en' ? 'es' : 'en'
  return (
    <button
      onClick={() => handleChange(otherLocale as Locale)}
      disabled={switching}
      aria-label={`Switch to ${getLocaleLabel(otherLocale as Locale)}`}
      title={`Switch to ${getLocaleLabel(otherLocale as Locale)}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        fontSize: 13,
        fontWeight: 500,
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.1)',
        color: 'inherit',
        cursor: switching ? 'wait' : 'pointer',
        opacity: switching ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      🌐 {currentLocale === 'en' ? 'ES' : 'EN'}
    </button>
  )
}
