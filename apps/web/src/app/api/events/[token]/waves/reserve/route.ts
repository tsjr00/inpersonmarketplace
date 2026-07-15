import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, logError } from '@/lib/errors'
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

    // EVT-8 FIX: lazy-free expired reservations at this event before reserving.
    // reserve_event_wave stamps expires_at (+10 min, mig 120) but nothing ever
    // enforced it — an abandoned 'reserved' row held reserved_count forever AND
    // permanently blocked its user from re-reserving (the one-per-event check
    // counts every non-cancelled row). Freeing here fixes the caller's own
    // stale row at the exact moment they retry; cron Phase 13.5 is the global
    // backstop. cancel_wave_reservation row-locks the wave, re-checks
    // status='reserved' (safe against a completing order), and reopens full
    // waves — failures are non-fatal (the reserve RPC just reports full).
    const { data: staleReservations } = await serviceClient
      .from('event_wave_reservations')
      .select('id, user_id')
      .eq('market_id', event.market_id)
      .eq('status', 'reserved')
      .lt('expires_at', new Date().toISOString())
    for (const stale of staleReservations || []) {
      await serviceClient.rpc('cancel_wave_reservation', {
        p_reservation_id: stale.id,
        p_user_id: stale.user_id,
      })
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
      // Must reach error_logs — a failing reservation RPC blocks event ordering
      await logError(traced.fromSupabase(error, { table: 'event_wave_reservations', operation: 'rpc' }))
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
      // Must reach error_logs — a failing cancel RPC strands the user's slot
      await logError(traced.fromSupabase(error, { table: 'event_wave_reservations', operation: 'rpc' }))
      return NextResponse.json({ error: 'Failed to cancel reservation' }, { status: 500 })
    }

    const result = data as { success: boolean; error: string | null }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  })
}
