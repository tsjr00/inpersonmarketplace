import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { getSubscriberDefault } from '@/lib/vendor-limits'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/market-boxes/[id]
 * Get a single market box offering (public)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: offeringId } = await context.params

  return withErrorTracing('/api/market-boxes/[id]', 'GET', async () => {
    const supabase = await createClient()

    crumb.supabase('select', 'market_box_offerings')
    const { data: offering, error } = await supabase
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
        quantity_amount,
        quantity_unit,
        max_subscribers,
        active,
        created_at,
        vendor:vendor_profiles (
          id,
          user_id,
          tier,
          profile_data,
          description,
          profile_image_url
        ),
        market:markets (
          id,
          name,
          market_type,
          address,
          city,
          state,
          zip,
          contact_email,
          contact_phone,
          market_schedules (
            day_of_week,
            start_time,
            end_time
          )
        )
      `)
      .eq('id', offeringId)
      .single()

    if (error) {
      throw traced.fromSupabase(error, { table: 'market_box_offerings', operation: 'select', context: { offeringId } })
    }

    if (!offering) {
      throw traced.notFound('ERR_MBOX_010', 'Market box offering not found')
    }

    if (!offering.active) {
      throw traced.notFound('ERR_MBOX_011', 'This market box offering is no longer available')
    }

    crumb.supabase('select', 'market_box_subscriptions (count)')
    const { count, error: countError } = await supabase
      .from('market_box_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('offering_id', offeringId)
      .eq('status', 'active')

    if (countError) {
      throw traced.fromSupabase(countError, { table: 'market_box_subscriptions', operation: 'select' })
    }

    const vendor = offering.vendor as any
    const tier = (vendor?.tier || 'standard')
    const maxSubscribers = offering.max_subscribers ?? getSubscriberDefault(tier)
    const activeSubscribers = count || 0
    const isAvailable = maxSubscribers === null || activeSubscribers < maxSubscribers

    // Extract vendor info
    const profileData = vendor?.profile_data as Record<string, unknown> | null
    const vendorName =
      (profileData?.business_name as string) ||
      (profileData?.farm_name as string) ||
      'Vendor'

    // Check if current user is logged in and can purchase
    crumb.auth('Checking user for purchase eligibility')
    const { data: { user } } = await supabase.auth.getUser()
    let canPurchase = false
    let purchaseBlockReason: string | null = null

    if (!user) {
      purchaseBlockReason = 'Login required to purchase market boxes'
    } else if (!isAvailable) {
      purchaseBlockReason = 'This market box is currently at capacity'
    } else {
      // Check if user already has an active subscription to this offering
      crumb.supabase('select', 'market_box_subscriptions (existing check)')
      const { count: existingSub } = await supabase
        .from('market_box_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('offering_id', offeringId)
        .eq('buyer_user_id', user.id)
        .eq('status', 'active')

      if ((existingSub || 0) > 0) {
        purchaseBlockReason = 'You already have an active subscription to this market box'
      } else {
        canPurchase = true
      }
    }

    // Calculate next available start date (next occurrence of pickup_day_of_week)
    const today = new Date()
    const currentDay = today.getDay()
    const pickupDay = offering.pickup_day_of_week
    let daysUntilPickup = pickupDay - currentDay
    if (daysUntilPickup <= 0) {
      daysUntilPickup += 7 // Next week
    }
    const nextStartDate = new Date(today)
    nextStartDate.setDate(today.getDate() + daysUntilPickup)
    const nextStartDateStr = nextStartDate.toISOString().split('T')[0]

    // Build available terms
    const price4Week = offering.price_4week_cents || offering.price_cents
    const price8Week = offering.price_8week_cents

    const availableTerms = [
      {
        weeks: 4,
        label: '1 Month',
        price_cents: price4Week,
        price_per_week_cents: Math.round(price4Week / 4),
        savings_cents: 0,
        savings_percent: 0,
      }
    ]

    if (price8Week) {
      // Calculate savings vs buying 2x 4-week terms
      const twoTermPrice = price4Week * 2
      const savingsCents = twoTermPrice - price8Week
      const savingsPercent = Math.round((savingsCents / twoTermPrice) * 100)

      availableTerms.push({
        weeks: 8,
        label: '2 Months',
        price_cents: price8Week,
        price_per_week_cents: Math.round(price8Week / 8),
        savings_cents: savingsCents,
        savings_percent: savingsPercent,
      })
    }

    return NextResponse.json({
      offering: {
        id: offering.id,
        name: offering.name,
        description: offering.description,
        image_urls: offering.image_urls,
        price_cents: price4Week,
        price_4week_cents: price4Week,
        price_8week_cents: price8Week,
        quantity_amount: offering.quantity_amount,
        quantity_unit: offering.quantity_unit,
        pickup_day_of_week: offering.pickup_day_of_week,
        pickup_start_time: offering.pickup_start_time,
        pickup_end_time: offering.pickup_end_time,
        created_at: offering.created_at,
      },
      vendor: {
        id: vendor?.id,
        name: vendorName,
        description: vendor?.description,
        profile_image_url: vendor?.profile_image_url,
        tier: tier,
      },
      market: offering.market,
      availability: {
        is_available: isAvailable,
        active_subscribers: activeSubscribers,
        max_subscribers: maxSubscribers,
        spots_remaining: maxSubscribers === null ? null : Math.max(0, maxSubscribers - activeSubscribers),
      },
      available_terms: availableTerms,
      purchase: {
        can_purchase: canPurchase,
        block_reason: purchaseBlockReason,
        next_start_date: nextStartDateStr,
        weeks: 4,
        total_price_cents: price4Week,
      },
    })
  })
}
