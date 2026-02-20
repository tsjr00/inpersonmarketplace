import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { DEFAULT_CUTOFF_HOURS } from '@/lib/constants'

interface MarketAvailability {
  market_id: string
  market_name: string
  market_type: string
  is_accepting: boolean
  cutoff_at: string | null
  next_market_at: string | null
  reason: string | null
  cutoff_hours?: number  // Market's cutoff policy (18 for traditional, 10 for private)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/listings/[id]/availability', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`listing-availability:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: listingId } = await params
    const supabase = await createClient()

    try {
      // First check if listing exists and is published
      const { data: listing, error: listingError } = await supabase
        .from('listings')
        .select('id, title, status')
        .eq('id', listingId)
        .is('deleted_at', null)
        .single()

      if (listingError || !listing) {
        return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      }

      if (listing.status !== 'published') {
        return NextResponse.json({
          is_accepting_orders: false,
          reason: 'Listing is not published',
          markets: []
        })
      }

      // Get overall availability
      const { data: isAccepting, error: acceptingError } = await supabase
        .rpc('is_listing_accepting_orders', { p_listing_id: listingId })

      // Get detailed market availability
      const { data: marketAvailability, error: availabilityError } = await supabase
        .rpc('get_listing_market_availability', { p_listing_id: listingId })

      if (acceptingError || availabilityError) {
        // If RPC functions don't exist yet (migration not applied), return default open state
        console.error('Availability check error:', acceptingError || availabilityError)
        return NextResponse.json({
          is_accepting_orders: true,
          reason: null,
          markets: [],
          note: 'Cutoff feature not yet enabled'
        })
      }

      const markets = (marketAvailability as MarketAvailability[] | null) || []

      // Find the reason if not accepting
      let reason: string | null = null
      if (!isAccepting && markets.length > 0) {
        const closedMarket = markets.find(m => !m.is_accepting)
        reason = closedMarket?.reason || 'Orders closed for upcoming market'
      }

      // Calculate time until cutoff for open markets
      const openMarkets = markets.filter(m => m.is_accepting && m.cutoff_at)
      let closingSoon = false
      let hoursUntilCutoff: number | null = null

      if (openMarkets.length > 0) {
        // Find the market with the soonest cutoff
        const sortedMarkets = [...openMarkets].sort(
          (a, b) => new Date(a.cutoff_at!).getTime() - new Date(b.cutoff_at!).getTime()
        )
        const nextCutoffMarket = sortedMarkets[0]
        const nextCutoff = new Date(nextCutoffMarket.cutoff_at!).getTime()

        const hoursLeft = (nextCutoff - Date.now()) / (1000 * 60 * 60)
        hoursUntilCutoff = Math.round(hoursLeft * 10) / 10

        // Use market's actual cutoff_hours policy, fallback to centralized defaults
        const cutoffThreshold = nextCutoffMarket.cutoff_hours ??
          (DEFAULT_CUTOFF_HOURS[nextCutoffMarket.market_type as keyof typeof DEFAULT_CUTOFF_HOURS] ?? DEFAULT_CUTOFF_HOURS.traditional)

        // Flag if closing within the market's cutoff threshold
        if (hoursLeft <= cutoffThreshold && hoursLeft > 0) {
          closingSoon = true
        }
      }

      return NextResponse.json({
        is_accepting_orders: isAccepting ?? true,
        reason,
        markets,
        closing_soon: closingSoon,
        hours_until_cutoff: hoursUntilCutoff
      })
    } catch (error) {
      console.error('Availability check error:', error)
      return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 })
    }
  })
}
