import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Vendor tier limits for market box offerings
const OFFERING_LIMITS = {
  standard: 1,
  premium: 3,
} as const

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

  // Get active subscriber counts for each offering
  const offeringsWithCounts = await Promise.all(
    (offerings || []).map(async (offering) => {
      const { count } = await supabase
        .from('market_box_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('offering_id', offering.id)
        .eq('status', 'active')

      const tier = (vendor.tier || 'standard') as keyof typeof SUBSCRIBER_LIMITS
      const maxSubscribers = offering.max_subscribers ?? SUBSCRIBER_LIMITS[tier]

      return {
        ...offering,
        active_subscribers: count || 0,
        max_subscribers: maxSubscribers,
        is_at_capacity: maxSubscribers !== null && (count || 0) >= maxSubscribers,
      }
    })
  )

  // Get tier limits
  const tier = (vendor.tier || 'standard') as keyof typeof OFFERING_LIMITS
  const maxOfferings = OFFERING_LIMITS[tier]
  const activeOfferingCount = offeringsWithCounts.filter(o => o.active).length

  return NextResponse.json({
    offerings: offeringsWithCounts,
    limits: {
      tier,
      max_offerings: maxOfferings,
      current_offerings: activeOfferingCount,
      can_create_more: activeOfferingCount < maxOfferings,
      subscriber_limit: SUBSCRIBER_LIMITS[tier],
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

  // Check offering limit
  const tier = (vendor.tier || 'standard') as keyof typeof OFFERING_LIMITS
  const maxOfferings = OFFERING_LIMITS[tier]

  const { count: currentCount } = await supabase
    .from('market_box_offerings')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendor.id)
    .eq('active', true)

  if ((currentCount || 0) >= maxOfferings) {
    return NextResponse.json({
      error: `${tier} vendors can only have ${maxOfferings} active market box offering${maxOfferings > 1 ? 's' : ''}. Upgrade to premium for more.`,
    }, { status: 403 })
  }

  const body = await request.json()
  const {
    name,
    description,
    image_urls,
    price_cents,
    pickup_market_id,
    pickup_day_of_week,
    pickup_start_time,
    pickup_end_time,
    max_subscribers,
  } = body

  // Validate required fields
  if (!name || !price_cents || !pickup_market_id || pickup_day_of_week === undefined || !pickup_start_time || !pickup_end_time) {
    return NextResponse.json({
      error: 'Missing required fields: name, price_cents, pickup_market_id, pickup_day_of_week, pickup_start_time, pickup_end_time',
    }, { status: 400 })
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
      price_cents,
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
