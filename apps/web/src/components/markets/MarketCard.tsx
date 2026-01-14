'use client'

import Link from 'next/link'
import ScheduleDisplay from './ScheduleDisplay'

interface Schedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

interface MarketCardProps {
  market: {
    id: string
    name: string
    type: 'traditional' | 'private_pickup'
    description?: string
    address?: string
    city?: string
    state?: string
    zip?: string
    active: boolean
    schedule_count?: number
    vendor_count?: number
    schedules?: Schedule[]
  }
  vertical: string
}

export default function MarketCard({ market, vertical }: MarketCardProps) {
  const locationParts = [market.city, market.state].filter(Boolean)
  const location = locationParts.join(', ')

  return (
    <Link
      href={`/${vertical}/markets/${market.id}`}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          padding: 20,
          transition: 'box-shadow 0.2s, transform 0.2s',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>
            {market.name}
          </h3>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: market.type === 'traditional' ? '#e8f5e9' : '#fff3e0',
              color: market.type === 'traditional' ? '#2e7d32' : '#e65100',
            }}
          >
            {market.type === 'traditional' ? 'Farmers Market' : 'Private Pickup'}
          </span>
        </div>

        {/* Description */}
        {market.description && (
          <p style={{
            margin: '0 0 12px 0',
            fontSize: 14,
            color: '#666',
            lineHeight: 1.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {market.description}
          </p>
        )}

        {/* Location */}
        {location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span style={{ fontSize: 14, color: '#666' }}>{location}</span>
          </div>
        )}

        {/* Schedule (compact) */}
        {market.type === 'traditional' && (
          <div style={{ marginBottom: 12, fontSize: 14 }}>
            {market.schedules && market.schedules.length > 0 ? (
              <ScheduleDisplay schedules={market.schedules} compact />
            ) : (
              <span style={{ color: '#999' }}>
                {market.schedule_count ? `${market.schedule_count} scheduled days` : 'Schedule not set'}
              </span>
            )}
          </div>
        )}

        {/* Footer stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 12,
          borderTop: '1px solid #eee',
        }}>
          <span style={{ fontSize: 13, color: '#888' }}>
            {market.vendor_count || 0} vendor{(market.vendor_count || 0) !== 1 ? 's' : ''}
          </span>
          {!market.active && (
            <span style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: '#f8d7da',
              color: '#721c24',
            }}>
              Inactive
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
