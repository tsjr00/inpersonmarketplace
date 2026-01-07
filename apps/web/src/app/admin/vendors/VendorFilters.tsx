'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface VendorFiltersProps {
  currentStatus?: string
  currentVertical?: string
  verticals: Array<{ vertical_id: string; name_public: string }>
}

export default function VendorFilters({
  currentStatus,
  currentVertical,
  verticals
}: VendorFiltersProps) {
  const router = useRouter()

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (currentVertical) params.set('vertical', currentVertical)
    router.push(`/admin/vendors${params.toString() ? '?' + params.toString() : ''}`)
  }

  const handleVerticalChange = (vertical: string) => {
    const params = new URLSearchParams()
    if (currentStatus) params.set('status', currentStatus)
    if (vertical) params.set('vertical', vertical)
    router.push(`/admin/vendors${params.toString() ? '?' + params.toString() : ''}`)
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
          <option value="submitted">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
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
          {verticals.map((v) => (
            <option key={v.vertical_id} value={v.vertical_id}>
              {v.name_public}
            </option>
          ))}
        </select>
      </div>

      {(currentStatus || currentVertical) && (
        <div style={{ alignSelf: 'flex-end' }}>
          <Link
            href="/admin/vendors"
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
