import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

/**
 * GET /api/admin/events
 *
 * List catering requests (admin only). Filterable by vertical and status.
 * Returns event-approved vendors for the invitation UI.
 *
 * See event_system_deep_dive.md Part 12.1 for status definitions.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/events', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(
      `admin:${clientIp}`,
      rateLimits.admin
    )
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const serviceClient = createServiceClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const vertical = searchParams.get('vertical') || 'food_trucks'

    let query = serviceClient
      .from('catering_requests')
      .select('*')
      .eq('vertical_id', vertical)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: requests, error: fetchError } = await query

    if (fetchError) {
      console.error('[admin/catering] Fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch catering requests' },
        { status: 500 }
      )
    }

    // Fetch approved vendors with enriched data for invite UI + scoring
    const { data: vendorProfiles } = await serviceClient
      .from('vendor_profiles')
      .select('id, user_id, profile_data, event_approved, tier, average_rating, rating_count, pickup_lead_minutes, orders_confirmed_count, orders_cancelled_after_confirm_count')
      .eq('vertical_id', vertical)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })

    // Get average listing price per vendor (for per-meal price matching)
    const vendorIds = (vendorProfiles || []).map(v => v.id)
    const avgPriceMap: Record<string, number | null> = {}
    const categoryMap: Record<string, string[]> = {}
    const eventItemMap: Record<string, number> = {}

    if (vendorIds.length > 0) {
      const { data: listingStats } = await serviceClient
        .from('listings')
        .select('vendor_profile_id, price_cents, category, listing_data')
        .in('vendor_profile_id', vendorIds)
        .eq('status', 'published')
        .is('deleted_at', null)

      if (listingStats) {
        // Group by vendor, calculate average price, collect categories, count event items
        const vendorPrices: Record<string, number[]> = {}
        const vendorCats: Record<string, Set<string>> = {}
        const vendorEventItems: Record<string, number> = {}
        for (const l of listingStats) {
          const vid = l.vendor_profile_id as string
          if (!vendorPrices[vid]) vendorPrices[vid] = []
          if (!vendorCats[vid]) vendorCats[vid] = new Set()
          if (!vendorEventItems[vid]) vendorEventItems[vid] = 0
          if (l.price_cents) vendorPrices[vid].push(l.price_cents as number)
          if (l.category) vendorCats[vid].add(l.category as string)
          const ld = l.listing_data as Record<string, unknown> | null
          if (ld?.event_menu_item) vendorEventItems[vid]++
        }
        for (const [vid, prices] of Object.entries(vendorPrices)) {
          avgPriceMap[vid] = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null
        }
        for (const [vid, cats] of Object.entries(vendorCats)) {
          categoryMap[vid] = Array.from(cats)
        }
        for (const [vid, count] of Object.entries(vendorEventItems)) {
          eventItemMap[vid] = count
        }
      }
    }

    const vendors = (vendorProfiles || []).map((v) => {
      const confirmedCount = (v as Record<string, unknown>).orders_confirmed_count as number || 0
      const cancelledCount = (v as Record<string, unknown>).orders_cancelled_after_confirm_count as number || 0
      const cancellationRate = confirmedCount >= 10 ? Math.round((cancelledCount / confirmedCount) * 100) : 0

      return {
        id: v.id,
        business_name:
          (v.profile_data as Record<string, unknown>)?.business_name as string ||
          (v.profile_data as Record<string, unknown>)?.farm_name as string ||
          'Unknown',
        event_approved: !!(v.event_approved),
        tier: (v.tier || 'free') as string,
        average_rating: v.average_rating as number | null,
        rating_count: (v.rating_count || 0) as number,
        pickup_lead_minutes: (v.pickup_lead_minutes || 30) as number,
        avg_price_cents: avgPriceMap[v.id] || null,
        listing_categories: categoryMap[v.id] || [],
        cancellation_rate: cancellationRate,
        event_item_count: eventItemMap[v.id] || 0,
      }
    })

    // Fetch market_vendors for any approved requests
    const marketIds = (requests || [])
      .filter((r) => r.market_id)
      .map((r) => r.market_id)

    const marketVendorsMap: Record<string, Array<{
      vendor_profile_id: string
      response_status: string | null
      response_notes: string | null
      invited_at: string | null
      menu_items?: string[]
    }>> = {}

    if (marketIds.length > 0) {
      const { data: mvData } = await serviceClient
        .from('market_vendors')
        .select('market_id, vendor_profile_id, response_status, response_notes, invited_at')
        .in('market_id', marketIds)

      if (mvData) {
        // Also fetch event_vendor_listings to show which items each vendor selected
        const { data: evlData } = await serviceClient
          .from('event_vendor_listings')
          .select('market_id, vendor_profile_id, listing:listings(title)')
          .in('market_id', marketIds)

        // Build a map: market_id → vendor_profile_id → listing titles
        const menuItemsMap: Record<string, Record<string, string[]>> = {}
        if (evlData) {
          for (const evl of evlData) {
            const mid = evl.market_id as string
            const vid = evl.vendor_profile_id as string
            if (!menuItemsMap[mid]) menuItemsMap[mid] = {}
            if (!menuItemsMap[mid][vid]) menuItemsMap[mid][vid] = []
            const listing = evl.listing as unknown as { title: string } | null
            if (listing?.title) menuItemsMap[mid][vid].push(listing.title)
          }
        }

        for (const mv of mvData) {
          const mid = mv.market_id as string
          const vid = mv.vendor_profile_id as string
          if (!marketVendorsMap[mid]) marketVendorsMap[mid] = []
          marketVendorsMap[mid].push({
            vendor_profile_id: vid,
            response_status: mv.response_status as string | null,
            response_notes: mv.response_notes as string | null,
            invited_at: mv.invited_at as string | null,
            menu_items: menuItemsMap[mid]?.[vid] || [],
          })
        }
      }
    }

    return NextResponse.json({
      requests: requests || [],
      vendors,
      marketVendorsMap,
    })
  })
}

// POST - Admin creates event directly (skips public form, goes straight to approved)
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/admin/events', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()

    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { company_name, contact_name, contact_email, contact_phone, event_date, event_end_date,
      event_start_time, event_end_time, headcount, address, city, state, zip, vendor_count,
      cuisine_preferences, dietary_notes, budget_notes, setup_instructions, additional_notes, vertical } = body

    if (!company_name || !event_date || !headcount || !address || !city || !state) {
      return NextResponse.json({ error: 'Missing required fields: company_name, event_date, headcount, address, city, state' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Generate event token
    const tokenBase = company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
    const tokenSuffix = Date.now().toString(36).slice(-6)
    const eventToken = `${tokenBase}-${tokenSuffix}`

    const { data: created, error: insertError } = await serviceClient
      .from('catering_requests')
      .insert({
        vertical_id: vertical || 'food_trucks',
        status: 'approved',
        company_name,
        contact_name: contact_name || 'Admin-created',
        contact_email: contact_email || user.email,
        contact_phone: contact_phone || null,
        event_date,
        event_end_date: event_end_date || event_date,
        event_start_time: event_start_time || '11:00:00',
        event_end_time: event_end_time || '14:00:00',
        headcount: parseInt(headcount),
        address,
        city,
        state,
        zip: zip || null,
        vendor_count: vendor_count || 2,
        cuisine_preferences: cuisine_preferences || null,
        dietary_notes: dietary_notes || null,
        budget_notes: budget_notes || null,
        setup_instructions: setup_instructions || null,
        additional_notes: additional_notes || null,
        admin_notes: 'Created by admin',
        event_token: eventToken,
      })
      .select('*')
      .single()

    if (insertError || !created) {
      console.error('[admin/events] Create error:', insertError)
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
    }

    // Auto-create event market (same logic as approval in PATCH)
    const eventSuffix = (vertical || 'food_trucks') === 'farmers_market' ? 'Pop-Up Market' : 'Private Event'
    const eventName = `${company_name} ${eventSuffix}`
    const dayOfWeek = new Date(event_date + 'T00:00:00').getDay()

    const { data: market } = await serviceClient
      .from('markets')
      .insert({
        vertical_id: vertical || 'food_trucks',
        vendor_profile_id: null,
        name: eventName,
        market_type: 'event',
        event_start_date: event_date,
        event_end_date: event_end_date || event_date,
        is_private: true,
        address,
        city,
        state,
        zip: zip || null,
        headcount: parseInt(headcount),
        cutoff_hours: 48,
        status: 'active',
        catering_request_id: created.id,
      })
      .select('id')
      .single()

    if (market) {
      // Create schedule
      await serviceClient.from('market_schedules').insert({
        market_id: market.id,
        day_of_week: dayOfWeek,
        start_time: event_start_time || '11:00:00',
        end_time: event_end_time || '14:00:00',
        active: true,
      })

      // Link market to catering request
      await serviceClient
        .from('catering_requests')
        .update({ market_id: market.id })
        .eq('id', created.id)
    }

    return NextResponse.json({ success: true, request: { ...created, market_id: market?.id || null } })
  })
}
