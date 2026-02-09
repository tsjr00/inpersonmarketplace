import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { processListingMarkets, type MarketWithSchedules } from '@/lib/utils/listing-availability'
import { withErrorTracing } from '@/lib/errors'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/listings/[id]/markets
 * Get available pickup locations for a listing with accepting status
 */
export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/listings/[id]/markets', 'GET', async () => {
    const { id: listingId } = await context.params
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

    // Use shared utility for availability calculation
    // Supabase returns markets as a single object (not array) from the join
    const markets = processListingMarkets(
      (listingMarkets || []).map((lm: { market_id: string; markets: unknown }) => ({
        market_id: lm.market_id,
        markets: lm.markets as MarketWithSchedules
      }))
    )

    return NextResponse.json({ markets })
  })
}
