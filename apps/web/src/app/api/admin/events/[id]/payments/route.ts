import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/admin/events/[id]/payments
 * List company payments for an event.
 *
 * POST /api/admin/events/[id]/payments
 * Record a new company payment (deposit or final settlement).
 *
 * PATCH /api/admin/events/[id]/payments
 * Update payment status (e.g., mark as paid or refunded).
 */

export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/[id]/payments', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin-event-payments:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()
    if (!profile || !hasAdminRole(profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await context.params
    const serviceClient = createServiceClient()

    // Get catering request to find market_id
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('market_id, company_name')
      .eq('id', id)
      .single()

    if (!event?.market_id) {
      return NextResponse.json({ error: 'Event not found or not yet approved' }, { status: 404 })
    }

    const { data: payments, error } = await serviceClient
      .from('event_company_payments')
      .select('id, payment_type, amount_cents, payment_method, stripe_payment_intent_id, status, notes, paid_at, created_at')
      .eq('market_id', event.market_id)
      .order('created_at')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payments: payments || [], company_name: event.company_name })
  })
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/[id]/payments', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin-event-payments:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()
    if (!profile || !hasAdminRole(profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await context.params
    const body = await request.json()
    const { payment_type, amount_cents, payment_method, stripe_payment_intent_id, notes } = body

    // Validate required fields
    if (!payment_type || !amount_cents) {
      throw traced.validation('ERR_PAYMENT_001', 'payment_type and amount_cents are required')
    }

    const validTypes = ['deposit', 'final_settlement']
    if (!validTypes.includes(payment_type)) {
      throw traced.validation('ERR_PAYMENT_002', `payment_type must be one of: ${validTypes.join(', ')}`)
    }

    if (typeof amount_cents !== 'number' || amount_cents <= 0) {
      throw traced.validation('ERR_PAYMENT_003', 'amount_cents must be a positive integer')
    }

    const serviceClient = createServiceClient()

    // Get catering request to find market_id
    crumb.supabase('select', 'catering_requests')
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('market_id')
      .eq('id', id)
      .single()

    if (!event?.market_id) {
      return NextResponse.json({ error: 'Event not found or not yet approved' }, { status: 404 })
    }

    crumb.supabase('insert', 'event_company_payments')
    const { data: payment, error } = await serviceClient
      .from('event_company_payments')
      .insert({
        market_id: event.market_id,
        catering_request_id: id,
        payment_type,
        amount_cents,
        payment_method: payment_method || null,
        stripe_payment_intent_id: stripe_payment_intent_id || null,
        notes: notes || null,
        status: 'pending',
      })
      .select('id, payment_type, amount_cents, status, created_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payment })
  })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/[id]/payments', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin-event-payments:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()
    if (!profile || !hasAdminRole(profile)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await context.params // consume params
    const body = await request.json()
    const { payment_id, status, paid_at, notes } = body

    if (!payment_id || !status) {
      throw traced.validation('ERR_PAYMENT_004', 'payment_id and status are required')
    }

    const validStatuses = ['pending', 'paid', 'refunded']
    if (!validStatuses.includes(status)) {
      throw traced.validation('ERR_PAYMENT_005', `status must be one of: ${validStatuses.join(', ')}`)
    }

    const serviceClient = createServiceClient()

    const updateData: Record<string, unknown> = { status }
    if (status === 'paid') {
      updateData.paid_at = paid_at || new Date().toISOString()
    }
    if (notes !== undefined) {
      updateData.notes = notes
    }

    crumb.supabase('update', 'event_company_payments')
    const { data: updated, error } = await serviceClient
      .from('event_company_payments')
      .update(updateData)
      .eq('id', payment_id)
      .select('id, payment_type, amount_cents, status, paid_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!updated) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    return NextResponse.json({ payment: updated })
  })
}
