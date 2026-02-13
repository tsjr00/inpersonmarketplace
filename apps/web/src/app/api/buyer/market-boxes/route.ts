import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { createMarketBoxCheckoutSession } from '@/lib/stripe/payments'
import { calculateBuyerPrice } from '@/lib/pricing'
import { getAppUrl } from '@/lib/environment'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

import { getSubscriberDefault } from '@/lib/vendor-limits'

/**
 * GET /api/buyer/market-boxes
 * List buyer's market box subscriptions
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/buyer/market-boxes', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`buyer-market-boxes-get:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')

    crumb.supabase('select', 'market_box_subscriptions')
    let subQuery = supabase
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
        offering:market_box_offerings!inner (
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
          vertical_id,
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

    // Filter subscriptions by vertical via offering
    if (vertical) {
      subQuery = subQuery.eq('offering.vertical_id', vertical)
    }

    const { data: subscriptions, error } = await subQuery

    if (error) {
      throw traced.fromSupabase(error, { table: 'market_box_subscriptions', operation: 'select' })
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
  })
}

/**
 * POST /api/buyer/market-boxes
 * Purchase a market box (prepaid weekly pickup)
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/buyer/market-boxes', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`buyer-market-boxes-post:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const body = await request.json()
    const { offering_id, start_date, term_weeks = 4 } = body

    if (!offering_id) {
      throw traced.validation('ERR_MBOX_001', 'offering_id is required')
    }

    // Validate term_weeks
    if (![4, 8].includes(term_weeks)) {
      throw traced.validation('ERR_MBOX_002', 'term_weeks must be 4 or 8')
    }

    crumb.supabase('select', 'market_box_offerings')
    const { data: offering, error: offeringError } = await supabase
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

    if (offeringError) {
      throw traced.fromSupabase(offeringError, { table: 'market_box_offerings', operation: 'select' })
    }

    if (!offering || !offering.active) {
      throw traced.notFound('ERR_MBOX_003', 'Offering not found or not available')
    }

    // Validate term availability and get price
    let priceCents: number
    if (term_weeks === 8) {
      if (!offering.price_8week_cents) {
        throw traced.validation('ERR_MBOX_004', 'This market box does not offer an 8-week option')
      }
      priceCents = offering.price_8week_cents
    } else {
      priceCents = offering.price_4week_cents || offering.price_cents
    }

    // Check capacity
    const vendor = offering.vendor as any
    const tier = (vendor?.tier || 'standard')
    const maxSubscribers = offering.max_subscribers ?? getSubscriberDefault(tier)

    crumb.supabase('select', 'market_box_subscriptions (count)')
    const { count: activeCount, error: countError } = await supabase
      .from('market_box_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('offering_id', offering_id)
      .eq('status', 'active')

    if (countError) {
      throw traced.fromSupabase(countError, { table: 'market_box_subscriptions', operation: 'select' })
    }

    if (maxSubscribers !== null && (activeCount || 0) >= maxSubscribers) {
      throw traced.validation('ERR_MBOX_005', 'This market box is at capacity. Please try again later.')
    }

    // Check if user already has active subscription to this offering
    crumb.supabase('select', 'market_box_subscriptions (existing check)')
    const { count: existingSub, error: existingError } = await supabase
      .from('market_box_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('offering_id', offering_id)
      .eq('buyer_user_id', user.id)
      .eq('status', 'active')

    if (existingError) {
      throw traced.fromSupabase(existingError, { table: 'market_box_subscriptions', operation: 'select' })
    }

    if ((existingSub || 0) > 0) {
      throw traced.validation('ERR_MBOX_006', 'You already have an active purchase for this market box')
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

    // Get the vertical for the redirect URLs
    crumb.supabase('select', 'market_box_offerings (vertical)')
    const { data: offeringWithVertical } = await supabase
      .from('market_box_offerings')
      .select('market:markets(vertical_id)')
      .eq('id', offering_id)
      .single()

    const verticalId = (offeringWithVertical?.market as any)?.vertical_id || 'farmers_market'

    // Create Stripe checkout session
    // Apply buyer fee (6.5% + $0.15) to match what's shown on the detail page
    crumb.stripe('create checkout session')
    const buyerTotalCents = calculateBuyerPrice(priceCents)
    const baseUrl = getAppUrl()
    const session = await createMarketBoxCheckoutSession({
      offeringId: offering_id,
      offeringName: offering.name,
      userId: user.id,
      termWeeks: term_weeks,
      priceCents: buyerTotalCents,
      startDate: subscriptionStartDate,
      successUrl: `${baseUrl}/${verticalId}/buyer/subscriptions?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/${verticalId}/market-box/${offering_id}?cancelled=true`,
    })

    return NextResponse.json({
      checkout_url: session.url,
      session_id: session.id,
      message: 'Redirecting to checkout...',
    }, { status: 200 })
  })
}
