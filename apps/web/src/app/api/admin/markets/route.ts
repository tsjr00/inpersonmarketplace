import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET - Get all markets (admin view)
export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify admin
  const { data: userProfile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  if (profileError || !userProfile || (userProfile.role !== 'admin' && !userProfile.roles?.includes('admin'))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const vertical = searchParams.get('vertical')

  if (!vertical) {
    return NextResponse.json({ error: 'Vertical required' }, { status: 400 })
  }

  // Verify vertical exists
  const { data: verticalData, error: vertError } = await supabase
    .from('verticals')
    .select('vertical_id')
    .eq('vertical_id', vertical)
    .single()

  if (vertError || !verticalData) {
    return NextResponse.json({ error: 'Vertical not found' }, { status: 404 })
  }

  // Get all markets for this vertical with schedules
  // Note: markets.vertical_id is TEXT (e.g., "farmers_market"), not UUID
  const { data: markets, error: marketsError } = await supabase
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

  // Get vendor names for any submitted markets
  const vendorIds = (markets || [])
    .filter(m => m.submitted_by_vendor_id)
    .map(m => m.submitted_by_vendor_id)

  let vendorMap: Record<string, string> = {}
  if (vendorIds.length > 0) {
    const { data: vendors } = await supabase
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
}

// POST - Create traditional market (admin only)
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify admin
  const { data: userProfile, error: profileError } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  if (profileError || !userProfile || (userProfile.role !== 'admin' && !userProfile.roles?.includes('admin'))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const { vertical, name, address, city, state, zip, latitude, longitude, day_of_week, start_time, end_time, schedules, season_start, season_end, status = 'active' } = body

  if (!vertical || !name || !address || !city || !state || !zip) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
  const { data: market, error: createError } = await supabase
    .from('markets')
    .insert({
      vertical_id: vertical,
      vendor_profile_id: null, // Traditional markets have no owner
      name,
      market_type: 'traditional',
      address,
      city,
      state,
      zip,
      latitude: latitude || null,
      longitude: longitude || null,
      season_start: season_start || null,
      season_end: season_end || null,
      status,
      approval_status: 'approved' // Admin-created markets are pre-approved
    })
    .select()
    .single()

  if (createError) {
    console.error('Error creating market:', createError)
    return NextResponse.json({ error: 'Failed to create market' }, { status: 500 })
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

  const { error: scheduleError } = await supabase
    .from('market_schedules')
    .insert(scheduleInserts)

  if (scheduleError) {
    console.error('Error creating market schedules:', scheduleError)
    // Clean up the market if schedules failed
    await supabase.from('markets').delete().eq('id', market.id)
    return NextResponse.json({ error: 'Failed to create market schedules' }, { status: 500 })
  }

  // Fetch the market with schedules to return
  const { data: marketWithSchedules } = await supabase
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

  return NextResponse.json({ market: marketWithSchedules }, { status: 201 })
}
