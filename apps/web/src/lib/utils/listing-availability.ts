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
  timezone: string | null
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
 * Get the current day-of-week and time in a specific timezone
 */
function getLocalTimeInfo(timezone: string): { dayOfWeek: number; hours: number; minutes: number } {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  })

  const parts = formatter.formatToParts(now)
  const weekdayPart = parts.find(p => p.type === 'weekday')?.value || 'Sun'
  const hourPart = parts.find(p => p.type === 'hour')?.value || '0'
  const minutePart = parts.find(p => p.type === 'minute')?.value || '0'

  // Map weekday string to number (0 = Sunday)
  const dayMap: Record<string, number> = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
  }

  return {
    dayOfWeek: dayMap[weekdayPart] ?? 0,
    hours: parseInt(hourPart, 10),
    minutes: parseInt(minutePart, 10)
  }
}

/**
 * Calculate the next occurrence of a scheduled market day in UTC
 */
function getNextMarketDatetime(
  scheduleDay: number,
  startTime: string,
  timezone: string
): Date {
  const now = new Date()
  const local = getLocalTimeInfo(timezone)
  const [scheduleHours, scheduleMinutes] = startTime.split(':').map(Number)

  // Calculate days until the next occurrence
  let daysUntil = scheduleDay - local.dayOfWeek
  if (daysUntil < 0) daysUntil += 7
  if (daysUntil === 0) {
    // Same day - check if market time has passed in local time
    const localTimeMinutes = local.hours * 60 + local.minutes
    const scheduleTimeMinutes = scheduleHours * 60 + scheduleMinutes
    if (localTimeMinutes >= scheduleTimeMinutes) {
      daysUntil = 7 // Next week
    }
  }

  // Get the current date in the market's timezone
  const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const todayInMarketTz = localDateFormatter.format(now)

  // Parse today's date and add days
  const [year, month, day] = todayInMarketTz.split('-').map(Number)
  const targetDate = new Date(Date.UTC(year, month - 1, day + daysUntil, scheduleHours, scheduleMinutes, 0))

  // Now targetDate is the datetime as if it were UTC, but we need to adjust for the market's timezone
  // Get the timezone offset for that specific datetime
  const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset'
  })
  // Use the targetDate to get the offset (handles DST correctly)
  const offsetParts = offsetFormatter.formatToParts(targetDate)
  const offsetStr = offsetParts.find(p => p.type === 'timeZoneName')?.value || 'GMT'

  // Parse offset like "GMT-06:00" or "GMT+05:30"
  const offsetMatch = offsetStr.match(/GMT([+-])(\d{2}):(\d{2})/)
  let offsetMinutes = 0
  if (offsetMatch) {
    const sign = offsetMatch[1] === '+' ? 1 : -1
    const hours = parseInt(offsetMatch[2], 10)
    const minutes = parseInt(offsetMatch[3], 10)
    offsetMinutes = sign * (hours * 60 + minutes)
  }

  // Adjust from "local as UTC" to actual UTC
  // If timezone is GMT-6, the local time 17:00 is actually 23:00 UTC (add 6 hours)
  // offsetMinutes for GMT-6 is -360, so we subtract it (which adds 360 minutes)
  return new Date(targetDate.getTime() - offsetMinutes * 60 * 1000)
}

/**
 * Calculate availability status for a single market
 */
export function calculateMarketAvailability(market: MarketWithSchedules): ProcessedMarket | null {
  if (!market || !market.active) {
    return null
  }

  const now = new Date()
  const timezone = market.timezone || 'America/Chicago'
  const activeSchedules = market.market_schedules?.filter(s => s.active) || []

  // Calculate next pickup datetime and if accepting orders
  let nextPickupAt: Date | null = null
  let cutoffAt: Date | null = null
  let isAccepting = false
  const cutoffHours = market.cutoff_hours ?? (market.market_type === 'traditional' ? 18 : 10)

  for (const schedule of activeSchedules) {
    // Calculate next occurrence of this schedule (in UTC)
    const nextOccurrence = getNextMarketDatetime(
      schedule.day_of_week,
      schedule.start_time,
      timezone
    )

    // Calculate cutoff time (subtract cutoff hours from market time)
    const cutoffTime = new Date(nextOccurrence.getTime() - cutoffHours * 60 * 60 * 1000)

    // Check if we're before the cutoff
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
    // Get the day of week in the market's timezone
    const nextPickupDayStr = nextPickupAt.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'short'
    })
    const dayMap: Record<string, number> = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    }
    const nextPickupDay = dayMap[nextPickupDayStr] ?? 0
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
