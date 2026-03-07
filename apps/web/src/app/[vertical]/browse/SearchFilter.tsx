'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { VerticalBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, sizing } from '@/lib/design-tokens'

interface SearchFilterProps {
  vertical: string
  categories: string[]
  currentCategory?: string
  currentSearch?: string
  currentZip?: string
  currentAvailable?: string
  branding: VerticalBranding
}

export default function SearchFilter({
  vertical,
  categories,
  currentCategory,
  currentSearch,
  currentZip,
  currentAvailable,
  branding
}: SearchFilterProps) {
  const router = useRouter()
  const [search, setSearch] = useState(currentSearch || '')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (currentCategory) params.set('category', currentCategory)
    if (currentZip) params.set('zip', currentZip)
    if (currentAvailable) params.set('available', currentAvailable)
    router.push(`/${vertical}/browse${params.toString() ? '?' + params.toString() : ''}`)
  }

  const handleCategoryChange = (category: string) => {
    const params = new URLSearchParams()
    if (currentSearch) params.set('search', currentSearch)
    if (category) params.set('category', category)
    if (currentZip) params.set('zip', currentZip)
    if (currentAvailable) params.set('available', currentAvailable)
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
            placeholder="Search listings..."
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
              backgroundColor: branding.colors.primary,
              color: 'white',
              border: 'none',
              fontWeight: typography.weights.semibold,
              cursor: 'pointer'
            }}
          >
            Search
          </button>
        </div>
      </form>

      {/* Category Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
        <label style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>Category:</label>
        <select
          value={currentCategory || ''}
          onChange={(e) => handleCategoryChange(e.target.value)}
          style={{
            ...sizing.control,
            border: `1px solid ${branding.colors.secondary}`,
            backgroundColor: 'white',
            minWidth: 130
          }}
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

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
          Clear
        </button>
      )}
    </div>
  )
}
