import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * GET   /api/market-manager/[marketId]/standing-reservations
 *   → the park's standing (recurring) reservations (requested + active), with
 *     truck name + spot label + day-of-week.
 * PATCH /api/market-manager/[marketId]/standing-reservations
 *   Body { reservation_id, action: 'approve' | 'revoke' | 'reinstate' }
 *   approve: requested → active (+ approved_by/at); revoke: → revoked;
 *   reinstate: revoked/suspended → active. Manager authority always (P4a).
 *
 * FT park-manager P4a. Auth: assigned manager of the market only.
 */

async function authorize(marketId: string, request: NextRequest) {
  const rl = await checkRateLimit(`mm:${getClientIp(request)}`, rateLimits.api)
  if (!rl.success) return { ok: false as const, response: rateLimitResponse(rl) }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
  if (!(await isMarketManager(supabase, marketId, user))) {
    return { ok: false as const, response: NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 }) }
  }
  return { ok: true as const, userId: user.id }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/standing-reservations', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const service = createServiceClient()
    crumb.supabase('select', 'park_standing_reservations')
    const { data, error } = await service
      .from('park_standing_reservations')
      .select(`
        id, day_of_week, status, approved_at,
        park_spots:spot_id ( label ),
        vendor_profiles:vendor_profile_id ( profile_data )
      `)
      .eq('market_id', marketId)
      .in('status', ['requested', 'active'])
      .order('status', { ascending: true })

    if (error) throw traced.fromSupabase(error, { table: 'park_standing_reservations', operation: 'select' })

    const reservations = (data ?? []).map((r) => {
      const vp = r.vendor_profiles as unknown as { profile_data: Record<string, unknown> | null } | null
      const pd = vp?.profile_data ?? null
      const spot = r.park_spots as unknown as { label: string } | null
      return {
        id: r.id as string,
        dayOfWeek: r.day_of_week as number,
        status: r.status as string,
        approvedAt: (r.approved_at as string | null) ?? null,
        spotLabel: spot?.label ?? null,
        truckName: (pd?.business_name as string) || (pd?.farm_name as string) || 'Food truck',
      }
    })

    return NextResponse.json({ reservations })
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/standing-reservations', 'PATCH', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const reservationId = typeof body?.reservation_id === 'string' ? body.reservation_id : ''
    const action = body?.action as string | undefined
    if (!reservationId) return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 })
    if (action !== 'approve' && action !== 'revoke' && action !== 'reinstate') {
      return NextResponse.json({ error: 'action must be approve, revoke, or reinstate' }, { status: 400 })
    }

    const service = createServiceClient()

    // Verify the reservation belongs to this market (guards id-spoofing).
    const { data: existing } = await service
      .from('park_standing_reservations')
      .select('id, market_id, status')
      .eq('id', reservationId)
      .maybeSingle()
    if (!existing || existing.market_id !== marketId) {
      return NextResponse.json({ error: 'Standing reservation not found at this park' }, { status: 404 })
    }

    const update =
      action === 'approve'
        ? { status: 'active', approved_by: auth.userId, approved_at: new Date().toISOString() }
        : action === 'revoke'
          ? { status: 'revoked' }
          : { status: 'active' } // reinstate

    crumb.supabase('update', 'park_standing_reservations')
    const { data, error } = await service
      .from('park_standing_reservations')
      .update(update)
      .eq('id', reservationId)
      .select('id, status')
      .single()

    if (error) {
      // reinstate/approve can hit the partial-unique index if another holder
      // took that (spot, day_of_week) meanwhile.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'That spot + day already has an active holder. Revoke that one first.' },
          { status: 409 }
        )
      }
      throw traced.fromSupabase(error, { table: 'park_standing_reservations', operation: 'update' })
    }

    return NextResponse.json({ row: data })
  })
}
