import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { validateBoothInventoryInput, type BoothInventoryRow } from '@/lib/markets/booth-types'

/**
 * GET /api/market-manager/[marketId]/booth-inventory
 *
 * Lists booth size tiers for this market (rows from
 * market_booth_inventory table). Used by manager dashboard.
 *
 * POST /api/market-manager/[marketId]/booth-inventory
 *
 * Adds a new size tier. Body must validate per
 * validateBoothInventoryInput(). Conflict on (market_id, size_label)
 * unique constraint returns 409.
 *
 * Auth: caller must be the assigned manager of the market.
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/booth-inventory', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'market_booth_inventory')
    const { data, error } = await serviceClient
      .from('market_booth_inventory')
      .select('*')
      .eq('market_id', marketId)
      .order('size_label', { ascending: true })

    if (error) {
      throw traced.fromSupabase(error, {
        table: 'market_booth_inventory',
        operation: 'select',
      })
    }

    return NextResponse.json({ inventory: (data || []) as BoothInventoryRow[] })
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/booth-inventory', 'POST', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const input = {
      size_label: typeof body?.size_label === 'string' ? body.size_label.trim() : '',
      dimensions:
        typeof body?.dimensions === 'string' && body.dimensions.trim().length > 0
          ? body.dimensions.trim()
          : null,
      count: Number(body?.count),
      weekly_price_cents: Number(body?.weekly_price_cents),
    }

    const validationError = validateBoothInventoryInput(input)
    if (validationError) {
      throw traced.validation('ERR_VALIDATION_001', validationError)
    }

    const serviceClient = createServiceClient()

    crumb.supabase('insert', 'market_booth_inventory')
    const { data, error } = await serviceClient
      .from('market_booth_inventory')
      .insert({
        market_id: marketId,
        size_label: input.size_label,
        dimensions: input.dimensions,
        count: input.count,
        weekly_price_cents: input.weekly_price_cents,
      })
      .select('*')
      .single()

    if (error) {
      // Postgres unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A "${input.size_label}" tier already exists for this market. Edit it instead of adding a duplicate.` },
          { status: 409 }
        )
      }
      throw traced.fromSupabase(error, {
        table: 'market_booth_inventory',
        operation: 'insert',
      })
    }

    return NextResponse.json({ row: data as BoothInventoryRow }, { status: 201 })
  })
}
