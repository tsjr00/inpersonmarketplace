import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * POST /api/vendor/markets/[id]/standing-reservation
 *
 * FT park-manager P4a — a food truck REQUESTS a recurring hold on a spot for a
 * day-of-week ("Spot A every Saturday"). Creates a `requested` row; the operator
 * approves it (manager route). Gates: FT paid park, spot active + in-market +
 * recurring_eligible, day is an operating day, not already held for that DOW.
 *
 * Body: { spot_id: string, day_of_week: number(0-6) }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/markets/[id]/standing-reservation', 'POST', async () => {
    const { id: marketId } = await params

    const rl = await checkRateLimit(`standing-req:${getClientIp(request)}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const body = await request.json().catch(() => ({}))
    const spotId = typeof body?.spot_id === 'string' ? body.spot_id : ''
    const dow = Number(body?.day_of_week)
    if (!spotId) return NextResponse.json({ error: 'spot_id is required', field: 'spot_id' }, { status: 400 })
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return NextResponse.json({ error: 'day_of_week must be 0–6', field: 'day_of_week' }, { status: 400 })
    }

    const { data: market } = await supabase
      .from('markets')
      .select('id, name, vertical_id, park_mode')
      .eq('id', marketId)
      .maybeSingle()
    if (!market) return NextResponse.json({ error: 'Park not found' }, { status: 404 })
    if (market.park_mode !== 'paid') {
      return NextResponse.json(
        { error: `${(market.name as string) || 'This park'} isn't taking paid spot bookings.` },
        { status: 409 }
      )
    }

    const { profile, error: profErr } = await getVendorProfileForVertical<{ id: string }>(
      supabase, user.id, market.vertical_id as string, 'id'
    )
    if (profErr || !profile) {
      return NextResponse.json({ error: profErr || 'Food truck profile not found' }, { status: 404 })
    }

    const service = createServiceClient()

    crumb.supabase('select', 'park_spots')
    const { data: spot } = await service
      .from('park_spots')
      .select('id, market_id, active, recurring_eligible')
      .eq('id', spotId)
      .maybeSingle()
    if (!spot || spot.market_id !== marketId) {
      return NextResponse.json({ error: 'Spot not found at this park', field: 'spot_id' }, { status: 404 })
    }
    if (spot.active !== true) {
      return NextResponse.json({ error: 'That spot is not available.', field: 'spot_id' }, { status: 409 })
    }
    if (spot.recurring_eligible !== true) {
      return NextResponse.json({ error: 'That spot is not eligible for recurring holds.', field: 'spot_id' }, { status: 409 })
    }

    // The DOW must be an operating day of the park.
    const { data: scheds } = await service
      .from('market_schedules')
      .select('day_of_week')
      .eq('market_id', marketId)
      .eq('active', true)
    const activeDows = new Set((scheds ?? []).map((s) => s.day_of_week as number))
    if (!activeDows.has(dow)) {
      return NextResponse.json({ error: "The park isn't open on that day.", field: 'day_of_week' }, { status: 400 })
    }

    crumb.supabase('insert', 'park_standing_reservations')
    const { data, error } = await service
      .from('park_standing_reservations')
      .insert({
        market_id: marketId,
        vendor_profile_id: profile.id,
        spot_id: spotId,
        day_of_week: dow,
        status: 'requested',
      })
      .select('id, spot_id, day_of_week, status')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'That spot is already held (or requested) for that day. Try another spot or day.', field: 'spot_id' },
          { status: 409 }
        )
      }
      throw traced.fromSupabase(error, { table: 'park_standing_reservations', operation: 'insert' })
    }

    return NextResponse.json({ row: data }, { status: 201 })
  })
}
