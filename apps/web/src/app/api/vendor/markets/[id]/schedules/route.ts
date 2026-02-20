import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Get vendor's schedule attendance for a market
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorTracing('/api/vendor/markets/[id]/schedules', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-market-schedules-get:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

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

      // Get vendor's schedule attendance (including vendor-specific times)
      const { data: vendorSchedules, error: vsError } = await supabase
        .from('vendor_market_schedules')
        .select('schedule_id, is_active, vendor_start_time, vendor_end_time')
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('market_id', marketId)

      if (vsError) {
        console.error('[/api/vendor/markets/[id]/schedules] Error fetching vendor schedules:', vsError)
        return NextResponse.json({ error: 'Failed to fetch vendor schedules' }, { status: 500 })
      }

      // Create a map of schedule attendance + vendor times
      const attendanceMap = new Map(
        vendorSchedules?.map(vs => [vs.schedule_id, {
          is_active: vs.is_active,
          vendor_start_time: vs.vendor_start_time,
          vendor_end_time: vs.vendor_end_time
        }]) || []
      )

      // Combine schedules with attendance status and vendor times
      const schedulesWithAttendance = schedules?.map(schedule => {
        const attendance = attendanceMap.get(schedule.id)
        return {
          ...schedule,
          is_attending: attendance?.is_active ?? false,
          vendor_start_time: attendance?.vendor_start_time ?? null,
          vendor_end_time: attendance?.vendor_end_time ?? null,
          market_start_time: schedule.start_time,
          market_end_time: schedule.end_time
        }
      }) || []

      return NextResponse.json({
        schedules: schedulesWithAttendance,
        hasAnyActive: schedulesWithAttendance.some(s => s.is_attending)
      })
    } catch (error) {
      console.error('[/api/vendor/markets/[id]/schedules] Unexpected error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}

// PUT - Update vendor's schedule attendance (bulk update)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withErrorTracing('/api/vendor/markets/[id]/schedules', 'PUT', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-market-schedules-put:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

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

      if (market.market_type === 'private_pickup') {
        return NextResponse.json({ error: 'Schedule management is not available for private pickup locations' }, { status: 400 })
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

      // Phase 6: Check for pending orders on schedules being deactivated
      // Get currently active schedules for this vendor
      const { data: currentlyActive, error: caError } = await supabase
        .from('vendor_market_schedules')
        .select('schedule_id')
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('market_id', marketId)
        .eq('is_active', true)

      if (caError) {
        console.error('[/api/vendor/markets/[id]/schedules] Error fetching current schedules:', caError)
        return NextResponse.json({ error: 'Failed to check current schedules' }, { status: 500 })
      }

      // Find schedules being deactivated (currently active but not in new selection)
      const newScheduleSet = new Set(scheduleIds)
      const schedulesBeingDeactivated = (currentlyActive || [])
        .filter(s => !newScheduleSet.has(s.schedule_id))
        .map(s => s.schedule_id)

      // Check if any deactivated schedules have pending orders
      if (schedulesBeingDeactivated.length > 0) {
        const { data: pendingOrders, error: poError } = await supabase
          .from('order_items')
          .select('schedule_id')
          .eq('vendor_profile_id', vendorProfile.id)
          .in('schedule_id', schedulesBeingDeactivated)
          .not('status', 'in', '("fulfilled","cancelled")')
          .is('cancelled_at', null)

        if (poError) {
          console.error('[/api/vendor/markets/[id]/schedules] Error checking pending orders:', poError)
          return NextResponse.json({ error: 'Failed to check pending orders' }, { status: 500 })
        }

        if (pendingOrders && pendingOrders.length > 0) {
          const affectedScheduleCount = new Set(pendingOrders.map(o => o.schedule_id)).size
          return NextResponse.json({
            error: `Cannot deactivate ${affectedScheduleCount} schedule${affectedScheduleCount !== 1 ? 's' : ''} with pending orders. Please fulfill or cancel pending orders first.`,
            code: 'ERR_SCHEDULE_HAS_ORDERS',
            pendingOrderCount: pendingOrders.length
          }, { status: 400 })
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
  })
}

// PATCH - Toggle a single schedule
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withErrorTracing('/api/vendor/markets/[id]/schedules', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-market-schedules-patch:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const { id: marketId } = await params
      const supabase = await createClient()

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const body = await request.json()
      const { scheduleId, isActive, startTime, endTime } = body

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

      if (market.market_type === 'private_pickup') {
        return NextResponse.json({ error: 'Schedule management is not available for private pickup locations' }, { status: 400 })
      }

      if (market.status !== 'active') {
        return NextResponse.json({ error: 'This market is not currently active' }, { status: 400 })
      }

      // Verify schedule exists and belongs to this market
      const { data: schedule, error: scheduleError } = await supabase
        .from('market_schedules')
        .select('id, market_id, start_time, end_time')
        .eq('id', scheduleId)
        .eq('market_id', marketId)
        .single()

      if (scheduleError || !schedule) {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
      }

      // Validate vendor-specific times if provided
      // Normalize to HH:MM:SS for comparison (input sends HH:MM, DB returns HH:MM:SS)
      const pad = (t: string) => t && t.length === 5 ? t + ':00' : t
      if (startTime || endTime) {
        const st = pad(startTime)
        const et = pad(endTime)
        const mst = pad(schedule.start_time)
        const met = pad(schedule.end_time)
        if (st && et && st >= et) {
          return NextResponse.json({ error: 'Start time must be before end time' }, { status: 400 })
        }
        if (st && mst && st < mst) {
          return NextResponse.json({ error: 'Vendor start time cannot be before market opens' }, { status: 400 })
        }
        if (et && met && et > met) {
          return NextResponse.json({ error: 'Vendor end time cannot be after market closes' }, { status: 400 })
        }
      }

      // Phase 6: Check for pending orders if trying to deactivate a schedule
      if (!isActive) {
        const { count: pendingOrderCount, error: orderCheckError } = await supabase
          .from('order_items')
          .select('id', { count: 'exact', head: true })
          .eq('schedule_id', scheduleId)
          .eq('vendor_profile_id', vendorProfile.id)
          .not('status', 'in', '("fulfilled","cancelled")')
          .is('cancelled_at', null)

        if (orderCheckError) {
          console.error('[/api/vendor/markets/[id]/schedules] Error checking pending orders:', orderCheckError)
          return NextResponse.json({ error: 'Failed to check pending orders' }, { status: 500 })
        }

        if (pendingOrderCount && pendingOrderCount > 0) {
          return NextResponse.json({
            error: `Cannot deactivate this schedule while ${pendingOrderCount} order${pendingOrderCount !== 1 ? 's are' : ' is'} pending. Please fulfill or cancel pending orders first.`,
            code: 'ERR_SCHEDULE_HAS_ORDERS',
            pendingOrderCount
          }, { status: 400 })
        }
      }

      // Build upsert data — include vendor times if provided, preserve existing if toggling off
      const upsertData: Record<string, unknown> = {
        vendor_profile_id: vendorProfile.id,
        market_id: marketId,
        schedule_id: scheduleId,
        is_active: isActive,
        updated_at: new Date().toISOString()
      }
      // Only update vendor times when explicitly provided (don't clear on toggle-off)
      if (startTime !== undefined) {
        upsertData.vendor_start_time = startTime || null
      }
      if (endTime !== undefined) {
        upsertData.vendor_end_time = endTime || null
      }

      const { error: upsertError } = await supabase
        .from('vendor_market_schedules')
        .upsert(upsertData, {
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
  })
}
