import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface MarketAvailability {
  market_id: string
  market_name: string
  market_type: string
  is_accepting: boolean
  cutoff_at: string | null
  next_market_at: string | null
  reason: string | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
      const nextCutoff = openMarkets
        .map(m => new Date(m.cutoff_at!).getTime())
        .sort((a, b) => a - b)[0]

      const hoursLeft = (nextCutoff - Date.now()) / (1000 * 60 * 60)
      hoursUntilCutoff = Math.round(hoursLeft * 10) / 10

      // Flag if closing within 24 hours
      if (hoursLeft <= 24 && hoursLeft > 0) {
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
}
