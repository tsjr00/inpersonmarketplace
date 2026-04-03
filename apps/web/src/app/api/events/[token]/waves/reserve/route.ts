import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ token: string }>
}

// POST - Reserve a wave slot
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/waves/reserve', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`wave-reserve:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    // Auth required
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Sign in to reserve a time slot' }, { status: 401 })
    }

    const { token } = await context.params
    const { wave_id } = await request.json()

    if (!wave_id) {
      return NextResponse.json({ error: 'wave_id is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Look up market_id from token
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('market_id, status')
      .eq('event_token', token)
      .in('status', ['approved', 'ready', 'active'])
      .single()

    if (!event?.market_id) {
      return NextResponse.json({ error: 'Event not found or not accepting orders' }, { status: 404 })
    }

    // Call the atomic reservation RPC
    const { data, error } = await serviceClient
      .rpc('reserve_event_wave', {
        p_wave_id: wave_id,
        p_market_id: event.market_id,
        p_user_id: user.id,
      })
      .single()

    if (error) {
      console.error('[wave-reserve] RPC error:', error)
      return NextResponse.json({ error: 'Failed to reserve time slot' }, { status: 500 })
    }

    const result = data as { success: boolean; reservation_id: string | null; error: string | null }

    if (!result.success) {
      const status = result.error?.includes('already have') ? 409 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({
      ok: true,
      reservation_id: result.reservation_id,
    })
  })
}

// DELETE - Cancel a wave reservation
export async function DELETE(request: NextRequest, _context: RouteContext) {
  return withErrorTracing('/api/events/[token]/waves/reserve', 'DELETE', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`wave-reserve:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    // Auth required
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { reservation_id } = await request.json()

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Call the atomic cancellation RPC
    const { data, error } = await serviceClient
      .rpc('cancel_wave_reservation', {
        p_reservation_id: reservation_id,
        p_user_id: user.id,
      })
      .single()

    if (error) {
      console.error('[wave-cancel] RPC error:', error)
      return NextResponse.json({ error: 'Failed to cancel reservation' }, { status: 500 })
    }

    const result = data as { success: boolean; error: string | null }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  })
}
