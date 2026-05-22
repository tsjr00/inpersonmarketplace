import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { validateBoothPlaceholderInput, type BoothPlaceholderRow } from '@/lib/markets/placeholder-types'

/**
 * GET /api/market-manager/[marketId]/booth-placeholders
 *   Returns the off-platform booth placeholders for this market, ordered
 *   by booth_number.
 *
 * POST /api/market-manager/[marketId]/booth-placeholders
 *   Creates a new placeholder. Body:
 *     { booth_number: string, inventory_id?: string | null, notes?: string | null }
 *
 *   Conflict on (market_id, booth_number) UNIQUE → 409.
 *   Cross-market inventory_id (caught by DB trigger) → 400.
 *
 * Auth: assigned manager of the market (dual-key via isMarketManager).
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
  return withErrorTracing('/api/market-manager/[marketId]/booth-placeholders', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'market_booth_placeholders')
    const { data, error } = await serviceClient
      .from('market_booth_placeholders')
      .select('*')
      .eq('market_id', marketId)
      .order('booth_number', { ascending: true })

    if (error) {
      throw traced.fromSupabase(error, {
        table: 'market_booth_placeholders',
        operation: 'select',
      })
    }

    return NextResponse.json({ placeholders: (data || []) as BoothPlaceholderRow[] })
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/booth-placeholders', 'POST', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const input = {
      booth_number: typeof body?.booth_number === 'string' ? body.booth_number.trim() : '',
      inventory_id:
        typeof body?.inventory_id === 'string' && body.inventory_id.trim().length > 0
          ? body.inventory_id.trim()
          : null,
      notes:
        typeof body?.notes === 'string' && body.notes.trim().length > 0
          ? body.notes.trim()
          : null,
    }

    const validationError = validateBoothPlaceholderInput(input)
    if (validationError) {
      throw traced.validation('ERR_VALIDATION_001', validationError)
    }
    // Mig 145 / feedback #4: tier selection is REQUIRED when adding a
    // placeholder. The system needs to know which size tier each
    // off-platform booth occupies for accurate per-tier capacity math
    // and for the occupancy grid view.
    if (!input.inventory_id) {
      throw traced.validation(
        'ERR_VALIDATION_002',
        'Booth size tier is required — pick the size this booth belongs to.'
      )
    }

    const serviceClient = createServiceClient()

    crumb.supabase('insert', 'market_booth_placeholders')
    const { data, error } = await serviceClient
      .from('market_booth_placeholders')
      .insert({
        market_id: marketId,
        booth_number: input.booth_number,
        inventory_id: input.inventory_id,
        notes: input.notes,
      })
      .select('*')
      .single()

    if (error) {
      // UNIQUE (market_id, booth_number) violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Booth "${input.booth_number}" already has a placeholder for this market.` },
          { status: 409 }
        )
      }
      // Cross-market inventory_id raised by trigger
      if (error.code === 'P0001' && error.message.includes('does not belong to market')) {
        return NextResponse.json(
          { error: 'Selected booth size tier does not belong to this market.' },
          { status: 400 }
        )
      }
      throw traced.fromSupabase(error, {
        table: 'market_booth_placeholders',
        operation: 'insert',
      })
    }

    return NextResponse.json({ row: data as BoothPlaceholderRow }, { status: 201 })
  })
}
