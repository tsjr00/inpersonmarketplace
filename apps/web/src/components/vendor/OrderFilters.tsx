'use client'

interface PickupDateOption {
  date: string
  market_id: string
  market_name: string
  order_count: number
  item_count: number
}

interface OrderFiltersProps {
  currentStatus: string | null
  currentMarketId: string | null
  currentDateRange: string | null
  currentPickupDate: string | null
  markets: { id: string; name: string }[]
  upcomingPickupDates?: PickupDateOption[]
  onStatusChange: (status: string) => void
  onMarketChange: (marketId: string) => void
  onDateRangeChange: (dateRange: string) => void
  onPickupDateChange: (pickupDate: string) => void
  onClearFilters: () => void
}

// Format date for display (e.g., "Sat Feb 8")
function formatPickupDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

export default function OrderFilters({
  currentStatus,
  currentMarketId,
  currentDateRange,
  currentPickupDate,
  markets,
  upcomingPickupDates,
  onStatusChange,
  onMarketChange,
  onDateRangeChange,
  onPickupDateChange,
  onClearFilters
}: OrderFiltersProps) {
  // Check if any filters are active (besides default date range)
  const hasActiveFilters = currentStatus || currentMarketId || currentPickupDate || (currentDateRange && currentDateRange !== '30days')

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
      {/* Date Range Filter */}
      <div>
        <label style={{ fontSize: 14, fontWeight: 600, marginRight: 8, color: '#374151' }}>
          Period:
        </label>
        <select
          value={currentDateRange || '30days'}
          onChange={(e) => onDateRangeChange(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            backgroundColor: 'white',
            minWidth: 140
          }}
        >
          <option value="today">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
          <option value="month">This Month</option>
          <option value="all">All Time</option>
        </select>
      </div>

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
          <option value="">All Statuses</option>
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

      {/* Pickup Date Filter */}
      {upcomingPickupDates && upcomingPickupDates.length > 0 && (
        <div>
          <label style={{ fontSize: 14, fontWeight: 600, marginRight: 8, color: '#374151' }}>
            Pickup Date:
          </label>
          <select
            value={currentPickupDate || ''}
            onChange={(e) => onPickupDateChange(e.target.value)}
            style={{
              padding: '8px 12px',
              border: currentPickupDate ? '2px solid #1e40af' : '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              backgroundColor: currentPickupDate ? '#dbeafe' : 'white',
              minWidth: 200
            }}
          >
            <option value="">All Pickup Dates</option>
            {upcomingPickupDates.map(pd => (
              <option key={`${pd.date}-${pd.market_id}`} value={pd.date}>
                {formatPickupDate(pd.date)} - {pd.market_name} ({pd.item_count} item{pd.item_count !== 1 ? 's' : ''})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Clear Filters */}
      {hasActiveFilters && (
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
