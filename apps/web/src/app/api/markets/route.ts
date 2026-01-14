import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/markets - List all markets
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const verticalId = searchParams.get('vertical_id')
  const type = searchParams.get('type')
  const active = searchParams.get('active')
  const city = searchParams.get('city')

  // Build query
  let query = supabase
    .from('markets')
    .select(`
      *,
      market_schedules(count),
      market_vendors(count)
    `)
    .order('name', { ascending: true })

  // Apply filters
  if (verticalId) {
    query = query.eq('vertical_id', verticalId)
  }

  if (type) {
    query = query.eq('type', type)
  }

  if (active !== null) {
    query = query.eq('active', active === 'true')
  }

  if (city) {
    query = query.ilike('city', `%${city}%`)
  }

  const { data: markets, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Transform to include counts
  const transformedMarkets = markets?.map(market => ({
    ...market,
    schedule_count: market.market_schedules?.[0]?.count || 0,
    vendor_count: market.market_vendors?.[0]?.count || 0,
    market_schedules: undefined,
    market_vendors: undefined,
  }))

  return NextResponse.json({ markets: transformedMarkets })
}

// POST /api/markets - Create new market (admin only)
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user is admin
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Parse request body
  const body = await request.json()
  const {
    name,
    vertical_id,
    type,
    description,
    address,
    city,
    state,
    zip,
    contact_email,
    contact_phone,
  } = body

  // Validate required fields
  if (!name || !vertical_id || !type) {
    return NextResponse.json(
      { error: 'Missing required fields: name, vertical_id, type' },
      { status: 400 }
    )
  }

  if (!['traditional', 'private_pickup'].includes(type)) {
    return NextResponse.json(
      { error: 'Type must be either "traditional" or "private_pickup"' },
      { status: 400 }
    )
  }

  // Create market
  const { data: market, error } = await supabase
    .from('markets')
    .insert({
      name,
      vertical_id,
      type,
      description,
      address,
      city,
      state,
      zip,
      contact_email,
      contact_phone,
      active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ market }, { status: 201 })
}
