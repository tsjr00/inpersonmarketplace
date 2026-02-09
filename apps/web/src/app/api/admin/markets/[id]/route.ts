import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

// Verify if user is platform admin or vertical admin for the given vertical
async function verifyAdminAccess(supabase: SupabaseClient, userId: string, verticalId?: string): Promise<boolean> {
  // Check platform admin role
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', userId)
    .single()

  if (hasAdminRole(userProfile || {})) {
    return true
  }

  // If vertical is provided, check vertical admin
  if (verticalId) {
    const { data: verticalAdmin } = await supabase
      .from('vertical_admins')
      .select('id')
      .eq('user_id', userId)
      .eq('vertical_id', verticalId)
      .single()
    return !!verticalAdmin
  }

  return false
}

// PUT - Update market
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/markets/[id]', 'PUT', async () => {
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

    const { id: marketId } = await params
    const body = await request.json()
    const { name, address, city, state, zip, latitude, longitude, schedules, season_start, season_end, status, approval_status, rejection_reason } = body

    // Use service client to bypass RLS for admin operations
    const serviceClient = createServiceClient()

    // First, get the market to check its type and vertical
    const { data: existingMarket, error: fetchError } = await serviceClient
      .from('markets')
      .select('market_type, vertical_id')
      .eq('id', marketId)
      .single()

    if (fetchError || !existingMarket) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    // Verify admin access (platform admin or vertical admin for this market's vertical)
    if (!(await verifyAdminAccess(supabase, user.id, existingMarket.vertical_id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
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
      const { data: market, error: updateError } = await serviceClient
        .from('markets')
        .update({ status })
        .eq('id', marketId)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating market status:', updateError)
        return NextResponse.json({ error: 'Failed to update market' }, { status: 500 })
      }

      // Invalidate cached market pages
      revalidatePath('/[vertical]/markets', 'page')
      revalidatePath(`/[vertical]/markets/${marketId}`, 'page')

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

    // Update market fields if any (use service client for admin operations)
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await serviceClient
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

      // Delete existing schedules and insert new ones (use service client)
      const { error: deleteError } = await serviceClient
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

      const { error: insertError } = await serviceClient
        .from('market_schedules')
        .insert(scheduleInserts)

      if (insertError) {
        console.error('Error inserting schedules:', insertError)
        return NextResponse.json({ error: 'Failed to create schedules' }, { status: 500 })
      }
    }

    // Fetch the updated market with schedules (use service client)
    const { data: market, error: fetchUpdatedError } = await serviceClient
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

    // Invalidate cached market pages so changes appear immediately
    revalidatePath('/[vertical]/markets', 'page')
    revalidatePath(`/[vertical]/markets/${marketId}`, 'page')

    return NextResponse.json({ market })
  })
}

// DELETE - Delete market
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/markets/[id]', 'DELETE', async () => {
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

    const { id: marketId } = await params

    // Use service client to bypass RLS for admin operations
    const serviceClient = createServiceClient()

    // First fetch the market to get its vertical for admin check
    const { data: market, error: fetchError } = await serviceClient
      .from('markets')
      .select('vertical_id')
      .eq('id', marketId)
      .single()

    if (fetchError || !market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    // Verify admin access for this vertical
    if (!(await verifyAdminAccess(supabase, user.id, market.vertical_id))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Check if market has listings (use service client)
    const { data: listingMarkets, error: checkError } = await serviceClient
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
    const { error: deleteError } = await serviceClient
      .from('markets')
      .delete()
      .eq('id', marketId)

    if (deleteError) {
      console.error('Error deleting market:', deleteError)
      return NextResponse.json({ error: 'Failed to delete market' }, { status: 500 })
    }

    // Invalidate cached market pages so deletion is reflected immediately
    revalidatePath('/[vertical]/markets', 'page')

    return NextResponse.json({ success: true })
  })
}
