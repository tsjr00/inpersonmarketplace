import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { getSubscriberDefault } from '@/lib/vendor-limits'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/market-boxes
 * Browse available market box offerings (public)
 */
export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`market-boxes:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/market-boxes', 'GET', async () => {
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const verticalId = searchParams.get('vertical')
    const marketId = searchParams.get('market')
    const dayOfWeek = searchParams.get('day') // 0-6

    // Build query for active offerings
    let query = supabase
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
        created_at,
        vendor:vendor_profiles (
          id,
          user_id,
          tier,
          profile_data
        ),
        market:markets (
          id,
          name,
          market_type,
          address,
          city,
          state,
          zip
        )
      `)
      .eq('active', true)

    // Apply filters
    if (verticalId) {
      query = query.eq('vertical_id', verticalId)
    }

    if (marketId) {
      query = query.eq('pickup_market_id', marketId)
    }

    if (dayOfWeek !== null && dayOfWeek !== undefined) {
      query = query.eq('pickup_day_of_week', parseInt(dayOfWeek))
    }

    query = query.order('created_at', { ascending: false })

    const { data: offerings, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get subscriber counts and check availability
    const offeringsWithAvailability = await Promise.all(
      (offerings || []).map(async (offering) => {
        // Count active subscribers
        const { count } = await supabase
          .from('market_box_subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('offering_id', offering.id)
          .eq('status', 'active')

        const vendor = offering.vendor as any
        const tier = (vendor?.tier || 'standard')
        const maxSubscribers = offering.max_subscribers ?? getSubscriberDefault(tier)
        const activeSubscribers = count || 0
        const isAvailable = maxSubscribers === null || activeSubscribers < maxSubscribers

        // Extract vendor name from profile_data
        const profileData = vendor?.profile_data as Record<string, unknown> | null
        const vendorName =
          (profileData?.business_name as string) ||
          (profileData?.farm_name as string) ||
          'Vendor'

        return {
          id: offering.id,
          name: offering.name,
          description: offering.description,
          image_urls: offering.image_urls,
          price_cents: offering.price_cents,
          pickup_day_of_week: offering.pickup_day_of_week,
          pickup_start_time: offering.pickup_start_time,
          pickup_end_time: offering.pickup_end_time,
          created_at: offering.created_at,
          vendor: {
            id: vendor?.id,
            name: vendorName,
            tier: tier,
          },
          market: offering.market,
          availability: {
            is_available: isAvailable,
            active_subscribers: activeSubscribers,
            max_subscribers: maxSubscribers,
            spots_remaining: maxSubscribers === null ? null : Math.max(0, maxSubscribers - activeSubscribers),
          },
        }
      })
    )

    // Only return available offerings by default (can be overridden)
    const showUnavailable = searchParams.get('show_unavailable') === 'true'
    const filteredOfferings = showUnavailable
      ? offeringsWithAvailability
      : offeringsWithAvailability.filter(o => o.availability.is_available)

    return NextResponse.json({
      offerings: filteredOfferings,
      total: filteredOfferings.length,
    })
  })
}
