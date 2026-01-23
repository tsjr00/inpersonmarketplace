'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { VerticalBranding } from '@/lib/branding'

interface SearchFilterProps {
  vertical: string
  categories: string[]
  currentCategory?: string
  currentSearch?: string
  currentZip?: string
  branding: VerticalBranding
}

export default function SearchFilter({
  vertical,
  categories,
  currentCategory,
  currentSearch,
  currentZip,
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
    router.push(`/${vertical}/browse${params.toString() ? '?' + params.toString() : ''}`)
  }

  const handleCategoryChange = (category: string) => {
    const params = new URLSearchParams()
    if (currentSearch) params.set('search', currentSearch)
    if (category) params.set('category', category)
    if (currentZip) params.set('zip', currentZip)
    router.push(`/${vertical}/browse${params.toString() ? '?' + params.toString() : ''}`)
  }

  const clearFilters = () => {
    setSearch('')
    // Preserve zip when clearing other filters
    const params = new URLSearchParams()
    if (currentZip) params.set('zip', currentZip)
    router.push(`/${vertical}/browse${params.toString() ? '?' + params.toString() : ''}`)
  }

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 15,
      marginBottom: 30,
      padding: 20,
      backgroundColor: 'white',
      borderRadius: 8,
      border: `1px solid ${branding.colors.secondary}`
    }}>
      {/* Search Input */}
      <form onSubmit={handleSearch} style={{ flex: '1 1 300px' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search listings..."
            style={{
              flex: 1,
              padding: '10px 15px',
              fontSize: 16,
              border: `1px solid ${branding.colors.secondary}`,
              borderRadius: 6,
              boxSizing: 'border-box'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '10px 20px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Search
          </button>
        </div>
      </form>

      {/* Category Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ fontWeight: 600, color: '#333' }}>Category:</label>
        <select
          value={currentCategory || ''}
          onChange={(e) => handleCategoryChange(e.target.value)}
          style={{
            padding: '10px 15px',
            fontSize: 16,
            border: `1px solid ${branding.colors.secondary}`,
            borderRadius: 6,
            backgroundColor: 'white',
            minWidth: 150
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
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Clear Filters
        </button>
      )}
    </div>
  )
}
