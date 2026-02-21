import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { hasAdminRole } from '@/lib/auth/admin'

// PATCH /api/markets/[id]/schedules/[scheduleId] - Update schedule (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  return withErrorTracing('/api/markets/[id]/schedules/[scheduleId]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`market-schedule-patch:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: marketId, scheduleId } = await params

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

    const isAdmin = hasAdminRole(userProfile || {})
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const allowedFields = ['day_of_week', 'start_time', 'end_time', 'active']

    // Filter to only allowed fields
    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Validate day_of_week if provided
    if (updateData.day_of_week !== undefined) {
      const dow = updateData.day_of_week as number
      if (typeof dow !== 'number' || dow < 0 || dow > 6) {
        return NextResponse.json(
          { error: 'day_of_week must be between 0 (Sunday) and 6 (Saturday)' },
          { status: 400 }
        )
      }
    }

    // Validate time format if provided
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/
    if (updateData.start_time && !timeRegex.test(updateData.start_time as string)) {
      return NextResponse.json(
        { error: 'Invalid start_time format. Use HH:MM or HH:MM:SS' },
        { status: 400 }
      )
    }
    if (updateData.end_time && !timeRegex.test(updateData.end_time as string)) {
      return NextResponse.json(
        { error: 'Invalid end_time format. Use HH:MM or HH:MM:SS' },
        { status: 400 }
      )
    }

    // M3 FIX: Block deactivation if active orders reference this schedule
    if (updateData.active === false) {
      const { count } = await supabase
        .from('order_items')
        .select('id', { count: 'exact', head: true })
        .eq('schedule_id', scheduleId)
        .in('status', ['pending', 'confirmed', 'ready'])

      if (count && count > 0) {
        return NextResponse.json(
          { error: `Cannot deactivate schedule: ${count} active order${count === 1 ? '' : 's'} use this schedule. Complete or cancel them first.` },
          { status: 409 }
        )
      }
    }

    // Update schedule
    const { data: schedule, error } = await supabase
      .from('market_schedules')
      .update(updateData)
      .eq('id', scheduleId)
      .eq('market_id', marketId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ schedule })
  })
}

// DELETE /api/markets/[id]/schedules/[scheduleId] - Delete schedule (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  return withErrorTracing('/api/markets/[id]/schedules/[scheduleId]', 'DELETE', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`market-schedule-delete:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: marketId, scheduleId } = await params

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

    const isAdmin = hasAdminRole(userProfile || {})
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // M3 FIX: Block deletion if any orders have ever used this schedule
    const { count } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('schedule_id', scheduleId)
      .in('status', ['pending', 'confirmed', 'ready'])

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete schedule: ${count} active order${count === 1 ? '' : 's'} reference this schedule. Deactivate it instead after completing or cancelling orders.` },
        { status: 409 }
      )
    }

    // Delete schedule
    const { error } = await supabase
      .from('market_schedules')
      .delete()
      .eq('id', scheduleId)
      .eq('market_id', marketId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Schedule deleted' })
  })
}
