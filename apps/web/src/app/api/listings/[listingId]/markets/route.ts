import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ listingId: string }>
}

/**
 * GET /api/listings/[listingId]/markets
 * Get available pickup locations for a listing with accepting status
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { listingId } = await context.params
  const supabase = await createClient()

  // Get all markets where this listing is available
  const { data: listingMarkets, error } = await supabase
    .from('listing_markets')
    .select(`
      market_id,
      markets (
        id,
        name,
        market_type,
        address,
        city,
        state,
        cutoff_hours,
        active,
        market_schedules (
          id,
          day_of_week,
          start_time,
          end_time,
          active
        )
      )
    `)
    .eq('listing_id', listingId)

  if (error) {
    console.error('Error fetching listing markets:', error)
    return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 })
  }

  const now = new Date()
  const currentDay = now.getDay()

  // Process markets to add availability info
  const markets = (listingMarkets || []).map(lm => {
    const market = lm.markets as unknown as {
      id: string
      name: string
      market_type: string
      address: string
      city: string
      state: string
      cutoff_hours: number | null
      active: boolean
      market_schedules: {
        id: string
        day_of_week: number
        start_time: string
        end_time: string
        active: boolean
      }[]
    }

    if (!market || !market.active) {
      return null
    }

    const activeSchedules = market.market_schedules?.filter(s => s.active) || []

    // Calculate next pickup datetime and if accepting orders
    let nextPickupAt: Date | null = null
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
        }
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
      next_pickup_at: nextPickupAt?.toISOString() || null
    }
  }).filter(Boolean)

  // Sort: open markets first, then by name
  markets.sort((a, b) => {
    if (a!.is_accepting !== b!.is_accepting) {
      return a!.is_accepting ? -1 : 1
    }
    return a!.market_name.localeCompare(b!.market_name)
  })

  return NextResponse.json({ markets })
}
