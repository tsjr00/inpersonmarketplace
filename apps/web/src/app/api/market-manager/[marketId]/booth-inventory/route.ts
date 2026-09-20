import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import {
  validateBoothInventoryInput, validateTierLabelsInput, labelsInputFromBody, labelColumnsFor,
  friendlyTierLabelError, type BoothInventoryRow, type BoothNumberingScheme,
} from '@/lib/markets/booth-types'

/**
 * GET /api/market-manager/[marketId]/booth-inventory
 *
 * Lists booth size tiers for this market (rows from
 * market_booth_inventory table, incl. the mig-258 label columns) plus the
 * market's booth_numbering_scheme. Used by manager dashboard.
 *
 * POST /api/market-manager/[marketId]/booth-inventory
 *
 * Adds a new size tier. Body must validate per
 * validateBoothInventoryInput(); `labels` (mig 258: {shape:'range',prefix,
 * start,end} | {shape:'list',labels[]} | null) is validated against the
 * market's scheme here for a friendly message and again by the DB trigger
 * (overlap / occupancy need the live rows). Conflict on (market_id,
 * size_label) unique constraint returns 409.
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

    // Mig 258: the scheme decides which numbering options the card offers.
    // Tolerant pre-migration (unknown column → null).
    const { data: mk } = await observed(serviceClient
      .from('markets')
      .select('booth_numbering_scheme')
      .eq('id', marketId)
      .maybeSingle(), { table: 'markets' })

    return NextResponse.json({
      inventory: (data || []) as BoothInventoryRow[],
      booth_numbering_scheme: ((mk?.booth_numbering_scheme as BoothNumberingScheme | null | undefined) ?? null),
    })
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
      labels: labelsInputFromBody(body),
    }

    const validationError = validateBoothInventoryInput(input)
    if (validationError) {
      throw traced.validation('ERR_VALIDATION_001', validationError)
    }

    const serviceClient = createServiceClient()

    // Mig 258: friendly pre-check of the labels against the market's scheme.
    if (input.labels) {
      const { data: mk } = await observed(serviceClient
        .from('markets')
        .select('booth_numbering_scheme')
        .eq('id', marketId)
        .maybeSingle(), { table: 'markets' })
      const labelsError = validateTierLabelsInput(input.labels, (mk?.booth_numbering_scheme as BoothNumberingScheme | null) ?? null)
      if (labelsError) throw traced.validation('ERR_VALIDATION_004', labelsError)
    }

    crumb.supabase('insert', 'market_booth_inventory')
    const { data, error } = await serviceClient
      .from('market_booth_inventory')
      .insert({
        market_id: marketId,
        size_label: input.size_label,
        dimensions: input.dimensions,
        // With labels the trigger derives count; a placeholder value is still required (NOT NULL).
        count: input.labels ? 0 : input.count,
        weekly_price_cents: input.weekly_price_cents,
        ...labelColumnsFor(input.labels),
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
      // Mig 258 trigger refusals (shape / letter / overlap / scheme) → the manager's sentence.
      const friendly = friendlyTierLabelError(error.code, error.message, input.size_label)
      if (friendly) return NextResponse.json({ error: friendly, code: error.code }, { status: 400 })
      throw traced.fromSupabase(error, {
        table: 'market_booth_inventory',
        operation: 'insert',
      })
    }

    return NextResponse.json({ row: data as BoothInventoryRow }, { status: 201 })
  })
}
