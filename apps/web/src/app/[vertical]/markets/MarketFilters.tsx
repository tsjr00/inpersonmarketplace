'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import MarketFiltersPopup from './MarketFiltersPopup'

interface MarketFiltersProps {
  vertical?: string
  currentCity?: string
  currentSearch?: string
  currentState?: string
  currentType?: string
  cities: string[]
  states: string[]
}

export default function MarketFilters({
  vertical,
  currentCity,
  currentSearch,
  currentState,
  currentType,
  cities,
  states,
}: MarketFiltersProps) {
  const locale = getClientLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState(currentSearch || '')

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (currentState) params.set('state', currentState)
    if (currentCity) params.set('city', currentCity)
    if (currentType) params.set('type', currentType)
    const qs = params.toString()
    router.push(`${pathname}${qs ? '?' + qs : ''}`)
  }

  const clearSearch = () => {
    setSearch('')
    const params = new URLSearchParams()
    if (currentState) params.set('state', currentState)
    if (currentCity) params.set('city', currentCity)
    if (currentType) params.set('type', currentType)
    const qs = params.toString()
    router.push(`${pathname}${qs ? '?' + qs : ''}`)
  }

  return (
    <div style={{
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      padding: spacing.sm,
      marginBottom: spacing.md,
      border: `1px solid ${colors.border}`,
      display: 'flex',
      flexWrap: 'wrap',
      gap: spacing.xs,
      alignItems: 'center',
    }}>
      {/* Search */}
      <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: spacing['2xs'], flex: '1 1 180px' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('markets.search_placeholder', locale)}
          style={{
            flex: 1,
            padding: `${spacing['2xs']} ${spacing.xs}`,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            backgroundColor: colors.surfaceBase,
            minWidth: 100,
            minHeight: 38,
          }}
        />
        <button
          type="submit"
          style={{
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: colors.textMuted,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: 'pointer',
            minHeight: 38,
          }}
        >
          {t('markets.search', locale)}
        </button>
      </form>

      {/* Filters Popup — state, city, type */}
      <MarketFiltersPopup
        vertical={vertical}
        currentState={currentState}
        currentCity={currentCity}
        currentType={currentType}
        currentSearch={currentSearch}
        states={states}
        cities={cities}
      />

      {/* Clear search */}
      {currentSearch && (
        <button
          onClick={clearSearch}
          style={{
            padding: `${spacing['2xs']} ${spacing.xs}`,
            backgroundColor: 'transparent',
            color: colors.textMuted,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            cursor: 'pointer',
            minHeight: 38,
          }}
        >
          {t('markets.clear', locale)}
        </button>
      )}
    </div>
  )
}
