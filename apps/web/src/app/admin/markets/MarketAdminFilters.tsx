'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

interface MarketAdminFiltersProps {
  currentVertical?: string
  currentType?: string
  currentActive?: string
  verticals: { vertical_id: string; name_public: string }[]
}

export default function MarketAdminFilters({
  currentVertical,
  currentType,
  currentActive,
  verticals,
}: MarketAdminFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()

  const updateFilter = useCallback((key: string, value: string | undefined) => {
    const params = new URLSearchParams()

    if (key === 'vertical' && value) params.set('vertical', value)
    else if (currentVertical && key !== 'vertical') params.set('vertical', currentVertical)

    if (key === 'type' && value) params.set('type', value)
    else if (currentType && key !== 'type') params.set('type', currentType)

    if (key === 'active' && value !== undefined) params.set('active', value)
    else if (currentActive !== undefined && key !== 'active') params.set('active', currentActive)

    if (!value && value !== '') params.delete(key)

    const queryString = params.toString()
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`)
  }, [router, pathname, currentVertical, currentType, currentActive])

  const clearFilters = () => {
    router.push(pathname)
  }

  const hasFilters = currentVertical || currentType || currentActive !== undefined

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 16,
      marginBottom: 24,
      padding: 16,
      backgroundColor: '#f8f9fa',
      borderRadius: 8,
    }}>
      {/* Vertical filter */}
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#666' }}>
          Vertical
        </label>
        <select
          value={currentVertical || ''}
          onChange={(e) => updateFilter('vertical', e.target.value || undefined)}
          style={{
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: 6,
            fontSize: 14,
            backgroundColor: 'white',
            minWidth: 150,
          }}
        >
          <option value="">All Verticals</option>
          {verticals.map(v => (
            <option key={v.vertical_id} value={v.vertical_id}>{v.name_public}</option>
          ))}
        </select>
      </div>

      {/* Type filter */}
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#666' }}>
          Type
        </label>
        <select
          value={currentType || ''}
          onChange={(e) => updateFilter('type', e.target.value || undefined)}
          style={{
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: 6,
            fontSize: 14,
            backgroundColor: 'white',
            minWidth: 150,
          }}
        >
          <option value="">All Types</option>
          <option value="traditional">Traditional</option>
          <option value="private_pickup">Private Pickup</option>
        </select>
      </div>

      {/* Status filter */}
      <div>
        <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#666' }}>
          Status
        </label>
        <select
          value={currentActive ?? ''}
          onChange={(e) => updateFilter('active', e.target.value || undefined)}
          style={{
            padding: '8px 12px',
            border: '1px solid #ddd',
            borderRadius: 6,
            fontSize: 14,
            backgroundColor: 'white',
            minWidth: 150,
          }}
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            onClick={clearFilters}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f0f0f0',
              color: '#666',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  )
}
