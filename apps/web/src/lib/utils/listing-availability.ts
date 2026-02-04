/**
 * Shared utility for calculating listing market availability.
 * Used both server-side (listing page) and in API routes.
 */

export interface MarketSchedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

export interface MarketWithSchedules {
  id: string
  name: string
  market_type: string
  address: string
  city: string
  state: string
  cutoff_hours: number | null
  active: boolean
  market_schedules: MarketSchedule[]
}

export interface ProcessedMarket {
  market_id: string
  market_name: string
  market_type: 'traditional' | 'private_pickup'
  address: string
  city: string
  state: string
  is_accepting: boolean
  next_pickup_at: string | null
  start_time: string | null
  end_time: string | null
  cutoff_at: string | null
}

/**
 * Calculate availability status for a single market
 */
export function calculateMarketAvailability(market: MarketWithSchedules): ProcessedMarket | null {
  if (!market || !market.active) {
    return null
  }

  const now = new Date()
  const currentDay = now.getDay()
  const activeSchedules = market.market_schedules?.filter(s => s.active) || []

  // Calculate next pickup datetime and if accepting orders
  let nextPickupAt: Date | null = null
  let cutoffAt: Date | null = null
  let isAccepting = false
  const cutoffHours = market.cutoff_hours ?? (market.market_type === 'traditional' ? 18 : 10)

  for (const schedule of activeSchedules) {
    // Calculate next occurrence of this schedule
    let daysUntil = schedule.day_of_week - currentDay
    if (daysUntil < 0) daysUntil += 7
    if (daysUntil === 0) {
      // Check if we've passed today's time
      const [hours, minutes] = schedule.start_time.split(':').map(Number)
      const todaySchedule = new Date(now)
      todaySchedule.setHours(hours, minutes, 0, 0)

      if (now >= todaySchedule) {
        daysUntil = 7 // Next week
      }
    }

    const nextOccurrence = new Date(now)
    nextOccurrence.setDate(now.getDate() + daysUntil)
    const [hours, minutes] = schedule.start_time.split(':').map(Number)
    nextOccurrence.setHours(hours, minutes, 0, 0)

    // Check if within cutoff window
    const cutoffTime = new Date(nextOccurrence)
    cutoffTime.setHours(cutoffTime.getHours() - cutoffHours)

    if (now < cutoffTime) {
      isAccepting = true
      if (!nextPickupAt || nextOccurrence < nextPickupAt) {
        nextPickupAt = nextOccurrence
        cutoffAt = cutoffTime
      }
    }
  }

  // Find the schedule for the next pickup to get the hours
  let nextPickupStartTime: string | null = null
  let nextPickupEndTime: string | null = null
  if (nextPickupAt) {
    const nextPickupDay = nextPickupAt.getDay()
    const matchingSchedule = activeSchedules.find(s => s.day_of_week === nextPickupDay)
    if (matchingSchedule) {
      nextPickupStartTime = matchingSchedule.start_time
      nextPickupEndTime = matchingSchedule.end_time
    }
  }

  return {
    market_id: market.id,
    market_name: market.name,
    market_type: market.market_type as 'traditional' | 'private_pickup',
    address: market.address,
    city: market.city,
    state: market.state,
    is_accepting: isAccepting,
    next_pickup_at: nextPickupAt?.toISOString() || null,
    start_time: nextPickupStartTime,
    end_time: nextPickupEndTime,
    cutoff_at: cutoffAt?.toISOString() || null
  }
}

/**
 * Process multiple markets and sort by availability
 */
export function processListingMarkets(
  listingMarkets: { market_id: string; markets: MarketWithSchedules }[]
): ProcessedMarket[] {
  const markets = listingMarkets
    .map(lm => calculateMarketAvailability(lm.markets))
    .filter((m): m is ProcessedMarket => m !== null)

  // Sort: open markets first, then by name
  markets.sort((a, b) => {
    if (a.is_accepting !== b.is_accepting) {
      return a.is_accepting ? -1 : 1
    }
    return a.market_name.localeCompare(b.market_name)
  })

  return markets
}
