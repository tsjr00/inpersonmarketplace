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
  const { vertical, name, address, city, state, zip, latitude, longitude, day_of_week, start_time, end_time, season_start, season_end, status = 'active' } = body

  if (!vertical || !name || !address || !city || !state || !zip || day_of_week === undefined || !start_time || !end_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
      day_of_week: parseInt(day_of_week),
      start_time,
      end_time,
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

  return NextResponse.json({ market }, { status: 201 })
}
