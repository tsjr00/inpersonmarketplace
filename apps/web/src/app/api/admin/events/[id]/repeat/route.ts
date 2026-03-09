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

// POST - Create a repeat event from an existing catering request
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/[id]/repeat', 'POST', async () => {
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
    const { event_date, event_end_date, event_start_time, event_end_time } = body

    if (!event_date) {
      return NextResponse.json(
        { error: 'Event date is required' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    // Fetch original catering request
    const { data: original, error: fetchError } = await serviceClient
      .from('catering_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !original) {
      return NextResponse.json(
        { error: 'Original request not found' },
        { status: 404 }
      )
    }

    // Create new catering request copying company/location/preferences
    const { data: newRequest, error: insertError } = await serviceClient
      .from('catering_requests')
      .insert({
        vertical_id: original.vertical_id,
        status: 'new',
        company_name: original.company_name,
        contact_name: original.contact_name,
        contact_email: original.contact_email,
        contact_phone: original.contact_phone,
        event_date,
        event_end_date: event_end_date || null,
        event_start_time: event_start_time || original.event_start_time,
        event_end_time: event_end_time || original.event_end_time,
        headcount: original.headcount,
        address: original.address,
        city: original.city,
        state: original.state,
        zip: original.zip,
        cuisine_preferences: original.cuisine_preferences,
        dietary_notes: original.dietary_notes,
        budget_notes: original.budget_notes,
        vendor_count: original.vendor_count,
        setup_instructions: original.setup_instructions,
        additional_notes: original.additional_notes,
        admin_notes: `Repeated from request ${original.id}`,
      })
      .select('*')
      .single()

    if (insertError || !newRequest) {
      console.error('[admin/catering/repeat] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to create repeat request' },
        { status: 500 }
      )
    }

    return NextResponse.json({ request: newRequest })
  })
}
