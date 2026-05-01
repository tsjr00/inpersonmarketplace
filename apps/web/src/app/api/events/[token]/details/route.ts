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

// Stage 2 detail fields: matching quality + logistics + corrections to Stage 1 entries
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
  // Stage 2 — corrections to Stage 1 entries + fields hidden from Stage 1
  'event_type',
  'event_start_time',
  'event_end_time',
  'event_end_date',
  'event_setting',
  'address',
  'is_recurring',
  'recurring_frequency',
  'company_max_per_attendee_cents',
  'contact_phone',
]

// Fields that, when changed, may produce different vendor matches.
// PATCH response sets `matchingChanged: true` so the dashboard can surface a
// "Refresh matches" banner. Non-matching fields (notes, budget, etc.) save silently.
const MATCHING_AFFECTING_FIELDS = new Set([
  'event_type',
  'event_start_time',
  'event_end_time',
  'event_setting',
  'children_present',
  'preferred_vendor_categories',
  'cuisine_preferences',
  'expected_meal_count',
  'vendor_count',
])

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
        id, status, company_name, contact_name, contact_email, contact_phone,
        event_type, event_setting,
        event_date, event_end_date, event_start_time, event_end_time,
        headcount, vendor_count, service_level, payment_model,
        access_code, company_max_per_attendee_cents,
        address, city, state, zip,
        cuisine_preferences, dietary_notes, preferred_vendor_categories,
        total_food_budget_cents, per_meal_budget_cents, estimated_spend_per_attendee_cents,
        expected_meal_count, budget_notes,
        beverages_provided, dessert_provided, competing_food_options,
        setup_instructions, additional_notes,
        vendor_stay_policy, estimated_dwell_hours,
        is_themed, theme_description, children_present, has_competing_vendors, is_ticketed,
        is_recurring, recurring_frequency
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
    if (updateData.event_type !== undefined && updateData.event_type !== null) {
      const valid = ['corporate_lunch', 'team_building', 'grand_opening', 'festival', 'private_party', 'other']
      if (!valid.includes(updateData.event_type as string)) {
        throw traced.validation('ERR_EVENT_DETAIL_003', 'Invalid event_type')
      }
    }
    if (updateData.event_setting !== undefined && updateData.event_setting !== null) {
      const valid = ['indoor', 'outdoor', 'either']
      if (!valid.includes(updateData.event_setting as string)) {
        throw traced.validation('ERR_EVENT_DETAIL_004', 'Invalid event_setting')
      }
    }
    if (updateData.recurring_frequency !== undefined && updateData.recurring_frequency !== null) {
      const valid = ['weekly', 'biweekly', 'monthly', 'quarterly']
      if (!valid.includes(updateData.recurring_frequency as string)) {
        throw traced.validation('ERR_EVENT_DETAIL_005', 'Invalid recurring_frequency')
      }
    }
    // If both times provided in this update OR being changed alongside an existing time, validate end > start
    if (updateData.event_start_time !== undefined || updateData.event_end_time !== undefined) {
      // Need current values for cross-field validation
      const { data: current } = await serviceClient
        .from('catering_requests')
        .select('event_start_time, event_end_time')
        .eq('id', event.id)
        .single()
      const newStart = (updateData.event_start_time ?? current?.event_start_time) as string | null
      const newEnd = (updateData.event_end_time ?? current?.event_end_time) as string | null
      if (newStart && newEnd) {
        const sParts = String(newStart).split(':').map(Number)
        const eParts = String(newEnd).split(':').map(Number)
        if (sParts.length >= 2 && eParts.length >= 2 && !sParts.some(isNaN) && !eParts.some(isNaN)) {
          if (eParts[0] * 60 + eParts[1] <= sParts[0] * 60 + sParts[1]) {
            throw traced.validation('ERR_EVENT_DETAIL_006', 'event_end_time must be after event_start_time')
          }
        }
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

    // Tell the caller whether their changes affected vendor matching, so the
    // dashboard can offer a "Refresh matches" banner. Notes-only edits won't
    // produce a banner; type/time/categories changes will.
    const matchingChanged = Object.keys(updateData).some(k => MATCHING_AFFECTING_FIELDS.has(k))

    return NextResponse.json({ ok: true, updated: Object.keys(updateData), matchingChanged })
  })
}
