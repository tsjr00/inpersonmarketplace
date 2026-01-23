'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useCallback } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface VendorFiltersProps {
  currentMarket?: string
  currentCategory?: string
  currentSearch?: string
  currentSort?: string
  markets: { id: string; name: string }[]
  categories: string[]
}

export default function VendorFilters({
  currentMarket,
  currentCategory,
  currentSearch,
  currentSort = 'rating',
  markets,
  categories
}: VendorFiltersProps) {
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

  const clearFilters = () => {
    setSearchInput('')
    router.push(pathname)
  }

  const hasFilters = currentMarket || currentCategory || currentSearch || currentSort !== 'rating'

  return (
    <div style={{
      marginBottom: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      border: `1px solid ${colors.border}`
    }}>
      {/* Search */}
      <form onSubmit={handleSearchSubmit} style={{ marginBottom: spacing.sm }}>
        <div style={{ display: 'flex', gap: spacing.xs }}>
          <input
            type="text"
            placeholder="Search vendors by name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              flex: 1,
              padding: `${spacing.xs} ${spacing.sm}`,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              fontSize: typography.sizes.base,
              backgroundColor: colors.surfaceBase
            }}
          />
          <button
            type="submit"
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: colors.primary,
              color: colors.textInverse,
              border: 'none',
              borderRadius: radius.md,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer'
            }}
          >
            Search
          </button>
        </div>
      </form>

      {/* Filters Row */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: spacing.sm,
        alignItems: 'center'
      }}>
        {/* Market Filter */}
        {markets.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
            <label style={{
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              color: colors.textSecondary
            }}>
              Market:
            </label>
            <select
              value={currentMarket || ''}
              onChange={(e) => updateFilters({ market: e.target.value || undefined })}
              style={{
                padding: `${spacing['2xs']} ${spacing.xs}`,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                backgroundColor: colors.surfaceBase,
                minWidth: 150
              }}
            >
              <option value="">All Markets</option>
              {markets.map(market => (
                <option key={market.id} value={market.id}>
                  {market.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Category Filter */}
        {categories.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
            <label style={{
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              color: colors.textSecondary
            }}>
              Category:
            </label>
            <select
              value={currentCategory || ''}
              onChange={(e) => updateFilters({ category: e.target.value || undefined })}
              style={{
                padding: `${spacing['2xs']} ${spacing.xs}`,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                backgroundColor: colors.surfaceBase,
                minWidth: 150
              }}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
          <label style={{
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.medium,
            color: colors.textSecondary
          }}>
            Sort:
          </label>
          <select
            value={currentSort}
            onChange={(e) => updateFilters({ sort: e.target.value })}
            style={{
              padding: `${spacing['2xs']} ${spacing.xs}`,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              backgroundColor: colors.surfaceBase
            }}
          >
            <option value="rating">Top Rated</option>
            <option value="name">Name A-Z</option>
            <option value="listings">Most Listings</option>
          </select>
        </div>

        {/* Clear Filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              padding: `${spacing['2xs']} ${spacing.xs}`,
              backgroundColor: 'transparent',
              color: colors.textMuted,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  )
}
