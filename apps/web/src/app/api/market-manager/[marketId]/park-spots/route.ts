import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { validateParkSpotInput, type ParkSpotInput, type ParkSpotRow, type SpotPower } from '@/lib/markets/park-spot-types'

/**
 * GET  /api/market-manager/[marketId]/park-spots — list a park's spots.
 * POST /api/market-manager/[marketId]/park-spots — add a spot. Conflict on
 *      (market_id, label) unique constraint returns 409.
 *
 * FT park-manager P1. Auth: assigned manager of the market only.
 */

async function authorize(
  marketId: string,
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

  return { ok: true }
}

/** Parse + normalize the raw request body into a ParkSpotInput. */
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/park-spots', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'park_spots')
    const { data, error } = await serviceClient
      .from('park_spots')
      .select('*')
      .eq('market_id', marketId)
      .order('label', { ascending: true })

    if (error) {
      throw traced.fromSupabase(error, { table: 'park_spots', operation: 'select' })
    }

    return NextResponse.json({ spots: (data || []) as ParkSpotRow[] })
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/park-spots', 'POST', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const input = parseSpotInput(body)

    const validationError = validateParkSpotInput(input)
    if (validationError) {
      throw traced.validation('ERR_VALIDATION_001', validationError)
    }

    const serviceClient = createServiceClient()

    crumb.supabase('insert', 'park_spots')
    const { data, error } = await serviceClient
      .from('park_spots')
      .insert({
        market_id: marketId,
        label: input.label,
        max_length_ft: input.max_length_ft,
        power: input.power,
        has_water: input.has_water,
        base_price_cents: input.base_price_cents,
        recurring_eligible: input.recurring_eligible,
        active: input.active ?? true,
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A spot labeled "${input.label}" already exists at this park. Edit it instead of adding a duplicate.` },
          { status: 409 }
        )
      }
      throw traced.fromSupabase(error, { table: 'park_spots', operation: 'insert' })
    }

    return NextResponse.json({ row: data as ParkSpotRow }, { status: 201 })
  })
}
