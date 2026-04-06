import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ token: string }>
}

/**
 * GET /api/events/[token]/details
 * Fetch current event details for the organizer's progressive form.
 *
 * PATCH /api/events/[token]/details
 * Organizer updates Stage 1 details (matching + logistics).
 * Auth: must be the organizer (organizer_user_id match or email match).
 * Only allows updates to detail fields — never status, market_id, or event_token.
 */

// Stage 1 detail fields: matching quality + logistics
const ALLOWED_FIELDS = [
  'cuisine_preferences',
  'dietary_notes',
  'preferred_vendor_categories',
  'total_food_budget_cents',
  'per_meal_budget_cents',
  'estimated_spend_per_attendee_cents',
  'expected_meal_count',
  'budget_notes',
  'beverages_provided',
  'dessert_provided',
  'competing_food_options',
  'setup_instructions',
  'additional_notes',
  'vendor_stay_policy',
  'estimated_dwell_hours',
  'is_themed',
  'theme_description',
  'children_present',
  'has_competing_vendors',
  'is_ticketed',
  'vendor_count',
]

// Statuses where organizer can still update details
const EDITABLE_STATUSES = ['new', 'reviewing', 'approved', 'ready']

export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/details', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-details:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token } = await context.params
    const serviceClient = createServiceClient()

    const { data: event } = await serviceClient
      .from('catering_requests')
      .select(`
        id, status, company_name, contact_name, contact_email,
        event_date, event_end_date, event_start_time, event_end_time,
        headcount, vendor_count, service_level, payment_model,
        cuisine_preferences, dietary_notes, preferred_vendor_categories,
        total_food_budget_cents, per_meal_budget_cents, estimated_spend_per_attendee_cents,
        expected_meal_count, budget_notes,
        beverages_provided, dessert_provided, competing_food_options,
        setup_instructions, additional_notes,
        vendor_stay_policy, estimated_dwell_hours,
        is_themed, theme_description, children_present, has_competing_vendors, is_ticketed
      `)
      .eq('event_token', token)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Verify organizer identity
    const isOrganizer = event.contact_email?.toLowerCase() === user.email?.toLowerCase()
    if (!isOrganizer) {
      return NextResponse.json({ error: 'Only the event organizer can view these details' }, { status: 403 })
    }

    return NextResponse.json({ event })
  })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/details', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-details:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token } = await context.params
    const body = await request.json()
    const serviceClient = createServiceClient()

    // Fetch event and verify organizer
    crumb.supabase('select', 'catering_requests')
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('id, status, organizer_user_id, contact_email')
      .eq('event_token', token)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Auth: organizer_user_id or email match
    const isOrganizerById = event.organizer_user_id === user.id
    const isOrganizerByEmail = event.contact_email?.toLowerCase() === user.email?.toLowerCase()
    if (!isOrganizerById && !isOrganizerByEmail) {
      return NextResponse.json({ error: 'Only the event organizer can update these details' }, { status: 403 })
    }

    // Status gate
    if (!EDITABLE_STATUSES.includes(event.status)) {
      return NextResponse.json(
        { error: `Event details cannot be updated in "${event.status}" status` },
        { status: 400 }
      )
    }

    // Filter to allowed fields only
    const updateData: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (key in body) {
        updateData[key] = body[key]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Validate specific fields
    if (updateData.vendor_count !== undefined) {
      const vc = updateData.vendor_count as number
      if (typeof vc !== 'number' || vc < 1 || vc > 20) {
        throw traced.validation('ERR_EVENT_DETAIL_001', 'vendor_count must be between 1 and 20')
      }
    }
    if (updateData.vendor_stay_policy !== undefined) {
      const valid = ['may_leave_when_sold_out', 'stay_full_event', 'vendor_discretion', null]
      if (!valid.includes(updateData.vendor_stay_policy as string | null)) {
        throw traced.validation('ERR_EVENT_DETAIL_002', 'Invalid vendor_stay_policy')
      }
    }

    // Also link organizer_user_id if not set
    if (!event.organizer_user_id && isOrganizerByEmail) {
      updateData.organizer_user_id = user.id
    }

    crumb.supabase('update', 'catering_requests')
    const { error } = await serviceClient
      .from('catering_requests')
      .update(updateData)
      .eq('id', event.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, updated: Object.keys(updateData) })
  })
}
