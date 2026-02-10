/**
 * PICKUP SCHEDULING TYPES
 *
 * Types for the new pickup date selection system.
 * Buyers select specific pickup DATES, not just locations.
 *
 * See: docs/Build_Instructions/Pickup_Scheduling_Comprehensive_Plan.md
 */

/**
 * Available pickup date returned by get_available_pickup_dates() SQL function
 */
export interface AvailablePickupDate {
  market_id: string
  market_name: string
  market_type: 'traditional' | 'private_pickup'
  address: string
  city: string
  state: string
  schedule_id: string
  day_of_week: number
  pickup_date: string  // YYYY-MM-DD format
  start_time: string   // HH:MM:SS format
  end_time: string     // HH:MM:SS format
  cutoff_at: string    // ISO timestamp
  is_accepting: boolean
  hours_until_cutoff: number | null
  cutoff_hours: number  // Market's cutoff policy (18 for traditional, 10 for private_pickup)
}

/**
 * Grouped pickup dates by market for display
 */
export interface MarketPickupDates {
  market_id: string
  market_name: string
  market_type: 'traditional' | 'private_pickup'
  address: string
  city: string
  state: string
  dates: PickupDateOption[]
}

/**
 * Individual pickup date option within a market
 */
export interface PickupDateOption {
  schedule_id: string
  day_of_week: number
  pickup_date: string
  start_time: string
  end_time: string
  cutoff_at: string
  is_accepting: boolean
  hours_until_cutoff: number | null
  cutoff_hours: number  // Market's cutoff policy (18 for traditional, 10 for private_pickup)
}

/**
 * Pickup snapshot stored with orders (immutable)
 */
export interface PickupSnapshot {
  market_id: string
  market_name: string
  market_type: string
  address: string
  city: string
  state: string
  zip?: string
  start_time: string
  end_time: string
  day_of_week: number
  timezone: string
  pickup_date: string
  captured_at: string
}

/**
 * Cart item with pickup selection
 */
export interface CartItemWithPickup {
  id: string
  listing_id: string
  quantity: number
  schedule_id: string
  pickup_date: string
  market_id: string
}

/**
 * Helper to group flat pickup dates by market
 */
export function groupPickupDatesByMarket(dates: AvailablePickupDate[]): MarketPickupDates[] {
  const marketMap = new Map<string, MarketPickupDates>()

  for (const date of dates) {
    if (!marketMap.has(date.market_id)) {
      marketMap.set(date.market_id, {
        market_id: date.market_id,
        market_name: date.market_name,
        market_type: date.market_type,
        address: date.address,
        city: date.city,
        state: date.state,
        dates: []
      })
    }

    marketMap.get(date.market_id)!.dates.push({
      schedule_id: date.schedule_id,
      day_of_week: date.day_of_week,
      pickup_date: date.pickup_date,
      start_time: date.start_time,
      end_time: date.end_time,
      cutoff_at: date.cutoff_at,
      is_accepting: date.is_accepting,
      hours_until_cutoff: date.hours_until_cutoff,
      cutoff_hours: date.cutoff_hours
    })
  }

  // Sort dates within each market
  for (const market of marketMap.values()) {
    market.dates.sort((a, b) => a.pickup_date.localeCompare(b.pickup_date))
  }

  // Sort markets: those with accepting dates first, then by name
  return Array.from(marketMap.values()).sort((a, b) => {
    const aHasAccepting = a.dates.some(d => d.is_accepting)
    const bHasAccepting = b.dates.some(d => d.is_accepting)
    if (aHasAccepting !== bHasAccepting) {
      return aHasAccepting ? -1 : 1
    }
    return a.market_name.localeCompare(b.market_name)
  })
}

/**
 * Color palette for pickup date differentiation
 * NOT red/yellow/green (reserved for open/closed status)
 */
export const PICKUP_DATE_COLORS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#ec4899', // Pink
] as const

/**
 * Get color for a pickup date based on index
 */
export function getPickupDateColor(index: number): string {
  return PICKUP_DATE_COLORS[index % PICKUP_DATE_COLORS.length]
}

/**
 * Format time string (HH:MM:SS) to display format (h:MM AM/PM)
 */
export function formatPickupTime(time: string): string {
  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minutes} ${ampm}`
}

/**
 * Format pickup date for display (client-side only — uses browser timezone)
 * Returns "Today", "Tomorrow", or "Tue, Feb 10" format
 */
export function formatPickupDate(dateStr: string): string {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

  if (dateStr === todayStr) return 'Today'
  if (dateStr === tomorrowStr) return 'Tomorrow'

  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Format cutoff time remaining
 */
export function formatCutoffRemaining(hoursUntilCutoff: number | null): string {
  if (hoursUntilCutoff === null || hoursUntilCutoff <= 0) {
    return 'Closed'
  }
  if (hoursUntilCutoff < 1) {
    const minutes = Math.max(1, Math.round(hoursUntilCutoff * 60))
    return `${minutes} min left`
  }
  if (hoursUntilCutoff < 24) {
    const hours = Math.floor(hoursUntilCutoff)
    return `${hours} hr${hours !== 1 ? 's' : ''} left`
  }
  const days = Math.floor(hoursUntilCutoff / 24)
  return `${days} day${days !== 1 ? 's' : ''} left`
}
