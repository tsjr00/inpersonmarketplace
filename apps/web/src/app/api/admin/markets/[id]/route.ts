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
  const { name, address, city, state, zip, latitude, longitude, day_of_week, start_time, end_time, status } = body

  const { data: market, error: updateError } = await supabase
    .from('markets')
    .update({
      name,
      address,
      city,
      state,
      zip,
      latitude: latitude !== undefined ? latitude : undefined,
      longitude: longitude !== undefined ? longitude : undefined,
      day_of_week: day_of_week !== undefined ? parseInt(day_of_week) : undefined,
      start_time,
      end_time,
      status
    })
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
