import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/vendor/market-boxes/pickups
 * Get all upcoming/recent pickups for vendor's market box offerings
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!vendor) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  // Get query params for filtering
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // scheduled, ready, picked_up, missed
  const offeringId = searchParams.get('offering_id')
  const upcoming = searchParams.get('upcoming') === 'true'

  // Get vendor's offering IDs
  const { data: offerings } = await supabase
    .from('market_box_offerings')
    .select('id')
    .eq('vendor_profile_id', vendor.id)

  if (!offerings || offerings.length === 0) {
    return NextResponse.json({ pickups: [], pickups_by_date: {}, total: 0 })
  }

  const offeringIds = offerings.map(o => o.id)

  // First get subscription IDs for this vendor's offerings
  let subscriptionQuery = supabase
    .from('market_box_subscriptions')
    .select('id')
    .in('offering_id', offeringIds)

  if (offeringId) {
    subscriptionQuery = subscriptionQuery.eq('offering_id', offeringId)
  }

  const { data: subscriptions } = await subscriptionQuery

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ pickups: [], pickups_by_date: {}, total: 0 })
  }

  const subscriptionIds = subscriptions.map(s => s.id)

  // Now get pickups for those subscriptions
  let query = supabase
    .from('market_box_pickups')
    .select(`
      id,
      week_number,
      scheduled_date,
      status,
      ready_at,
      picked_up_at,
      missed_at,
      rescheduled_to,
      vendor_notes,
      is_extension,
      skipped_by_vendor_at,
      skip_reason,
      subscription:market_box_subscriptions (
        id,
        start_date,
        status,
        term_weeks,
        extended_weeks,
        buyer:user_profiles!market_box_subscriptions_buyer_user_id_fkey (
          display_name,
          email
        ),
        offering:market_box_offerings (
          id,
          name,
          price_cents,
          pickup_market_id,
          pickup_day_of_week,
          pickup_start_time,
          pickup_end_time,
          market:markets (
            id,
            name,
            market_type
          )
        )
      )
    `)
    .in('subscription_id', subscriptionIds)

  // Apply filters
  if (status) {
    query = query.eq('status', status)
  }

  if (upcoming) {
    // Only future scheduled/ready pickups
    const today = new Date().toISOString().split('T')[0]
    query = query
      .gte('scheduled_date', today)
      .in('status', ['scheduled', 'ready'])
  }

  query = query.order('scheduled_date', { ascending: true })

  const { data: pickups, error } = await query

  if (error) {
    console.error('Error fetching pickups:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter to only include pickups for this vendor's offerings (safety check)
  const filteredPickups = (pickups || []).filter(p => {
    const offering = (p.subscription as any)?.offering
    return offering && offeringIds.includes(offering.id)
  })

  // Group by date for easier display
  const pickupsByDate: Record<string, typeof filteredPickups> = {}
  for (const pickup of filteredPickups) {
    const date = pickup.scheduled_date
    if (!pickupsByDate[date]) {
      pickupsByDate[date] = []
    }
    pickupsByDate[date].push(pickup)
  }

  return NextResponse.json({
    pickups: filteredPickups,
    pickups_by_date: pickupsByDate,
    total: filteredPickups.length,
  })
}
