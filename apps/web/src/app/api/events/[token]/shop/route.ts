import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/events/[token]/shop
 *
 * Public endpoint — returns event details, vendors, listings (full detail),
 * and schedule info for the event shopping page. No auth required to browse.
 * Prices are included in the response but the client hides them until auth.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/shop', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-shop:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { token } = await params
    const supabase = createServiceClient()

    // Fetch event by token
    const { data: event } = await supabase
      .from('catering_requests')
      .select('id, company_name, event_date, event_end_date, event_start_time, event_end_time, headcount, address, city, state, zip, vertical_id, market_id, status, vendor_count, is_themed, theme_description, children_present')
      .eq('event_token', token)
      .in('status', ['approved', 'ready', 'active'])
      .single()

    if (!event || !event.market_id) {
      return NextResponse.json({ error: 'Event not found or not yet open for pre-orders' }, { status: 404 })
    }

    // Get market schedule (needed for cart's schedule_id + pickup_date)
    const { data: schedule } = await supabase
      .from('market_schedules')
      .select('id, start_time, end_time, day_of_week')
      .eq('market_id', event.market_id)
      .limit(1)
      .single()

    // Get accepted vendor IDs from market_vendors (simple query, no join)
    const { data: marketVendors } = await supabase
      .from('market_vendors')
      .select('vendor_profile_id')
      .eq('market_id', event.market_id)
      .eq('response_status', 'accepted')

    const acceptedVendorIds = (marketVendors || []).map(mv => mv.vendor_profile_id as string)

    // Fetch vendor profiles separately (avoids PostgREST FK ambiguity with replaced_vendor_id)
    const vendorProfileMap: Record<string, {
      id: string; profile_data: Record<string, unknown>
      profile_image_url: string | null; description: string | null
      pickup_lead_minutes: number
    }> = {}

    if (acceptedVendorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('vendor_profiles')
        .select('id, profile_data, profile_image_url, description, pickup_lead_minutes')
        .in('id', acceptedVendorIds)

      for (const vp of profiles || []) {
        vendorProfileMap[vp.id] = {
          id: vp.id,
          profile_data: vp.profile_data as Record<string, unknown>,
          profile_image_url: vp.profile_image_url,
          description: vp.description,
          pickup_lead_minutes: (vp.pickup_lead_minutes as number) || 30,
        }
      }
    }

    const vendors: Array<{
      id: string
      business_name: string
      description: string | null
      profile_image_url: string | null
      pickup_lead_minutes: number
      listings: Array<{
        id: string
        title: string
        description: string | null
        price_cents: number
        primary_image_url: string | null
        quantity: number | null
        unit_label: string | null
      }>
    }> = []

    // Batch approach: get ALL event_vendor_listings for this market in one query,
    // then ALL listings in one query, then group by vendor in JS.
    // This avoids the per-vendor loop query issue.
    const { data: allEvlRows } = await supabase
      .from('event_vendor_listings')
      .select('vendor_profile_id, listing_id')
      .eq('market_id', event.market_id)
      .in('vendor_profile_id', acceptedVendorIds)

    const allListingIds = [...new Set((allEvlRows || []).map(r => r.listing_id as string))]

    // Fetch ALL listings in one call
    const allListingMap: Record<string, typeof vendors[0]['listings'][0]> = {}
    if (allListingIds.length > 0) {
      const { data: allListingRows } = await supabase
        .from('listings')
        .select('id, title, description, price_cents, image_urls, quantity, listing_data')
        .in('id', allListingIds)
        .eq('status', 'published')
        .is('deleted_at', null)

      for (const l of allListingRows || []) {
        const ld = (l.listing_data as Record<string, unknown>) || {}
        allListingMap[l.id] = {
          id: l.id,
          title: l.title,
          description: l.description,
          price_cents: l.price_cents as number,
          primary_image_url: (l.image_urls as string[] | null)?.[0] || null,
          quantity: l.quantity as number | null,
          unit_label: (ld.unit_label as string) || null,
        }
      }
    }

    // Group by vendor
    const vendorListingsMap: Record<string, typeof vendors[0]['listings']> = {}
    for (const evl of allEvlRows || []) {
      const vid = evl.vendor_profile_id as string
      const lid = evl.listing_id as string
      const listing = allListingMap[lid]
      if (!listing) continue
      if (!vendorListingsMap[vid]) vendorListingsMap[vid] = []
      vendorListingsMap[vid].push(listing)
    }

    // Build vendors array
    for (const vendorId of acceptedVendorIds) {
      const vp = vendorProfileMap[vendorId]
      if (!vp) continue
      const listings = vendorListingsMap[vendorId] || []
      if (listings.length === 0) continue
      vendors.push({
        id: vp.id,
        business_name: (vp.profile_data?.business_name as string) || (vp.profile_data?.farm_name as string) || 'Vendor',
        description: vp.description,
        profile_image_url: vp.profile_image_url,
        pickup_lead_minutes: vp.pickup_lead_minutes || 30,
        listings,
      })
    }

    const isFT = event.vertical_id === 'food_trucks'

    return NextResponse.json({
      event: {
        company_name: event.company_name,
        event_date: event.event_date,
        event_end_date: event.event_end_date,
        event_start_time: event.event_start_time,
        event_end_time: event.event_end_time,
        city: event.city,
        state: event.state,
        address: event.address,
        vertical_id: event.vertical_id,
        market_id: event.market_id,
        status: event.status,
        is_themed: event.is_themed,
        theme_description: event.theme_description,
        children_present: event.children_present,
      },
      schedule: schedule ? {
        id: schedule.id,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
      } : null,
      pickup_date: event.event_date, // for cart API
      vendors,
      vendor_count: vendors.length,
      is_food_truck: isFT,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
    })
  })
}
