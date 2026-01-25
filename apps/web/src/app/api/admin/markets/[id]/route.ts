import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'

async function verifyAdmin(supabase: SupabaseClient, userId: string) {
  const { data: userProfile, error } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', userId)
    .single()

  if (error || !userProfile) {
    return false
  }

  return userProfile.role === 'admin' || userProfile.roles?.includes('admin')
}

// PUT - Update market
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await verifyAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { id: marketId } = await params
  const body = await request.json()
  const { name, address, city, state, zip, latitude, longitude, schedules, season_start, season_end, status, approval_status, rejection_reason } = body

  // First, get the market to check its type
  const { data: existingMarket, error: fetchError } = await supabase
    .from('markets')
    .select('market_type')
    .eq('id', marketId)
    .single()

  if (fetchError || !existingMarket) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }

  // For private_pickup markets, admin can ONLY change status (suspend/unsuspend)
  // All other fields are vendor-managed
  if (existingMarket.market_type === 'private_pickup') {
    if (status === undefined) {
      return NextResponse.json({
        error: 'Admin can only suspend/unsuspend private pickup locations'
      }, { status: 400 })
    }

    // Only allow status changes for private pickups
    const { data: market, error: updateError } = await supabase
      .from('markets')
      .update({ status })
      .eq('id', marketId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating market status:', updateError)
      return NextResponse.json({ error: 'Failed to update market' }, { status: 500 })
    }

    return NextResponse.json({ market })
  }

  // For traditional markets, admin can update all fields
  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name
  if (address !== undefined) updateData.address = address
  if (city !== undefined) updateData.city = city
  if (state !== undefined) updateData.state = state
  if (zip !== undefined) updateData.zip = zip
  if (latitude !== undefined) updateData.latitude = latitude
  if (longitude !== undefined) updateData.longitude = longitude
  if (season_start !== undefined) updateData.season_start = season_start || null
  if (season_end !== undefined) updateData.season_end = season_end || null
  if (status !== undefined) updateData.status = status
  if (approval_status !== undefined) updateData.approval_status = approval_status
  if (rejection_reason !== undefined) updateData.rejection_reason = rejection_reason

  // Update market fields if any
  if (Object.keys(updateData).length > 0) {
    const { error: updateError } = await supabase
      .from('markets')
      .update(updateData)
      .eq('id', marketId)
      .eq('market_type', 'traditional')

    if (updateError) {
      console.error('Error updating market:', updateError)
      return NextResponse.json({ error: 'Failed to update market' }, { status: 500 })
    }
  }

  // Handle schedules update if provided
  if (schedules && Array.isArray(schedules)) {
    // Validate schedules
    if (schedules.length === 0) {
      return NextResponse.json({ error: 'At least one market day/time is required' }, { status: 400 })
    }

    for (const schedule of schedules) {
      if (schedule.day_of_week === undefined || schedule.day_of_week === null ||
          !schedule.start_time || !schedule.end_time) {
        return NextResponse.json({ error: 'Each schedule requires day, start time, and end time' }, { status: 400 })
      }
    }

    // Delete existing schedules and insert new ones
    const { error: deleteError } = await supabase
      .from('market_schedules')
      .delete()
      .eq('market_id', marketId)

    if (deleteError) {
      console.error('Error deleting old schedules:', deleteError)
      return NextResponse.json({ error: 'Failed to update schedules' }, { status: 500 })
    }

    // Insert new schedules
    const scheduleInserts = schedules.map((s: { day_of_week: number | string; start_time: string; end_time: string; active?: boolean }) => ({
      market_id: marketId,
      day_of_week: typeof s.day_of_week === 'string' ? parseInt(s.day_of_week) : s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      active: s.active !== false
    }))

    const { error: insertError } = await supabase
      .from('market_schedules')
      .insert(scheduleInserts)

    if (insertError) {
      console.error('Error inserting schedules:', insertError)
      return NextResponse.json({ error: 'Failed to create schedules' }, { status: 500 })
    }
  }

  // Fetch the updated market with schedules
  const { data: market, error: fetchUpdatedError } = await supabase
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
    .eq('id', marketId)
    .single()

  if (fetchUpdatedError) {
    console.error('Error fetching updated market:', fetchUpdatedError)
    return NextResponse.json({ error: 'Market updated but failed to fetch' }, { status: 500 })
  }

  return NextResponse.json({ market })
}

// DELETE - Delete market
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await verifyAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { id: marketId } = await params

  // Check if market has listings
  const { data: listingMarkets, error: checkError } = await supabase
    .from('listing_markets')
    .select('id')
    .eq('market_id', marketId)
    .limit(1)

  if (checkError) {
    console.error('Error checking listings:', checkError)
    return NextResponse.json({ error: 'Failed to check listings' }, { status: 500 })
  }

  if (listingMarkets && listingMarkets.length > 0) {
    return NextResponse.json({
      error: 'Cannot delete market with active listings. Suspend it instead or remove the listings first.'
    }, { status: 400 })
  }

  // Delete market (both traditional and private_pickup allowed for admin)
  const { error: deleteError } = await supabase
    .from('markets')
    .delete()
    .eq('id', marketId)

  if (deleteError) {
    console.error('Error deleting market:', deleteError)
    return NextResponse.json({ error: 'Failed to delete market' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
