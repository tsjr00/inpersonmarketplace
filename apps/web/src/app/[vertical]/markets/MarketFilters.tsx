'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useCallback } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface MarketFiltersProps {
  currentCity?: string
  currentSearch?: string
  cities: string[]
}

export default function MarketFilters({
  currentCity,
  currentSearch,
  cities,
}: MarketFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState(currentSearch || '')

  const updateFilter = useCallback((key: string, value: string | undefined) => {
    const params = new URLSearchParams()

    if (key === 'city' && value) params.set('city', value)
    else if (currentCity && key !== 'city') params.set('city', currentCity)

    if (key === 'search' && value) params.set('search', value)
    else if (currentSearch && key !== 'search') params.set('search', currentSearch)

    // Remove the key if value is empty
    if (!value) params.delete(key)

    const queryString = params.toString()
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`)
  }, [router, pathname, currentCity, currentSearch])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilter('search', search.trim() || undefined)
  }

  const clearFilters = () => {
    setSearch('')
    router.push(pathname)
  }

  const hasFilters = currentCity || currentSearch

  return (
    <div style={{
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      boxShadow: shadows.sm,
      border: `1px solid ${colors.border}`
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: spacing.sm,
        alignItems: 'flex-end',
      }}>
        {/* Search */}
        <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 250px', minWidth: 200 }}>
          <label style={{
            display: 'block',
            marginBottom: spacing['2xs'],
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.medium,
            color: colors.textSecondary
          }}>
            Search Markets
          </label>
          <div style={{ display: 'flex', gap: spacing.xs }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              style={{
                flex: 1,
                padding: `${spacing.xs} ${spacing.sm}`,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                fontSize: typography.sizes.base,
                minHeight: 44,
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
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                cursor: 'pointer',
                minHeight: 44,
                whiteSpace: 'nowrap'
              }}
            >
              Search
            </button>
          </div>
        </form>

        {/* City filter */}
        {cities.length > 0 && (
          <div style={{ flex: '0 0 180px' }}>
            <label style={{
              display: 'block',
              marginBottom: spacing['2xs'],
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              color: colors.textSecondary
            }}>
              City
            </label>
            <select
              value={currentCity || ''}
              onChange={(e) => updateFilter('city', e.target.value || undefined)}
              style={{
                width: '100%',
                padding: `${spacing.xs} ${spacing.sm}`,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                fontSize: typography.sizes.base,
                backgroundColor: colors.surfaceBase,
                minHeight: 44,
                cursor: 'pointer'
              }}
            >
              <option value="">All Cities</option>
              {cities.sort().map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
        )}

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: colors.surfaceMuted,
              color: colors.textSecondary,
              border: 'none',
              borderRadius: radius.md,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              minHeight: 44
            }}
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  )
}
