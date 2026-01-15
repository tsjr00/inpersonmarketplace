'use client'

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

interface PickupDetailsProps {
  market: Market
  pickupDate: string | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function PickupDetails({ market, pickupDate }: PickupDetailsProps) {
  const isTraditional = market.type === 'traditional'

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
        {market.name}
      </p>

      {/* Address */}
      {market.address && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
            {market.address}
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
            {market.city}, {market.state} {market.zip}
          </p>
        </div>
      )}

      {/* Hours (Traditional Market) */}
      {isTraditional && market.schedules && market.schedules.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Market Hours:
          </p>
          {market.schedules.map((schedule, idx) => (
            <p key={idx} style={{ margin: '2px 0', fontSize: 14, color: '#6b7280' }}>
              {DAYS[schedule.day_of_week]}: {schedule.start_time} - {schedule.end_time}
            </p>
          ))}
          <p style={{
            margin: '8px 0 0 0',
            fontSize: 13,
            color: '#ef4444',
            fontWeight: 600
          }}>
            ⚠️ Late pickup may incur a fee
          </p>
        </div>
      )}

      {/* Pickup Date (Private Pickup) */}
      {!isTraditional && pickupDate && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Pickup Window:
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
            {new Date(pickupDate).toLocaleString()}
          </p>
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
