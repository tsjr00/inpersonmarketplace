import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

interface RouteContext {
  params: Promise<{ id: string }>
}

// PATCH - Update catering request status (approve → auto-creates event market)
export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/catering/[id]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(
      `admin:${clientIp}`,
      rateLimits.admin
    )
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { id } = await context.params
    const body = await request.json()
    const { status, admin_notes } = body

    const validStatuses = [
      'new',
      'reviewing',
      'approved',
      'declined',
      'cancelled',
      'completed',
    ]
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    // Fetch current request
    const { data: cateringReq, error: fetchError } = await serviceClient
      .from('catering_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !cateringReq) {
      return NextResponse.json(
        { error: 'Catering request not found' },
        { status: 404 }
      )
    }

    // Build update object
    const updates: Record<string, unknown> = {}
    if (status) updates.status = status
    if (admin_notes !== undefined) updates.admin_notes = admin_notes

    // On APPROVE: auto-create an event market from the request data
    if (status === 'approved' && cateringReq.status !== 'approved') {
      // Create event market
      const eventName = `${cateringReq.company_name} Catering Event`
      const { data: market, error: marketError } = await serviceClient
        .from('markets')
        .insert({
          vertical_id: cateringReq.vertical_id,
          vendor_profile_id: null,
          name: eventName,
          market_type: 'event',
          address: cateringReq.address,
          city: cateringReq.city,
          state: cateringReq.state,
          zip: cateringReq.zip,
          event_start_date: cateringReq.event_date,
          event_end_date:
            cateringReq.event_end_date || cateringReq.event_date,
          cutoff_hours: 48,
          status: 'active',
          active: true,
          approval_status: 'approved',
          catering_request_id: cateringReq.id,
          headcount: cateringReq.headcount,
        })
        .select('id')
        .single()

      if (marketError) {
        console.error(
          '[admin/catering] Failed to create event market:',
          marketError
        )
        return NextResponse.json(
          { error: 'Failed to create event market' },
          { status: 500 }
        )
      }

      // Create a schedule entry for the event day
      const eventDate = new Date(cateringReq.event_date + 'T00:00:00')
      const dayOfWeek = eventDate.getUTCDay()

      await serviceClient.from('market_schedules').insert({
        market_id: market.id,
        day_of_week: dayOfWeek,
        start_time: cateringReq.event_start_time || '11:00:00',
        end_time: cateringReq.event_end_time || '14:00:00',
        active: true,
      })

      // Link catering request to the created market
      updates.market_id = market.id
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      )
    }

    const { data: updated, error: updateError } = await serviceClient
      .from('catering_requests')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) {
      console.error('[admin/catering] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update catering request' },
        { status: 500 }
      )
    }

    return NextResponse.json({ request: updated })
  })
}
