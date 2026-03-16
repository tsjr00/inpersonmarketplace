'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useCallback } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

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

  const updateFilter = useCallback((key: string, value: string | undefined) => {
    const params = new URLSearchParams()

    // State filter
    if (key === 'state' && value) params.set('state', value)
    else if (currentState && key !== 'state') params.set('state', currentState)

    // Clear city when state changes (cascading filter)
    if (key === 'state') {
      // Don't carry over city — it may not exist in the new state
    } else {
      if (key === 'city' && value) params.set('city', value)
      else if (currentCity && key !== 'city') params.set('city', currentCity)
    }

    if (key === 'search' && value) params.set('search', value)
    else if (currentSearch && key !== 'search') params.set('search', currentSearch)

    // Type filter
    if (key === 'type' && value) params.set('type', value)
    else if (currentType && key !== 'type') params.set('type', currentType)

    // Remove the key if value is empty
    if (!value) params.delete(key)

    const queryString = params.toString()
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`)
  }, [router, pathname, currentCity, currentSearch, currentState, currentType])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilter('search', search.trim() || undefined)
  }

  const clearFilters = () => {
    setSearch('')
    router.push(pathname)
  }

  const hasFilters = currentCity || currentSearch || currentState || currentType

  return (
    <div style={{
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      padding: spacing.sm,
      marginBottom: spacing.md,
      boxShadow: shadows.sm,
      border: `1px solid ${colors.border}`
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: spacing.xs,
        alignItems: 'flex-end',
      }}>
        {/* Search */}
        <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 240px' }}>
          <label style={{
            display: 'block',
            marginBottom: spacing['3xs'],
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.medium,
            color: colors.textSecondary
          }}>
            {t('markets.search_label', locale, { markets: vertical ? term(vertical, 'traditional_markets', locale) : t('markets.fm_markets', locale) })}
          </label>
          <div style={{ display: 'flex', gap: spacing['2xs'] }}>
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
                fontSize: typography.sizes.base,
                minHeight: 38,
                backgroundColor: colors.surfaceBase
              }}
            />
            <button
              type="submit"
              style={{
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: 'transparent',
                color: colors.primary,
                border: `2px solid ${colors.primary}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                cursor: 'pointer',
                minHeight: 38,
                whiteSpace: 'nowrap'
              }}
            >
              {t('markets.search', locale)}
            </button>
          </div>
        </form>

        {/* State filter */}
        {states.length > 0 && (
          <div style={{ flex: '1 1 90px', maxWidth: 160 }}>
            <label style={{
              display: 'block',
              marginBottom: spacing['3xs'],
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              color: colors.textSecondary
            }}>
              {t('markets.state_label', locale)}
            </label>
            <select
              value={currentState || ''}
              onChange={(e) => updateFilter('state', e.target.value || undefined)}
              style={{
                width: '100%',
                padding: `${spacing['2xs']} ${spacing.xs}`,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                backgroundColor: colors.surfaceBase,
                minHeight: 38,
                cursor: 'pointer'
              }}
            >
              <option value="">{t('markets.all_states', locale)}</option>
              {states.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
        )}

        {/* City filter */}
        {cities.length > 0 && (
          <div style={{ flex: '1 1 120px', maxWidth: 200 }}>
            <label style={{
              display: 'block',
              marginBottom: spacing['3xs'],
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              color: colors.textSecondary
            }}>
              {t('markets.city_label', locale)}
            </label>
            <select
              value={currentCity || ''}
              onChange={(e) => updateFilter('city', e.target.value || undefined)}
              style={{
                width: '100%',
                padding: `${spacing['2xs']} ${spacing.xs}`,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                backgroundColor: colors.surfaceBase,
                minHeight: 38,
                cursor: 'pointer'
              }}
            >
              <option value="">{t('markets.all_cities', locale)}</option>
              {cities.sort().map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
        )}

        {/* Location Type filter */}
        <div style={{ flex: '1 1 120px', maxWidth: 180 }}>
          <label style={{
            display: 'block',
            marginBottom: spacing['3xs'],
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.medium,
            color: colors.textSecondary
          }}>
            {t('markets.type_label', locale)}
          </label>
          <select
            value={currentType || ''}
            onChange={(e) => updateFilter('type', e.target.value || undefined)}
            style={{
              width: '100%',
              padding: `${spacing['2xs']} ${spacing.xs}`,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              backgroundColor: colors.surfaceBase,
              minHeight: 38,
              cursor: 'pointer'
            }}
          >
            <option value="">{t('markets.all_types', locale)}</option>
            <option value="traditional">
              {vertical === 'food_trucks' ? t('markets.ft_parks', locale) : t('markets.fm_markets', locale)}
            </option>
            <option value="event">{t('markets.events', locale)}</option>
          </select>
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <div style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
            <button
              onClick={clearFilters}
              style={{
                padding: `${spacing['2xs']} ${spacing.xs}`,
                backgroundColor: colors.surfaceMuted,
                color: colors.textSecondary,
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                minHeight: 38
              }}
            >
              {t('markets.clear', locale)}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
