import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/markets/[id] - Get market details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: market, error } = await supabase
    .from('markets')
    .select(`
      *,
      market_schedules(*),
      market_vendors(
        id,
        vendor_profile_id,
        approved,
        booth_number,
        notes,
        created_at,
        vendor_profiles(
          id,
          profile_data,
          status
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Transform vendor data for easier consumption
  const transformedMarket = {
    ...market,
    schedules: market.market_schedules,
    vendors: market.market_vendors?.map((mv: {
      id: string
      vendor_profile_id: string
      approved: boolean
      booth_number: string | null
      notes: string | null
      created_at: string
      vendor_profiles: {
        id: string
        profile_data: Record<string, unknown>
        status: string
      } | null
    }) => ({
      id: mv.id,
      vendor_profile_id: mv.vendor_profile_id,
      approved: mv.approved,
      booth_number: mv.booth_number,
      notes: mv.notes,
      created_at: mv.created_at,
      business_name: mv.vendor_profiles?.profile_data?.business_name ||
                     mv.vendor_profiles?.profile_data?.farm_name ||
                     'Unknown',
      vendor_status: mv.vendor_profiles?.status,
    })),
    market_schedules: undefined,
    market_vendors: undefined,
  }

  return NextResponse.json({ market: transformedMarket })
}

// PATCH /api/markets/[id] - Update market (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

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
  const allowedFields = [
    'name',
    'type',
    'description',
    'address',
    'city',
    'state',
    'zip',
    'latitude',
    'longitude',
    'contact_email',
    'contact_phone',
    'active',
    'season_start',
    'season_end',
  ]

  // Filter to only allowed fields
  const updateData: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field]
    }
  }

  // Validate type if provided
  if (updateData.type && !['traditional', 'private_pickup'].includes(updateData.type as string)) {
    return NextResponse.json(
      { error: 'Type must be either "traditional" or "private_pickup"' },
      { status: 400 }
    )
  }

  // Update market
  const { data: market, error } = await supabase
    .from('markets')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ market })
}

// DELETE /api/markets/[id] - Delete market (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

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

  // Delete market (cascades to schedules and vendor associations)
  const { error } = await supabase
    .from('markets')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Market deleted' })
}
