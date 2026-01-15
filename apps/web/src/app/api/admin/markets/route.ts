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

  // Get vertical
  const { data: verticalData, error: vertError } = await supabase
    .from('verticals')
    .select('id')
    .eq('vertical_id', vertical)
    .single()

  if (vertError || !verticalData) {
    return NextResponse.json({ error: 'Vertical not found' }, { status: 404 })
  }

  // Get all markets for this vertical
  const { data: markets, error: marketsError } = await supabase
    .from('markets')
    .select('*')
    .eq('vertical_id', verticalData.id)
    .order('market_type')
    .order('name')

  if (marketsError) {
    console.error('Error fetching markets:', marketsError)
    return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 })
  }

  return NextResponse.json({ markets: markets || [] })
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
  const { vertical, name, address, city, state, zip, day_of_week, start_time, end_time, status = 'active' } = body

  if (!vertical || !name || !address || !city || !state || !zip || day_of_week === undefined || !start_time || !end_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Get vertical
  const { data: verticalData, error: vertError } = await supabase
    .from('verticals')
    .select('id')
    .eq('vertical_id', vertical)
    .single()

  if (vertError || !verticalData) {
    return NextResponse.json({ error: 'Vertical not found' }, { status: 404 })
  }

  // Create traditional market (vendor_profile_id is NULL for traditional markets)
  const { data: market, error: createError } = await supabase
    .from('markets')
    .insert({
      vertical_id: verticalData.id,
      vendor_profile_id: null, // Traditional markets have no owner
      name,
      market_type: 'traditional',
      address,
      city,
      state,
      zip,
      day_of_week: parseInt(day_of_week),
      start_time,
      end_time,
      status
    })
    .select()
    .single()

  if (createError) {
    console.error('Error creating market:', createError)
    return NextResponse.json({ error: 'Failed to create market' }, { status: 500 })
  }

  return NextResponse.json({ market }, { status: 201 })
}
