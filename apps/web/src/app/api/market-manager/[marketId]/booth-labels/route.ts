import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { validateBoothLabelRange } from '@/lib/markets/booth-labels'

/**
 * GET  /api/market-manager/[marketId]/booth-labels
 *   Returns the market's configured booth-label range (mig 144).
 *
 * PUT  /api/market-manager/[marketId]/booth-labels
 *   Validates and saves both labels. Range count must equal the sum of
 *   market_booth_inventory.count for this market.
 *
 *   Body:
 *     { booth_label_start: string | null, booth_label_end: string | null }
 *
 *   Passing both null clears the manager's configuration; the
 *   auto-assignment RPC falls back to defaults (prefix "", 1..total).
 *
 * Auth: assigned manager of the market (dual-key via isMarketManager).
 * Same pattern as the branding route — `createClient()` → `auth.getUser()`
 * → `isMarketManager()` → service client for the actual read/write.
 */

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-booth-labels:${clientIp}`, rateLimits.api)
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
  return withErrorTracing('/api/market-manager/[marketId]/booth-labels', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'markets')
    const { data: market, error } = await serviceClient
      .from('markets')
      .select('booth_label_start, booth_label_end')
      .eq('id', marketId)
      .maybeSingle()

    if (error) {
      throw traced.fromSupabase(error, { table: 'markets', operation: 'select' })
    }
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    return NextResponse.json({
      booth_label_start: (market.booth_label_start as string | null) ?? null,
      booth_label_end: (market.booth_label_end as string | null) ?? null,
    })
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/booth-labels', 'PUT', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))

    // Normalize: undefined → keep current (not supported here — caller must
    // pass both fields explicitly); null → clear; string → trimmed value.
    function normalize(v: unknown): string | null {
      if (v === null) return null
      if (typeof v !== 'string') return null
      const t = v.trim()
      return t.length === 0 ? null : t
    }

    const startInput = normalize(body?.booth_label_start)
    const endInput = normalize(body?.booth_label_end)

    // Both-null = clearing the config. Both-set = full validation against
    // inventory total. Mixed (one set, one not) is rejected — that pattern
    // would silently degrade to defaults at booking time.
    if (startInput === null && endInput === null) {
      const serviceClient = createServiceClient()
      crumb.supabase('update', 'markets')
      const { error } = await serviceClient
        .from('markets')
        .update({ booth_label_start: null, booth_label_end: null })
        .eq('id', marketId)
      if (error) {
        throw traced.fromSupabase(error, { table: 'markets', operation: 'update' })
      }
      return NextResponse.json({
        booth_label_start: null,
        booth_label_end: null,
      })
    }

    if (startInput === null || endInput === null) {
      throw traced.validation(
        'ERR_VALIDATION_001',
        'Provide both first and last booth labels, or send both as null to clear.'
      )
    }

    // Compute inventory total for validation.
    const serviceClient = createServiceClient()
    crumb.supabase('select', 'market_booth_inventory')
    const { data: tiers, error: tiersErr } = await serviceClient
      .from('market_booth_inventory')
      .select('count')
      .eq('market_id', marketId)

    if (tiersErr) {
      throw traced.fromSupabase(tiersErr, { table: 'market_booth_inventory', operation: 'select' })
    }

    const totalCount = (tiers ?? []).reduce((sum, t) => sum + ((t.count as number) ?? 0), 0)

    if (totalCount === 0) {
      throw traced.validation(
        'ERR_VALIDATION_002',
        "Set up at least one booth size tier before configuring booth labels — there's nothing to label yet."
      )
    }

    const validationError = validateBoothLabelRange(startInput, endInput, { totalCount })
    if (validationError) {
      throw traced.validation('ERR_VALIDATION_003', validationError)
    }

    crumb.supabase('update', 'markets')
    const { error: updateErr } = await serviceClient
      .from('markets')
      .update({
        booth_label_start: startInput,
        booth_label_end: endInput,
      })
      .eq('id', marketId)

    if (updateErr) {
      throw traced.fromSupabase(updateErr, { table: 'markets', operation: 'update' })
    }

    return NextResponse.json({
      booth_label_start: startInput,
      booth_label_end: endInput,
    })
  })
}
