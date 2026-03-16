'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface AvailabilityToggleProps {
  vertical: string
  isAvailableNow: boolean
  primaryColor: string
}

export default function AvailabilityToggle({
  vertical,
  isAvailableNow,
  primaryColor
}: AvailabilityToggleProps) {
  const locale = getClientLocale()
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleToggle = (available: boolean) => {
    const params = new URLSearchParams(searchParams.toString())
    if (available) {
      params.set('available', 'true')
    } else {
      params.delete('available')
    }
    // Reset to page 1 on toggle
    params.delete('page')
    router.push(`/${vertical}/browse?${params.toString()}`)
  }

  const activeStyle = {
    padding: '8px 32px',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer' as const,
    backgroundColor: primaryColor,
    color: 'white',
    minWidth: 160,
    transition: 'all 0.2s',
  }

  const inactiveStyle = {
    ...activeStyle,
    backgroundColor: 'transparent',
    color: '#6b7280',
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      marginBottom: 16,
    }}>
      <div style={{
        display: 'flex',
        gap: 0,
        backgroundColor: '#f3f4f6',
        borderRadius: 8,
        padding: 4,
        border: `1px solid ${primaryColor}`,
      }}>
        <button
          onClick={() => handleToggle(false)}
          style={!isAvailableNow ? activeStyle : inactiveStyle}
        >
          {t('browse.all_listings', locale)}
        </button>
        <button
          onClick={() => handleToggle(true)}
          style={isAvailableNow ? activeStyle : inactiveStyle}
        >
          {t('browse.available_now', locale)}
        </button>
      </div>
    </div>
  )
}
