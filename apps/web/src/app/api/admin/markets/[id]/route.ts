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
  const { name, address, city, state, zip, latitude, longitude, day_of_week, start_time, end_time, season_start, season_end, status, approval_status, rejection_reason } = body

  // Build update object - only include defined fields
  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name
  if (address !== undefined) updateData.address = address
  if (city !== undefined) updateData.city = city
  if (state !== undefined) updateData.state = state
  if (zip !== undefined) updateData.zip = zip
  if (latitude !== undefined) updateData.latitude = latitude
  if (longitude !== undefined) updateData.longitude = longitude
  if (day_of_week !== undefined) updateData.day_of_week = parseInt(day_of_week)
  if (start_time !== undefined) updateData.start_time = start_time
  if (end_time !== undefined) updateData.end_time = end_time
  if (season_start !== undefined) updateData.season_start = season_start || null
  if (season_end !== undefined) updateData.season_end = season_end || null
  if (status !== undefined) updateData.status = status
  if (approval_status !== undefined) updateData.approval_status = approval_status
  if (rejection_reason !== undefined) updateData.rejection_reason = rejection_reason

  const { data: market, error: updateError } = await supabase
    .from('markets')
    .update(updateData)
    .eq('id', marketId)
    .eq('market_type', 'traditional') // Only allow updating traditional markets
    .select()
    .single()

  if (updateError) {
    console.error('Error updating market:', updateError)
    return NextResponse.json({ error: 'Failed to update market' }, { status: 500 })
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
      error: 'Cannot delete market with active listings'
    }, { status: 400 })
  }

  // Delete market
  const { error: deleteError } = await supabase
    .from('markets')
    .delete()
    .eq('id', marketId)
    .eq('market_type', 'traditional') // Only allow deleting traditional markets

  if (deleteError) {
    console.error('Error deleting market:', deleteError)
    return NextResponse.json({ error: 'Failed to delete market' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
