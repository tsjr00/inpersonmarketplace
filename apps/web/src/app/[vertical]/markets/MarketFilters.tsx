'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useCallback } from 'react'

interface MarketFiltersProps {
  currentType?: string
  currentCity?: string
  currentSearch?: string
  cities: string[]
}

export default function MarketFilters({
  currentType,
  currentCity,
  currentSearch,
  cities,
}: MarketFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState(currentSearch || '')

  const updateFilter = useCallback((key: string, value: string | undefined) => {
    const params = new URLSearchParams()

    if (key === 'type' && value) params.set('type', value)
    else if (currentType) params.set('type', currentType)

    if (key === 'city' && value) params.set('city', value)
    else if (currentCity && key !== 'city') params.set('city', currentCity)

    if (key === 'search' && value) params.set('search', value)
    else if (currentSearch && key !== 'search') params.set('search', currentSearch)

    // Remove the key if value is empty
    if (!value) params.delete(key)

    const queryString = params.toString()
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`)
  }, [router, pathname, currentType, currentCity, currentSearch])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilter('search', search.trim() || undefined)
  }

  const clearFilters = () => {
    setSearch('')
    router.push(pathname)
  }

  const hasFilters = currentType || currentCity || currentSearch

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 12,
      padding: 20,
      marginBottom: 24,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        alignItems: 'flex-end',
      }}>
        {/* Search */}
        <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 200px', minWidth: 200 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#333' }}>
            Search
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search markets..."
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid #ddd',
                borderRadius: 8,
                fontSize: 14,
              }}
            />
            <button
              type="submit"
              style={{
                padding: '10px 16px',
                backgroundColor: '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Search
            </button>
          </div>
        </form>

        {/* Type filter */}
        <div style={{ flex: '0 0 180px' }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#333' }}>
            Market Type
          </label>
          <select
            value={currentType || ''}
            onChange={(e) => updateFilter('type', e.target.value || undefined)}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: '1px solid #ddd',
              borderRadius: 8,
              fontSize: 14,
              backgroundColor: 'white',
            }}
          >
            <option value="">All Types</option>
            <option value="traditional">Farmers Market</option>
            <option value="private_pickup">Private Pickup</option>
          </select>
        </div>

        {/* City filter */}
        {cities.length > 0 && (
          <div style={{ flex: '0 0 180px' }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#333' }}>
              City
            </label>
            <select
              value={currentCity || ''}
              onChange={(e) => updateFilter('city', e.target.value || undefined)}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #ddd',
                borderRadius: 8,
                fontSize: 14,
                backgroundColor: 'white',
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
              padding: '10px 16px',
              backgroundColor: '#f0f0f0',
              color: '#666',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  )
}
