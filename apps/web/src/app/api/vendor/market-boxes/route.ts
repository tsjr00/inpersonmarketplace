import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getTierLimits,
  canCreateMarketBox,
  canActivateMarketBox,
  getMarketBoxUsage,
  formatLimitError,
} from '@/lib/vendor-limits'

// Subscriber limits per offering (separate from tier limits)
const SUBSCRIBER_LIMITS = {
  standard: 2,
  premium: null, // unlimited
} as const

/**
 * GET /api/vendor/market-boxes
 * List vendor's market box offerings with subscriber counts
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id, tier')
    .eq('user_id', user.id)
    .single()

  if (!vendor) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  // Get offerings with subscriber counts
  const { data: offerings, error } = await supabase
    .from('market_box_offerings')
    .select(`
      id,
      name,
      description,
      image_urls,
      price_cents,
      price_4week_cents,
      price_8week_cents,
      pickup_market_id,
      pickup_day_of_week,
      pickup_start_time,
      pickup_end_time,
      max_subscribers,
      active,
      created_at,
      updated_at,
      market:markets (
        id,
        name,
        market_type,
        address,
        city,
        state
      )
    `)
    .eq('vendor_profile_id', vendor.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get active subscriber counts for all offerings in a single batch query
  const offeringIds = (offerings || []).map(o => o.id)
  const subscriberCountsMap = new Map<string, number>()

  if (offeringIds.length > 0) {
    // Batch query: get all active subscriptions for these offerings
    const { data: subscriptions } = await supabase
      .from('market_box_subscriptions')
      .select('offering_id')
      .in('offering_id', offeringIds)
      .eq('status', 'active')

    // Count subscriptions per offering
    for (const sub of subscriptions || []) {
      const current = subscriberCountsMap.get(sub.offering_id) || 0
      subscriberCountsMap.set(sub.offering_id, current + 1)
    }
  }

  // Get tier for limits calculation
  const tier = vendor.tier || 'standard'
  const subscriberTierKey = tier as keyof typeof SUBSCRIBER_LIMITS

  // Build response with counts from the map
  const offeringsWithCounts = (offerings || []).map((offering) => {
    const count = subscriberCountsMap.get(offering.id) || 0
    const maxSubscribers = offering.max_subscribers ?? SUBSCRIBER_LIMITS[subscriberTierKey]

    return {
      ...offering,
      active_subscribers: count,
      max_subscribers: maxSubscribers,
      is_at_capacity: maxSubscribers !== null && count >= maxSubscribers,
    }
  })

  // Get tier limits using centralized utility
  const tierLimits = getTierLimits(tier)
  const totalCount = offeringsWithCounts.length
  const activeCount = offeringsWithCounts.filter(o => o.active).length

  return NextResponse.json({
    offerings: offeringsWithCounts,
    limits: {
      tier,
      // Total market boxes (active + inactive)
      max_total: tierLimits.totalMarketBoxes,
      current_total: totalCount,
      can_create_more: totalCount < tierLimits.totalMarketBoxes,
      // Active market boxes
      max_active: tierLimits.activeMarketBoxes,
      current_active: activeCount,
      can_activate_more: activeCount < tierLimits.activeMarketBoxes,
      // Legacy fields for backwards compatibility
      max_offerings: tierLimits.activeMarketBoxes,
      current_offerings: activeCount,
      subscriber_limit: SUBSCRIBER_LIMITS[subscriberTierKey],
    },
  })
}

/**
 * POST /api/vendor/market-boxes
 * Create a new market box offering
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile with tier
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id, tier, vertical_id')
    .eq('user_id', user.id)
    .single()

  if (!vendor) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  const tier = vendor.tier || 'standard'

  // Check total market box limit (can create any new box)
  const createCheck = await canCreateMarketBox(supabase, vendor.id, tier)
  if (!createCheck.allowed) {
    return NextResponse.json({
      error: formatLimitError(createCheck),
    }, { status: 403 })
  }

  // Check active market box limit (new boxes are created as active)
  const activateCheck = await canActivateMarketBox(supabase, vendor.id, tier)
  if (!activateCheck.allowed) {
    return NextResponse.json({
      error: formatLimitError(activateCheck),
    }, { status: 403 })
  }

  const body = await request.json()
  const {
    name,
    description,
    image_urls,
    price_cents,  // Legacy field - still accepted for backward compatibility
    price_4week_cents,
    price_8week_cents,
    pickup_market_id,
    pickup_day_of_week,
    pickup_start_time,
    pickup_end_time,
    max_subscribers,
  } = body

  // Support both old (price_cents) and new (price_4week_cents) field names
  const finalPrice4Week = price_4week_cents ?? price_cents

  // Validate required fields
  if (!name || !finalPrice4Week || !pickup_market_id || pickup_day_of_week === undefined || !pickup_start_time || !pickup_end_time) {
    return NextResponse.json({
      error: 'Missing required fields: name, price_4week_cents (or price_cents), pickup_market_id, pickup_day_of_week, pickup_start_time, pickup_end_time',
    }, { status: 400 })
  }

  // Validate price values
  if (finalPrice4Week < 100) {
    return NextResponse.json({ error: '4-week price must be at least $1.00' }, { status: 400 })
  }
  if (price_8week_cents !== undefined && price_8week_cents !== null && price_8week_cents < 100) {
    return NextResponse.json({ error: '8-week price must be at least $1.00' }, { status: 400 })
  }

  // Verify market exists and vendor has access
  const { data: market } = await supabase
    .from('markets')
    .select('id, name')
    .eq('id', pickup_market_id)
    .single()

  if (!market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }

  // Create offering
  const { data: offering, error } = await supabase
    .from('market_box_offerings')
    .insert({
      vendor_profile_id: vendor.id,
      vertical_id: vendor.vertical_id,
      name,
      description: description || null,
      image_urls: image_urls || [],
      price_cents: finalPrice4Week,  // Legacy field for backward compatibility
      price_4week_cents: finalPrice4Week,
      price_8week_cents: price_8week_cents || null,
      pickup_market_id,
      pickup_day_of_week,
      pickup_start_time,
      pickup_end_time,
      max_subscribers: max_subscribers || null,
      active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ offering }, { status: 201 })
}
