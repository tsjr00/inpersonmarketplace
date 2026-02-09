import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

// PATCH /api/markets/[id]/schedules/[scheduleId] - Update schedule (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scheduleId: string }> }
) {
  return withErrorTracing('/api/markets/[id]/schedules/[scheduleId]', 'PATCH', async () => {
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

    const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
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

    const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
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
