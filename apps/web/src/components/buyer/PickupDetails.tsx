'use client'

import { getMapsUrl } from '@/lib/utils/maps-link'

interface Market {
  id: string
  name: string
  type: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  contact_email: string | null
  contact_phone: string | null
  schedules: {
    day_of_week: number
    start_time: string
    end_time: string
  }[]
}

// Display data from pickup_snapshot (frozen at order time)
interface PickupDisplay {
  market_name: string
  pickup_date: string | null
  start_time: string | null
  end_time: string | null
  address: string | null
  city: string | null
  state: string | null
}

interface PickupDetailsProps {
  market: Market
  pickupDate: string | null
  // Optional display data from pickup_snapshot (takes precedence when available)
  display?: PickupDisplay | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Format time for display (e.g., "8:00 AM")
function formatTime(timeStr: string | null | undefined): string | null {
  if (!timeStr) return null
  const [hours, minutes] = timeStr.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return minutes === 0 ? `${displayHours} ${period}` : `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

// Format pickup date for display
function formatPickupDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const date = new Date(dateStr + 'T00:00:00') // Treat as local date
  if (isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
}

export default function PickupDetails({ market, pickupDate, display }: PickupDetailsProps) {
  const isTraditional = market.type === 'traditional'

  // Use display data from pickup_snapshot when available (immutable order details)
  const displayName = display?.market_name || market.name
  const displayAddress = display?.address || market.address
  const displayCity = display?.city || market.city
  const displayState = display?.state || market.state
  const displayPickupDate = display?.pickup_date || pickupDate
  const displayStartTime = display?.start_time
  const displayEndTime = display?.end_time

  return (
    <div style={{
      padding: 20,
      backgroundColor: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      marginBottom: 24
    }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, marginTop: 0, color: '#374151' }}>
        📍 Pickup Location
      </h3>

      {/* Market Name */}
      <p style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, color: '#111827' }}>
        {displayName}
      </p>

      {/* Address */}
      {displayAddress && (
        <div style={{ marginBottom: 12 }}>
          <a
            href={getMapsUrl(displayAddress, displayCity, displayState, market.zip)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', margin: 0, fontSize: 14, color: '#6b7280', textDecoration: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
          >
            {displayAddress}, {displayCity}, {displayState} {market.zip}
          </a>
        </div>
      )}

      {/* Pickup Date and Time - show when we have specific pickup info from snapshot */}
      {displayPickupDate && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Pickup Date:
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#1e40af', fontWeight: 500 }}>
            {formatPickupDate(displayPickupDate)}
            {displayStartTime && (
              <span>
                {' '}{formatTime(displayStartTime)}{displayEndTime && ` - ${formatTime(displayEndTime)}`}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Hours (Traditional Market) - only show if no specific pickup date from snapshot */}
      {!displayPickupDate && isTraditional && market.schedules && market.schedules.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Market Hours:
          </p>
          {market.schedules.map((schedule, idx) => (
            <p key={idx} style={{ margin: '2px 0', fontSize: 14, color: '#6b7280' }}>
              {DAYS[schedule.day_of_week]}: {schedule.start_time} - {schedule.end_time}
            </p>
          ))}
        </div>
      )}

      {/* Contact Info */}
      {(market.contact_email || market.contact_phone) && (
        <div>
          <p style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Questions? Contact:
          </p>
          {market.contact_email && (
            <p style={{ margin: '2px 0', fontSize: 14, color: '#6b7280' }}>
              📧 {market.contact_email}
            </p>
          )}
          {market.contact_phone && (
            <p style={{ margin: '2px 0', fontSize: 14, color: '#6b7280' }}>
              📞 {market.contact_phone}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
