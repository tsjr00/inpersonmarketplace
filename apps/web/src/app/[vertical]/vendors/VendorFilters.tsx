'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useCallback } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import VendorFiltersPopup from './VendorFiltersPopup'

interface VendorFiltersProps {
  currentMarket?: string
  currentCategory?: string
  currentSearch?: string
  currentSort?: string
  currentPayment?: string
  markets: { id: string; name: string }[]
  categories: string[]
}

export default function VendorFilters({
  currentMarket,
  currentCategory,
  currentSearch,
  currentSort = 'rating',
  currentPayment,
  markets,
  categories
}: VendorFiltersProps) {
  const locale = getClientLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(currentSearch || '')

  const updateFilters = useCallback((updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString())

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    })

    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilters({ search: searchInput || undefined })
  }

  const clearSearch = () => {
    setSearchInput('')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('search')
    params.delete('category')
    router.push(`${pathname}?${params.toString()}`)
  }

  const hasSearchFilters = currentSearch || currentCategory

  return (
    <div style={{
      marginBottom: spacing.md,
      padding: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
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
          placeholder={t('vendors.search_placeholder', locale)}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{
            flex: 1,
            padding: `${spacing['2xs']} ${spacing.xs}`,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            backgroundColor: colors.surfaceBase,
            minWidth: 100,
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
            cursor: 'pointer'
          }}
        >
          {t('vendors.search', locale)}
        </button>
      </form>

      {/* Category */}
      {categories.length > 0 && (
        <select
          value={currentCategory || ''}
          onChange={(e) => updateFilters({ category: e.target.value || undefined })}
          aria-label={t('vendors.category_label', locale)}
          style={{
            padding: `${spacing['2xs']} ${spacing.xs}`,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            backgroundColor: colors.surfaceBase,
            flex: '0 1 auto',
            minWidth: 0,
          }}
        >
          <option value="">{t('vendors.all_categories', locale)}</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      )}

      {/* Filters Popup — location, payment, sort */}
      <VendorFiltersPopup
        currentMarket={currentMarket}
        currentSort={currentSort}
        currentPayment={currentPayment}
        markets={markets}
      />

      {/* Clear search/category */}
      {hasSearchFilters && (
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
          }}
        >
          {t('vendors.clear_filters', locale)}
        </button>
      )}
    </div>
  )
}
