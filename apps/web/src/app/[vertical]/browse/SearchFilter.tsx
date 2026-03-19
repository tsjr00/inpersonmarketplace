'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { VerticalBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, sizing } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface SearchFilterProps {
  vertical: string
  categories: string[]
  currentCategory?: string
  currentSearch?: string
  currentZip?: string
  currentAvailable?: string
  currentMenu?: string
  branding: VerticalBranding
  children?: React.ReactNode
}

export default function SearchFilter({
  vertical,
  categories,
  currentCategory,
  currentSearch,
  currentZip,
  currentAvailable,
  currentMenu,
  branding,
  children,
}: SearchFilterProps) {
  const locale = getClientLocale()
  const router = useRouter()
  const [search, setSearch] = useState(currentSearch || '')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (currentCategory) params.set('category', currentCategory)
    if (currentZip) params.set('zip', currentZip)
    if (currentAvailable) params.set('available', currentAvailable)
    if (currentMenu) params.set('menu', currentMenu)
    router.push(`/${vertical}/browse${params.toString() ? '?' + params.toString() : ''}`)
  }

  const handleCategoryChange = (category: string) => {
    const params = new URLSearchParams()
    if (currentSearch) params.set('search', currentSearch)
    if (category) params.set('category', category)
    if (currentZip) params.set('zip', currentZip)
    if (currentAvailable) params.set('available', currentAvailable)
    if (currentMenu) params.set('menu', currentMenu)
    router.push(`/${vertical}/browse${params.toString() ? '?' + params.toString() : ''}`)
  }

  const clearFilters = () => {
    setSearch('')
    router.push(`/${vertical}/browse`)
  }

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.md,
      padding: spacing.sm,
      backgroundColor: 'white',
      borderRadius: radius.md,
      border: `1px solid ${branding.colors.secondary}`
    }}>
      {/* Search Input */}
      <form onSubmit={handleSearch} style={{ flex: '1 1 280px' }}>
        <div style={{ display: 'flex', gap: spacing['2xs'] }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('browse.search_placeholder', locale)}
            style={{
              flex: 1,
              ...sizing.control,
              border: `1px solid ${branding.colors.secondary}`,
              boxSizing: 'border-box' as const
            }}
          />
          <button
            type="submit"
            style={{
              ...sizing.control,
              padding: `${spacing['2xs']} ${spacing.sm}`,
              backgroundColor: colors.textMuted,
              color: 'white',
              border: 'none',
              fontWeight: typography.weights.semibold,
              cursor: 'pointer'
            }}
          >
            {t('browse.search', locale)}
          </button>
        </div>
      </form>

      {/* Category Filter */}
      <select
        value={currentCategory || ''}
        onChange={(e) => handleCategoryChange(e.target.value)}
        aria-label={t('browse.category_label', locale)}
        style={{
          ...sizing.control,
          border: `1px solid ${branding.colors.secondary}`,
          backgroundColor: 'white',
          minWidth: 0,
          flex: '0 1 auto',
        }}
      >
        <option value="">{t('browse.all_categories', locale)}</option>
        {categories.map(cat => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>

      {/* Clear Filters */}
      {(currentSearch || currentCategory) && (
        <button
          onClick={clearFilters}
          style={{
            ...sizing.control,
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: colors.surfaceMuted,
            color: colors.textSecondary,
            border: 'none',
            fontWeight: typography.weights.semibold,
            cursor: 'pointer'
          }}
        >
          {t('browse.clear', locale)}
        </button>
      )}

      {/* Additional filters (popup) */}
      {children}
    </div>
  )
}
