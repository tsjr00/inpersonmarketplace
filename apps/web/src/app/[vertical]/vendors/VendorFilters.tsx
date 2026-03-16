'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useCallback } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

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

  const clearFilters = () => {
    setSearchInput('')
    router.push(pathname)
  }

  const hasFilters = currentMarket || currentCategory || currentSearch || currentSort !== 'rating' || currentPayment

  const selectStyle = {
    padding: `${spacing['2xs']} ${spacing.xs}`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    fontSize: typography.sizes.sm,
    backgroundColor: colors.surfaceBase,
  }

  const labelStyle = {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium as number,
    color: colors.textSecondary,
  }

  return (
    <div style={{
      marginBottom: spacing.md,
      padding: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      border: `1px solid ${colors.border}`,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: spacing.xs,
    }}>
      {/* Row 1: Search + Market + Category */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: spacing.xs,
        alignItems: 'center'
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
              backgroundColor: 'transparent',
              color: colors.primary,
              border: `1px solid ${colors.primary}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer'
            }}
          >
            {t('vendors.search', locale)}
          </button>
        </form>

        {/* Market Filter */}
        {markets.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={labelStyle}>{t('vendors.market_label', locale)}</label>
            <select
              value={currentMarket || ''}
              onChange={(e) => updateFilters({ market: e.target.value || undefined })}
              style={{ ...selectStyle, minWidth: 130 }}
            >
              <option value="">{t('vendors.all_markets', locale)}</option>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={labelStyle}>{t('vendors.category_label', locale)}</label>
            <select
              value={currentCategory || ''}
              onChange={(e) => updateFilters({ category: e.target.value || undefined })}
              style={{ ...selectStyle, minWidth: 130 }}
            >
              <option value="">{t('vendors.all_categories', locale)}</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Row 2: Payment + Sort + Clear */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: spacing.xs,
        alignItems: 'center'
      }}>
        {/* Payment Method Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={labelStyle}>{t('vendors.payment_label', locale)}</label>
          <select
            value={currentPayment || ''}
            onChange={(e) => updateFilters({ payment: e.target.value || undefined })}
            style={{ ...selectStyle, minWidth: 120 }}
          >
            <option value="">{t('vendors.all_payments', locale)}</option>
            <option value="cards">{t('vendors.cards', locale)}</option>
            <option value="venmo">Venmo</option>
            <option value="cashapp">Cash App</option>
            <option value="paypal">PayPal</option>
            <option value="cash">Cash</option>
          </select>
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={labelStyle}>{t('vendors.sort_label', locale)}</label>
          <select
            value={currentSort}
            onChange={(e) => updateFilters({ sort: e.target.value })}
            style={selectStyle}
          >
            <option value="rating">{t('vendors.sort_rating', locale)}</option>
            <option value="name">{t('vendors.sort_name', locale)}</option>
            <option value="listings">{t('vendors.sort_listings', locale)}</option>
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
            {t('vendors.clear_filters', locale)}
          </button>
        )}
      </div>
    </div>
  )
}
