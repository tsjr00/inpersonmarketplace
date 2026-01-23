import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Default subscriber limits by tier
const SUBSCRIBER_LIMITS = {
  standard: 2,
  premium: null, // unlimited
} as const

/**
 * GET /api/buyer/market-boxes
 * List buyer's market box subscriptions
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get subscriptions with offering and pickup info
  const { data: subscriptions, error } = await supabase
    .from('market_box_subscriptions')
    .select(`
      id,
      total_paid_cents,
      start_date,
      status,
      weeks_completed,
      term_weeks,
      extended_weeks,
      original_end_date,
      created_at,
      completed_at,
      cancelled_at,
      offering:market_box_offerings (
        id,
        name,
        description,
        image_urls,
        price_cents,
        price_4week_cents,
        price_8week_cents,
        pickup_day_of_week,
        pickup_start_time,
        pickup_end_time,
        vendor:vendor_profiles (
          id,
          profile_data
        ),
        market:markets (
          id,
          name,
          market_type,
          address,
          city,
          state
        )
      ),
      pickups:market_box_pickups (
        id,
        week_number,
        scheduled_date,
        status,
        ready_at,
        picked_up_at,
        missed_at,
        rescheduled_to,
        is_extension,
        skipped_by_vendor_at,
        skip_reason
      )
    `)
    .eq('buyer_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Transform for frontend
  const transformed = (subscriptions || []).map(sub => {
    const offering = sub.offering as any
    const vendor = offering?.vendor
    const profileData = vendor?.profile_data as Record<string, unknown> | null
    const vendorName =
      (profileData?.business_name as string) ||
      (profileData?.farm_name as string) ||
      'Vendor'

    // Sort pickups by week number
    const pickups = ((sub.pickups as any[]) || []).sort((a, b) => a.week_number - b.week_number)

    // Find next upcoming pickup
    const today = new Date().toISOString().split('T')[0]
    const nextPickup = pickups.find(p =>
      p.scheduled_date >= today && ['scheduled', 'ready'].includes(p.status)
    )

    const termWeeks = (sub as any).term_weeks || 4
    const extendedWeeks = (sub as any).extended_weeks || 0
    const totalWeeks = termWeeks + extendedWeeks

    return {
      id: sub.id,
      status: sub.status,
      total_paid_cents: sub.total_paid_cents,
      start_date: sub.start_date,
      weeks_completed: sub.weeks_completed,
      term_weeks: termWeeks,
      extended_weeks: extendedWeeks,
      total_weeks: totalWeeks,
      original_end_date: (sub as any).original_end_date,
      created_at: sub.created_at,
      completed_at: sub.completed_at,
      cancelled_at: sub.cancelled_at,
      offering: {
        id: offering?.id,
        name: offering?.name,
        description: offering?.description,
        image_urls: offering?.image_urls,
        pickup_day_of_week: offering?.pickup_day_of_week,
        pickup_start_time: offering?.pickup_start_time,
        pickup_end_time: offering?.pickup_end_time,
      },
      vendor: {
        id: vendor?.id,
        name: vendorName,
      },
      market: offering?.market,
      pickups,
      next_pickup: nextPickup || null,
    }
  })

  // Separate active vs completed
  const active = transformed.filter(s => s.status === 'active')
  const completed = transformed.filter(s => s.status !== 'active')

  return NextResponse.json({
    subscriptions: transformed,
    active,
    completed,
    counts: {
      total: transformed.length,
      active: active.length,
      completed: completed.length,
    },
  })
}

/**
 * POST /api/buyer/market-boxes
 * Subscribe to a market box (premium buyers only)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user is premium buyer
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('buyer_tier')
    .eq('user_id', user.id)
    .single()

  if (userProfile?.buyer_tier !== 'premium') {
    return NextResponse.json({
      error: 'Premium membership required to purchase market boxes',
    }, { status: 403 })
  }

  const body = await request.json()
  const { offering_id, start_date, term_weeks = 4 } = body

  if (!offering_id) {
    return NextResponse.json({ error: 'offering_id is required' }, { status: 400 })
  }

  // Validate term_weeks
  if (![4, 8].includes(term_weeks)) {
    return NextResponse.json({ error: 'term_weeks must be 4 or 8' }, { status: 400 })
  }

  // Get offering
  const { data: offering } = await supabase
    .from('market_box_offerings')
    .select(`
      id,
      name,
      price_cents,
      price_4week_cents,
      price_8week_cents,
      max_subscribers,
      active,
      pickup_day_of_week,
      vendor:vendor_profiles (
        id,
        tier
      )
    `)
    .eq('id', offering_id)
    .single()

  if (!offering || !offering.active) {
    return NextResponse.json({ error: 'Offering not found or not available' }, { status: 404 })
  }

  // Validate term availability and get price
  let priceCents: number
  if (term_weeks === 8) {
    if (!offering.price_8week_cents) {
      return NextResponse.json({
        error: 'This market box does not offer an 8-week subscription option'
      }, { status: 400 })
    }
    priceCents = offering.price_8week_cents
  } else {
    priceCents = offering.price_4week_cents || offering.price_cents
  }

  // Check capacity
  const vendor = offering.vendor as any
  const tier = (vendor?.tier || 'standard') as keyof typeof SUBSCRIBER_LIMITS
  const maxSubscribers = offering.max_subscribers ?? SUBSCRIBER_LIMITS[tier]

  const { count: activeCount } = await supabase
    .from('market_box_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('offering_id', offering_id)
    .eq('status', 'active')

  if (maxSubscribers !== null && (activeCount || 0) >= maxSubscribers) {
    return NextResponse.json({
      error: 'This market box is at capacity. Please try again later.',
    }, { status: 400 })
  }

  // Check if user already has active subscription to this offering
  const { count: existingSub } = await supabase
    .from('market_box_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('offering_id', offering_id)
    .eq('buyer_user_id', user.id)
    .eq('status', 'active')

  if ((existingSub || 0) > 0) {
    return NextResponse.json({
      error: 'You already have an active subscription to this market box',
    }, { status: 400 })
  }

  // Calculate start date if not provided
  let subscriptionStartDate = start_date
  if (!subscriptionStartDate) {
    // Next occurrence of pickup_day_of_week
    const today = new Date()
    const currentDay = today.getDay()
    const pickupDay = offering.pickup_day_of_week
    let daysUntilPickup = pickupDay - currentDay
    if (daysUntilPickup <= 0) {
      daysUntilPickup += 7
    }
    const nextStart = new Date(today)
    nextStart.setDate(today.getDate() + daysUntilPickup)
    subscriptionStartDate = nextStart.toISOString().split('T')[0]
  }

  // TODO: In production, create Stripe checkout session here
  // For now, create subscription directly (simulating successful payment)

  const { data: subscription, error: subError } = await supabase
    .from('market_box_subscriptions')
    .insert({
      offering_id,
      buyer_user_id: user.id,
      total_paid_cents: priceCents,
      start_date: subscriptionStartDate,
      term_weeks,
      status: 'active',
      weeks_completed: 0,
    })
    .select()
    .single()

  if (subError) {
    console.error('Error creating subscription:', subError)
    return NextResponse.json({ error: subError.message }, { status: 500 })
  }

  // Pickups are auto-created by the trigger

  // Get the created pickups
  const { data: pickups } = await supabase
    .from('market_box_pickups')
    .select('*')
    .eq('subscription_id', subscription.id)
    .order('week_number')

  return NextResponse.json({
    subscription: {
      ...subscription,
      pickups: pickups || [],
    },
    message: `Successfully subscribed to ${offering.name}! Your first pickup is on ${subscriptionStartDate}.`,
  }, { status: 201 })
}
