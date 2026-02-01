import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Get vendor's schedule attendance for a market
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id: marketId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Get all schedules for this market with vendor's attendance status
    const { data: schedules, error: schedulesError } = await supabase
      .from('market_schedules')
      .select(`
        id,
        day_of_week,
        start_time,
        end_time,
        active
      `)
      .eq('market_id', marketId)
      .eq('active', true)
      .order('day_of_week')

    if (schedulesError) {
      console.error('[/api/vendor/markets/[id]/schedules] Error fetching schedules:', schedulesError)
      return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
    }

    // Get vendor's schedule attendance
    const { data: vendorSchedules, error: vsError } = await supabase
      .from('vendor_market_schedules')
      .select('schedule_id, is_active')
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('market_id', marketId)

    if (vsError) {
      console.error('[/api/vendor/markets/[id]/schedules] Error fetching vendor schedules:', vsError)
      return NextResponse.json({ error: 'Failed to fetch vendor schedules' }, { status: 500 })
    }

    // Create a map of schedule attendance
    const attendanceMap = new Map(
      vendorSchedules?.map(vs => [vs.schedule_id, vs.is_active]) || []
    )

    // Combine schedules with attendance status
    const schedulesWithAttendance = schedules?.map(schedule => ({
      ...schedule,
      is_attending: attendanceMap.get(schedule.id) ?? false
    })) || []

    return NextResponse.json({
      schedules: schedulesWithAttendance,
      hasAnyActive: schedulesWithAttendance.some(s => s.is_attending)
    })
  } catch (error) {
    console.error('[/api/vendor/markets/[id]/schedules] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update vendor's schedule attendance (bulk update)
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id: marketId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { scheduleIds } = body // Array of schedule IDs the vendor will attend

    if (!Array.isArray(scheduleIds)) {
      return NextResponse.json({ error: 'scheduleIds must be an array' }, { status: 400 })
    }

    // Get vendor profile
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Verify market exists and is a traditional market (not private pickup)
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('id, market_type, status')
      .eq('id', marketId)
      .single()

    if (marketError || !market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    if (market.market_type !== 'traditional') {
      return NextResponse.json({ error: 'Schedule management is only for traditional markets' }, { status: 400 })
    }

    if (market.status !== 'active') {
      return NextResponse.json({ error: 'This market is not currently active' }, { status: 400 })
    }

    // Get all active schedules for validation
    const { data: activeSchedules, error: asError } = await supabase
      .from('market_schedules')
      .select('id')
      .eq('market_id', marketId)
      .eq('active', true)

    if (asError) {
      console.error('[/api/vendor/markets/[id]/schedules] Error fetching active schedules:', asError)
      return NextResponse.json({ error: 'Failed to validate schedules' }, { status: 500 })
    }

    const validScheduleIds = new Set(activeSchedules?.map(s => s.id) || [])

    // Validate that all provided scheduleIds are valid
    for (const scheduleId of scheduleIds) {
      if (!validScheduleIds.has(scheduleId)) {
        return NextResponse.json({ error: `Invalid schedule ID: ${scheduleId}` }, { status: 400 })
      }
    }

    // First, deactivate all existing schedule entries for this vendor/market
    const { error: deactivateError } = await supabase
      .from('vendor_market_schedules')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('market_id', marketId)

    if (deactivateError) {
      console.error('[/api/vendor/markets/[id]/schedules] Error deactivating schedules:', deactivateError)
      return NextResponse.json({ error: 'Failed to update schedules' }, { status: 500 })
    }

    // Now upsert the selected schedules as active
    if (scheduleIds.length > 0) {
      const scheduleEntries = scheduleIds.map(scheduleId => ({
        vendor_profile_id: vendorProfile.id,
        market_id: marketId,
        schedule_id: scheduleId,
        is_active: true,
        updated_at: new Date().toISOString()
      }))

      const { error: upsertError } = await supabase
        .from('vendor_market_schedules')
        .upsert(scheduleEntries, {
          onConflict: 'vendor_profile_id,schedule_id',
          ignoreDuplicates: false
        })

      if (upsertError) {
        console.error('[/api/vendor/markets/[id]/schedules] Error upserting schedules:', upsertError)
        return NextResponse.json({ error: 'Failed to update schedules' }, { status: 500 })
      }
    }

    // Return warning if no schedules selected
    const hasAnyActive = scheduleIds.length > 0

    return NextResponse.json({
      success: true,
      hasAnyActive,
      warning: !hasAnyActive
        ? 'No schedules selected. Your listings will not appear for this market.'
        : null
    })
  } catch (error) {
    console.error('[/api/vendor/markets/[id]/schedules] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Toggle a single schedule
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id: marketId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { scheduleId, isActive } = body

    if (!scheduleId || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'scheduleId and isActive are required' }, { status: 400 })
    }

    // Get vendor profile
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Verify market exists and is a traditional market
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('id, market_type, status')
      .eq('id', marketId)
      .single()

    if (marketError || !market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    if (market.market_type !== 'traditional') {
      return NextResponse.json({ error: 'Schedule management is only for traditional markets' }, { status: 400 })
    }

    if (market.status !== 'active') {
      return NextResponse.json({ error: 'This market is not currently active' }, { status: 400 })
    }

    // Verify schedule exists and belongs to this market
    const { data: schedule, error: scheduleError } = await supabase
      .from('market_schedules')
      .select('id, market_id')
      .eq('id', scheduleId)
      .eq('market_id', marketId)
      .single()

    if (scheduleError || !schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    // Upsert the vendor schedule entry
    const { error: upsertError } = await supabase
      .from('vendor_market_schedules')
      .upsert({
        vendor_profile_id: vendorProfile.id,
        market_id: marketId,
        schedule_id: scheduleId,
        is_active: isActive,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'vendor_profile_id,schedule_id'
      })

    if (upsertError) {
      console.error('[/api/vendor/markets/[id]/schedules] Error toggling schedule:', upsertError)
      return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 })
    }

    // Check if vendor has any active schedules
    const { data: hasActive } = await supabase
      .rpc('vendor_has_active_schedules', {
        p_vendor_profile_id: vendorProfile.id,
        p_market_id: marketId
      })

    return NextResponse.json({
      success: true,
      scheduleId,
      isActive,
      hasAnyActive: hasActive,
      warning: !hasActive
        ? 'No schedules selected. Your listings will not appear for this market.'
        : null
    })
  } catch (error) {
    console.error('[/api/vendor/markets/[id]/schedules] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
