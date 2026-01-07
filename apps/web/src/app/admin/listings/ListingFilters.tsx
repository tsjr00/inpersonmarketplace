'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface ListingFiltersProps {
  currentStatus?: string
  currentVertical?: string
}

export default function ListingFilters({
  currentStatus,
  currentVertical
}: ListingFiltersProps) {
  const router = useRouter()

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (currentVertical) params.set('vertical', currentVertical)
    router.push(`/admin/listings${params.toString() ? '?' + params.toString() : ''}`)
  }

  const handleVerticalChange = (vertical: string) => {
    const params = new URLSearchParams()
    if (currentStatus) params.set('status', currentStatus)
    if (vertical) params.set('vertical', vertical)
    router.push(`/admin/listings${params.toString() ? '?' + params.toString() : ''}`)
  }

  return (
    <div style={{
      display: 'flex',
      gap: 15,
      marginBottom: 30,
      padding: 20,
      backgroundColor: 'white',
      borderRadius: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <div>
        <label style={{ display: 'block', marginBottom: 5, color: '#666', fontSize: 14 }}>
          Status
        </label>
        <select
          value={currentStatus || ''}
          onChange={(e) => handleStatusChange(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #ddd',
            minWidth: 150
          }}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: 5, color: '#666', fontSize: 14 }}>
          Vertical
        </label>
        <select
          value={currentVertical || ''}
          onChange={(e) => handleVerticalChange(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #ddd',
            minWidth: 150
          }}
        >
          <option value="">All Verticals</option>
          <option value="fireworks">Fireworks</option>
          <option value="farmers_market">Farmers Market</option>
        </select>
      </div>

      {(currentStatus || currentVertical) && (
        <div style={{ alignSelf: 'flex-end' }}>
          <Link
            href="/admin/listings"
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontSize: 14
            }}
          >
            Clear Filters
          </Link>
        </div>
      )}
    </div>
  )
}
