import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

// GET - Get all markets (admin view)
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/markets', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')

    if (!vertical) {
      return NextResponse.json({ error: 'Vertical required' }, { status: 400 })
    }

    // Check for platform admin role first
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    let isAdmin = hasAdminRole(userProfile || {})

    // If not platform admin, check if they're a vertical admin for this specific vertical
    if (!isAdmin) {
      const { data: verticalAdmin } = await supabase
        .from('vertical_admins')
        .select('id')
        .eq('user_id', user.id)
        .eq('vertical_id', vertical)
        .single()
      isAdmin = !!verticalAdmin
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Use service client to bypass RLS - admins need to see ALL markets including pending
    const serviceClient = createServiceClient()

    // Verify vertical exists
    const { data: verticalData, error: vertError } = await serviceClient
      .from('verticals')
      .select('vertical_id')
      .eq('vertical_id', vertical)
      .single()

    if (vertError || !verticalData) {
      return NextResponse.json({ error: 'Vertical not found' }, { status: 404 })
    }

    // Get all markets for this vertical with schedules
    // Note: markets.vertical_id is TEXT (e.g., "farmers_market"), not UUID
    // Using service client to bypass RLS - admins can see pending/unapproved markets
    const { data: markets, error: marketsError } = await serviceClient
      .from('markets')
      .select(`
        *,
        market_schedules (
          id,
          day_of_week,
          start_time,
          end_time,
          active
        )
      `)
      .eq('vertical_id', vertical)
      .order('market_type')
      .order('name')

    if (marketsError) {
      console.error('Error fetching markets:', marketsError)
      return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 })
    }

    // Get vendor names for any submitted markets (use service client to see all vendors)
    const vendorIds = (markets || [])
      .filter(m => m.submitted_by_vendor_id)
      .map(m => m.submitted_by_vendor_id)

    const vendorMap: Record<string, string> = {}
    if (vendorIds.length > 0) {
      const { data: vendors } = await serviceClient
        .from('vendor_profiles')
        .select('id, profile_data')
        .in('id', vendorIds)

      if (vendors) {
        vendors.forEach(v => {
          const profileData = v.profile_data as Record<string, unknown>
          vendorMap[v.id] = (profileData?.business_name as string) ||
                           (profileData?.farm_name as string) ||
                           'Unknown'
        })
      }
    }

    // Transform to include submitter name
    const transformedMarkets = (markets || []).map(market => ({
      ...market,
      submitted_by_name: market.submitted_by_vendor_id ? vendorMap[market.submitted_by_vendor_id] : null,
      schedules: market.market_schedules || [],
      market_schedules: undefined
    }))

    return NextResponse.json({ markets: transformedMarkets })
  })
}

// POST - Create traditional market (admin only)
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/admin/markets', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin using centralized helper
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { vertical, name, address, city, state, zip, latitude, longitude, day_of_week, start_time, end_time, schedules, season_start, season_end, status = 'active', market_type = 'traditional', event_start_date, event_end_date, event_url, cutoff_hours: customCutoffHours } = body

    if (!vertical || !name || !address || !city || !state || !zip) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate market_type
    if (!['traditional', 'event'].includes(market_type)) {
      return NextResponse.json({ error: 'Invalid market_type. Must be "traditional" or "event"' }, { status: 400 })
    }

    // Event-specific validation
    if (market_type === 'event') {
      if (!event_start_date || !event_end_date) {
        return NextResponse.json({ error: 'Events require start and end dates' }, { status: 400 })
      }
      if (event_end_date < event_start_date) {
        return NextResponse.json({ error: 'Event end date must be on or after start date' }, { status: 400 })
      }
    }

    // Validate schedules - either new schedules array or legacy single schedule fields
    const hasSchedulesArray = schedules && Array.isArray(schedules) && schedules.length > 0
    const hasLegacySchedule = day_of_week !== undefined && start_time && end_time

    if (!hasSchedulesArray && !hasLegacySchedule) {
      return NextResponse.json({ error: 'At least one market day/time is required' }, { status: 400 })
    }

    // Validate each schedule entry if using schedules array
    if (hasSchedulesArray) {
      for (const schedule of schedules) {
        if (schedule.day_of_week === undefined || schedule.day_of_week === null ||
            !schedule.start_time || !schedule.end_time) {
          return NextResponse.json({ error: 'Each schedule requires day, start time, and end time' }, { status: 400 })
        }
      }
    }

    // Verify vertical exists
    const { data: verticalExists, error: vertError } = await supabase
      .from('verticals')
      .select('vertical_id')
      .eq('vertical_id', vertical)
      .single()

    if (vertError || !verticalExists) {
      return NextResponse.json({ error: 'Vertical not found' }, { status: 404 })
    }

    // Create traditional market (vendor_profile_id is NULL for traditional markets)
    // Note: markets.vertical_id is TEXT (e.g., "farmers_market"), not UUID
    // Admin-created markets are automatically approved
    // Don't store day_of_week/start_time/end_time on markets table - use market_schedules
    // Use service client to bypass RLS - admin role already verified above
    const serviceClient = createServiceClient()

    const insertData: Record<string, unknown> = {
      vertical_id: vertical,
      vendor_profile_id: null, // Traditional/event markets have no owner
      name,
      market_type,
      address,
      city,
      state,
      zip,
      latitude: latitude || null,
      longitude: longitude || null,
      season_start: season_start || null,
      season_end: season_end || null,
      status,
      active: true, // Must be explicitly set
      approval_status: 'approved' // Admin-created markets are pre-approved
    }
    // Event-specific fields
    if (market_type === 'event') {
      insertData.event_start_date = event_start_date
      insertData.event_end_date = event_end_date
      insertData.event_url = event_url || null
      insertData.cutoff_hours = customCutoffHours ?? 24 // Default 24h advance cutoff for events
    } else if (customCutoffHours !== undefined) {
      insertData.cutoff_hours = customCutoffHours
    }

    const { data: market, error: createError } = await serviceClient
      .from('markets')
      .insert(insertData)
      .select()
      .single()

    if (createError) {
      console.error('Error creating market:', createError)
      return NextResponse.json({
        error: 'Failed to create market',
        details: createError.message,
        code: createError.code
      }, { status: 500 })
    }

    // Create market_schedules
    const scheduleInserts = hasSchedulesArray
      ? schedules.map((s: { day_of_week: number | string; start_time: string; end_time: string }) => ({
          market_id: market.id,
          day_of_week: typeof s.day_of_week === 'string' ? parseInt(s.day_of_week) : s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          active: true
        }))
      : [{
          market_id: market.id,
          day_of_week: typeof day_of_week === 'string' ? parseInt(day_of_week) : day_of_week,
          start_time,
          end_time,
          active: true
        }]

    const { error: scheduleError } = await serviceClient
      .from('market_schedules')
      .insert(scheduleInserts)

    if (scheduleError) {
      console.error('Error creating market schedules:', scheduleError)
      // Clean up the market if schedules failed
      await serviceClient.from('markets').delete().eq('id', market.id)
      return NextResponse.json({
        error: 'Failed to create market schedules',
        details: scheduleError.message,
        code: scheduleError.code
      }, { status: 500 })
    }

    // Fetch the market with schedules to return
    const { data: marketWithSchedules } = await serviceClient
      .from('markets')
      .select(`
        *,
        market_schedules (
          id,
          day_of_week,
          start_time,
          end_time,
          active
        )
      `)
      .eq('id', market.id)
      .single()

    // Invalidate cached market pages so new market appears immediately
    revalidatePath('/[vertical]/markets', 'page')

    return NextResponse.json({ market: marketWithSchedules }, { status: 201 })
  })
}
