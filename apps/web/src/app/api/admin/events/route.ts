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

// GET - List catering requests (admin only)
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

    // Also fetch approved vendors for the invite UI
    const { data: vendorProfiles } = await serviceClient
      .from('vendor_profiles')
      .select('id, user_id, profile_data, event_approved')
      .eq('vertical_id', vertical)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })

    const vendors = (vendorProfiles || []).map((v) => ({
      id: v.id,
      business_name:
        (v.profile_data as Record<string, unknown>)?.business_name as string ||
        (v.profile_data as Record<string, unknown>)?.farm_name as string ||
        'Unknown',
      event_approved: !!(v.event_approved),
    }))

    // Fetch market_vendors for any approved requests
    const marketIds = (requests || [])
      .filter((r) => r.market_id)
      .map((r) => r.market_id)

    const marketVendorsMap: Record<string, Array<{
      vendor_profile_id: string
      response_status: string | null
      response_notes: string | null
      invited_at: string | null
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
