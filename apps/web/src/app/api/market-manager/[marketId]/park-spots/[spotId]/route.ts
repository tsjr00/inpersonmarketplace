import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { validateParkSpotInput, type ParkSpotInput, type ParkSpotRow, type SpotPower } from '@/lib/markets/park-spot-types'

/**
 * PATCH  /api/market-manager/[marketId]/park-spots/[spotId] — edit a spot.
 * DELETE /api/market-manager/[marketId]/park-spots/[spotId] — remove a spot.
 *
 * Both verify the spotId belongs to the marketId (guards id-spoofing across
 * parks). FT park-manager P1. Auth: assigned manager of the market only.
 */

async function authorize(
  marketId: string,
  spotId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) {
    return { ok: false, response: rateLimitResponse(rateLimitResult) }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 }),
    }
  }

  const serviceClient = createServiceClient()
  const { data: row } = await serviceClient
    .from('park_spots')
    .select('id, market_id')
    .eq('id', spotId)
    .maybeSingle()

  if (!row) {
    return { ok: false, response: NextResponse.json({ error: 'Spot not found' }, { status: 404 }) }
  }
  if (row.market_id !== marketId) {
    return { ok: false, response: NextResponse.json({ error: 'Spot not in this park' }, { status: 404 }) }
  }

  return { ok: true }
}

function parseSpotInput(body: Record<string, unknown>): ParkSpotInput {
  const rawLen = body?.max_length_ft
  const max_length_ft =
    rawLen === null || rawLen === undefined || rawLen === '' ? null : Number(rawLen)
  return {
    label: typeof body?.label === 'string' ? body.label.trim() : '',
    max_length_ft,
    power: (typeof body?.power === 'string' ? body.power : 'none') as SpotPower,
    has_water: body?.has_water === true,
    base_price_cents: Number(body?.base_price_cents),
    recurring_eligible: body?.recurring_eligible === true,
    active: body?.active === false ? false : true,
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; spotId: string }> }
) {
  return withErrorTracing(
    '/api/market-manager/[marketId]/park-spots/[spotId]',
    'PATCH',
    async () => {
      const { marketId, spotId } = await params
      const auth = await authorize(marketId, spotId, request)
      if (!auth.ok) return auth.response

      const body = await request.json().catch(() => ({}))
      const input = parseSpotInput(body)

      const validationError = validateParkSpotInput(input)
      if (validationError) {
        throw traced.validation('ERR_VALIDATION_001', validationError)
      }

      const serviceClient = createServiceClient()

      crumb.supabase('update', 'park_spots')
      const { data, error } = await serviceClient
        .from('park_spots')
        .update({
          label: input.label,
          max_length_ft: input.max_length_ft,
          power: input.power,
          has_water: input.has_water,
          base_price_cents: input.base_price_cents,
          recurring_eligible: input.recurring_eligible,
          active: input.active ?? true,
        })
        .eq('id', spotId)
        .select('*')
        .single()

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: `A spot labeled "${input.label}" already exists at this park.` },
            { status: 409 }
          )
        }
        throw traced.fromSupabase(error, { table: 'park_spots', operation: 'update' })
      }

      return NextResponse.json({ row: data as ParkSpotRow })
    }
  )
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; spotId: string }> }
) {
  return withErrorTracing(
    '/api/market-manager/[marketId]/park-spots/[spotId]',
    'DELETE',
    async () => {
      const { marketId, spotId } = await params
      const auth = await authorize(marketId, spotId, request)
      if (!auth.ok) return auth.response

      const serviceClient = createServiceClient()

      crumb.supabase('delete', 'park_spots')
      const { error } = await serviceClient
        .from('park_spots')
        .delete()
        .eq('id', spotId)

      if (error) {
        // Forward-compat: P2 park_spot_bookings.spot_id is ON DELETE RESTRICT,
        // so a spot with bookings will 23503 here. Friendly 409 instead of a
        // generic failure. (No bookings exist yet in P1.)
        if (error.code === '23503') {
          return NextResponse.json(
            { error: 'This spot has bookings. Deactivate it instead of deleting.' },
            { status: 409 }
          )
        }
        throw traced.fromSupabase(error, { table: 'park_spots', operation: 'delete' })
      }

      return NextResponse.json({ success: true })
    }
  )
}
