'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { VerticalBranding } from '@/lib/branding'
import { term } from '@/lib/vertical'

interface BrowseToggleProps {
  vertical: string
  currentView: 'listings' | 'market-boxes'
  branding: VerticalBranding
}

export default function BrowseToggle({
  vertical,
  currentView,
  branding
}: BrowseToggleProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleToggle = (view: 'listings' | 'market-boxes') => {
    const params = new URLSearchParams()

    // Preserve zip parameter
    const zip = searchParams.get('zip')
    if (zip) params.set('zip', zip)

    // Set view parameter for market-boxes
    if (view === 'market-boxes') {
      params.set('view', 'market-boxes')
    }

    const queryString = params.toString()
    router.push(`/${vertical}/browse${queryString ? '?' + queryString : ''}`)
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      marginBottom: 24
    }}>
      <div style={{
        display: 'flex',
        gap: 0,
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        padding: 6,
        border: `2px solid ${branding.colors.primary}`
      }}>
        <button
          onClick={() => handleToggle('listings')}
          style={{
            padding: '14px 32px',
            backgroundColor: currentView === 'listings' ? branding.colors.primary : 'transparent',
            color: currentView === 'listings' ? 'white' : '#6b7280',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 16,
            transition: 'all 0.2s',
            minWidth: 160
          }}
        >
          {term(vertical, 'products')} & Bundles
        </button>
        <button
          onClick={() => handleToggle('market-boxes')}
          style={{
            padding: '14px 32px',
            backgroundColor: currentView === 'market-boxes' ? branding.colors.primary : 'transparent',
            color: currentView === 'market-boxes' ? 'white' : '#6b7280',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 16,
            transition: 'all 0.2s',
            minWidth: 160
          }}
        >
          {term(vertical, 'market_boxes')}
        </button>
      </div>
    </div>
  )
}
