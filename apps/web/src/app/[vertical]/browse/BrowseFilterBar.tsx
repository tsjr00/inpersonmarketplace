'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { VerticalBranding } from '@/lib/branding'
import { term } from '@/lib/vertical'
import { colors, spacing, typography, radius, sizing } from '@/lib/design-tokens'

interface BrowseFilterBarProps {
  vertical: string
  currentView: 'listings' | 'market-boxes'
  isAvailableNow: boolean
  currentMenu?: string
  branding: VerticalBranding
}

export default function BrowseFilterBar({
  vertical,
  currentView,
  isAvailableNow,
  currentMenu,
  branding
}: BrowseFilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const navigate = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('page') // reset pagination on any filter change
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }
    const qs = params.toString()
    router.push(`/${vertical}/browse${qs ? '?' + qs : ''}`)
  }

  const isFoodTruck = vertical === 'food_trucks'

  const selectStyle = {
    ...sizing.control,
    border: `1px solid ${branding.colors.secondary}`,
    backgroundColor: 'white',
    minWidth: 150,
    cursor: 'pointer' as const,
  }

  const labelStyle = {
    fontWeight: typography.weights.semibold as number,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    whiteSpace: 'nowrap' as const,
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
      border: `1px solid ${branding.colors.secondary}`,
      alignItems: 'center',
    }}>
      {/* View Type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
        <label style={labelStyle}>View:</label>
        <select
          value={currentView}
          onChange={(e) => navigate({
            view: e.target.value === 'market-boxes' ? 'market-boxes' : null
          })}
          style={selectStyle}
        >
          <option value="listings">{term(vertical, 'products')} & Bundles</option>
          <option value="market-boxes">{term(vertical, 'market_boxes')}</option>
        </select>
      </div>

      {/* Availability */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
        <label style={labelStyle}>Show:</label>
        <select
          value={isAvailableNow ? 'available' : 'all'}
          onChange={(e) => navigate({
            available: e.target.value === 'available' ? 'true' : null
          })}
          style={selectStyle}
        >
          <option value="all">All Listings</option>
          <option value="available">Available Now</option>
        </select>
      </div>

      {/* Menu Type — FT only */}
      {isFoodTruck && currentView === 'listings' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
          <label style={labelStyle}>Menu:</label>
          <select
            value={currentMenu || 'all'}
            onChange={(e) => navigate({
              menu: e.target.value === 'all' ? null : e.target.value
            })}
            style={selectStyle}
          >
            <option value="all">All Items</option>
            <option value="daily">Daily Menu</option>
            <option value="catering">Catering Menu</option>
          </select>
        </div>
      )}
    </div>
  )
}
