'use client'

interface OrderFiltersProps {
  currentStatus: string | null
  currentMarketId: string | null
  markets: { id: string; name: string }[]
  onStatusChange: (status: string) => void
  onMarketChange: (marketId: string) => void
  onClearFilters: () => void
}

export default function OrderFilters({
  currentStatus,
  currentMarketId,
  markets,
  onStatusChange,
  onMarketChange,
  onClearFilters
}: OrderFiltersProps) {
  return (
    <div style={{
      display: 'flex',
      gap: 12,
      padding: 16,
      backgroundColor: 'white',
      borderRadius: 8,
      border: '1px solid #e5e7eb',
      flexWrap: 'wrap',
      alignItems: 'center'
    }}>
      {/* Status Filter */}
      <div>
        <label style={{ fontSize: 14, fontWeight: 600, marginRight: 8, color: '#374151' }}>
          Status:
        </label>
        <select
          value={currentStatus || ''}
          onChange={(e) => onStatusChange(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            backgroundColor: 'white',
            minWidth: 150
          }}
        >
          <option value="">All Orders</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="ready">Ready for Pickup</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Market Filter */}
      {markets.length > 0 && (
        <div>
          <label style={{ fontSize: 14, fontWeight: 600, marginRight: 8, color: '#374151' }}>
            Market:
          </label>
          <select
            value={currentMarketId || ''}
            onChange={(e) => onMarketChange(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              backgroundColor: 'white',
              minWidth: 180
            }}
          >
            <option value="">All Markets</option>
            {markets.map(market => (
              <option key={market.id} value={market.id}>
                {market.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Clear Filters */}
      {(currentStatus || currentMarketId) && (
        <button
          onClick={onClearFilters}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            color: '#374151',
            cursor: 'pointer'
          }}
        >
          Clear Filters
        </button>
      )}
    </div>
  )
}
