import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getTierLimits,
  canCreateMarketBox,
  canActivateMarketBox,
  formatLimitError,
} from '@/lib/vendor-limits'
import { withErrorTracing } from '@/lib/errors/with-error-tracing'
import { TracedError } from '@/lib/errors/traced-error'

import { getSubscriberDefault } from '@/lib/vendor-limits'

/**
 * GET /api/vendor/market-boxes
 * List vendor's market box offerings with subscriber counts
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/market-boxes', 'GET', async () => {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new TracedError('ERR_AUTH_001', 'Unauthorized')
    }

    // Get vendor profile — scoped to vertical if provided
    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')
    let vpQuery = supabase
      .from('vendor_profiles')
      .select('id, tier')
      .eq('user_id', user.id)
    if (vertical) {
      vpQuery = vpQuery.eq('vertical_id', vertical)
    }
    const { data: vendor } = await vpQuery.single()

    if (!vendor) {
      throw new TracedError('ERR_AUTH_003', 'Vendor not found', { userId: user.id })
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
      throw new TracedError('ERR_MBOX_001', 'Failed to fetch market box offerings', {
        vendorId: vendor.id,
        pgCode: error.code,
        pgDetail: error.message,
      })
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

    // Build response with counts from the map
    const offeringsWithCounts = (offerings || []).map((offering) => {
      const count = subscriberCountsMap.get(offering.id) || 0
      const maxSubscribers = offering.max_subscribers ?? getSubscriberDefault(tier)

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
        subscriber_limit: getSubscriberDefault(tier),
      },
    })
  })
}

/**
 * POST /api/vendor/market-boxes
 * Create a new market box offering
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/market-boxes', 'POST', async () => {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new TracedError('ERR_AUTH_001', 'Unauthorized')
    }

    // Parse body once — reused below for offering fields
    const body = await request.json()
    const vertical = body.vertical
    let vpPostQuery = supabase
      .from('vendor_profiles')
      .select('id, tier, vertical_id')
      .eq('user_id', user.id)
    if (vertical) {
      vpPostQuery = vpPostQuery.eq('vertical_id', vertical)
    }
    const { data: vendor } = await vpPostQuery.single()

    if (!vendor) {
      throw new TracedError('ERR_AUTH_003', 'Vendor not found', { userId: user.id })
    }

    const tier = vendor.tier || 'standard'

    // Check total market box limit (can create any new box)
    const createCheck = await canCreateMarketBox(supabase, vendor.id, tier)
    if (!createCheck.allowed) {
      throw new TracedError('ERR_MBOX_003', formatLimitError(createCheck), {
        vendorId: vendor.id,
        tier,
      })
    }

    // Check active market box limit (new boxes are created as active)
    const activateCheck = await canActivateMarketBox(supabase, vendor.id, tier)
    if (!activateCheck.allowed) {
      throw new TracedError('ERR_MBOX_003', formatLimitError(activateCheck), {
        vendorId: vendor.id,
        tier,
      })
    }

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
      throw new TracedError('ERR_MBOX_007', 'Missing required fields: name, price_4week_cents (or price_cents), pickup_market_id, pickup_day_of_week, pickup_start_time, pickup_end_time', {
        providedFields: { name: !!name, price: !!finalPrice4Week, market: !!pickup_market_id, day: pickup_day_of_week !== undefined, times: !!(pickup_start_time && pickup_end_time) },
      })
    }

    // Validate price values
    if (finalPrice4Week < 100) {
      throw new TracedError('ERR_MBOX_006', '4-week price must be at least $1.00', {
        providedPrice: finalPrice4Week,
      })
    }
    if (price_8week_cents !== undefined && price_8week_cents !== null && price_8week_cents < 100) {
      throw new TracedError('ERR_MBOX_006', '8-week price must be at least $1.00', {
        providedPrice: price_8week_cents,
      })
    }

    // Verify market exists, vendor has access, and get market details for schedule validation
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select(`
        id,
        name,
        market_type,
        market_schedules (
          id,
          day_of_week,
          start_time,
          end_time,
          active
        )
      `)
      .eq('id', pickup_market_id)
      .single()

    if (marketError || !market) {
      throw new TracedError('ERR_MBOX_004', 'Market not found or inaccessible', {
        marketId: pickup_market_id,
        pgCode: marketError?.code,
        pgDetail: marketError?.message,
      })
    }

    // For traditional markets, validate that pickup schedule matches market's operating schedule
    if (market.market_type === 'traditional') {
      const marketSchedules = (market.market_schedules || []).filter((s: { active: boolean }) => s.active)
      const pickupDayNum = typeof pickup_day_of_week === 'string' ? parseInt(pickup_day_of_week) : pickup_day_of_week

      // Check if the selected day/time matches any of the market's schedules
      const matchingSchedule = marketSchedules.find((schedule: { day_of_week: number; start_time: string; end_time: string }) => {
        // Match day of week
        if (schedule.day_of_week !== pickupDayNum) return false

        // Normalize times for comparison (remove seconds if present)
        const scheduleStart = schedule.start_time.slice(0, 5)
        const scheduleEnd = schedule.end_time.slice(0, 5)
        const requestStart = pickup_start_time.slice(0, 5)
        const requestEnd = pickup_end_time.slice(0, 5)

        // Times must match exactly (frontend selects from market's schedule)
        return scheduleStart === requestStart && scheduleEnd === requestEnd
      })

      if (!matchingSchedule) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const availableDays = marketSchedules.map((s: { day_of_week: number; start_time: string; end_time: string }) =>
          `${dayNames[s.day_of_week]} ${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`
        ).join(', ')

        throw new TracedError('ERR_MBOX_002', `The selected pickup time does not match ${market.name}'s operating schedule. Available times: ${availableDays || 'None configured'}`, {
          marketId: pickup_market_id,
          marketName: market.name,
          requestedDay: pickupDayNum,
          requestedStart: pickup_start_time,
          requestedEnd: pickup_end_time,
          availableSchedules: marketSchedules,
        })
      }
    }
    // For private_pickup markets, any day/time is allowed (vendor's own location)

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
        pickup_day_of_week: typeof pickup_day_of_week === 'string' ? parseInt(pickup_day_of_week) : pickup_day_of_week,
        pickup_start_time,
        pickup_end_time,
        max_subscribers: max_subscribers || null,
        active: true,
      })
      .select()
      .single()

    if (error) {
      throw new TracedError('ERR_MBOX_001', 'Failed to create market box offering', {
        vendorId: vendor.id,
        marketId: pickup_market_id,
        pgCode: error.code,
        pgDetail: error.message,
      })
    }

    return NextResponse.json({ offering }, { status: 201 })
  })
}
