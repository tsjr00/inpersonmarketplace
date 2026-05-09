import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import type { OptinSelection } from '@/lib/markets/optin-types'

/**
 * GET /api/market-manager/[marketId]/optin/selections
 *   Returns the current opt-in statement selections for this market.
 *
 * PUT /api/market-manager/[marketId]/optin/selections
 *   Replaces the entire set of selections for this market.
 *
 *   Body:
 *     { selections: Array<{
 *         statement_id: string,
 *         placeholder_values?: Record<string, string | number>
 *       }> }
 *
 *   Implementation: delete-all + insert-all in two sequential ops. We
 *   accept the small race window because manager Save isn't a high-
 *   contention operation. If the insert fails after the delete, the
 *   manager retries. selected_at reflects "last save time"; we don't
 *   preserve historical first-selection timestamps in v1.
 *
 *   Validation: each selection's statement_id must exist in the catalog
 *   AND be active. Postgres FK already enforces existence; we
 *   additionally filter the body against active rows so an unselected-
 *   in-catalog statement_id can't smuggle in.
 *
 * Auth: assigned manager of the market.
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
  return withErrorTracing('/api/market-manager/[marketId]/optin/selections', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'market_optin_selections')
    const { data, error } = await serviceClient
      .from('market_optin_selections')
      .select('*')
      .eq('market_id', marketId)
      .order('selected_at', { ascending: true })

    if (error) {
      throw traced.fromSupabase(error, {
        table: 'market_optin_selections',
        operation: 'select',
      })
    }

    return NextResponse.json({ selections: (data || []) as OptinSelection[] })
  })
}

interface PutSelectionInput {
  statement_id: string
  placeholder_values?: Record<string, string | number>
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/optin/selections', 'PUT', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const rawSelections = Array.isArray(body?.selections) ? body.selections : null
    if (rawSelections === null) {
      throw traced.validation('ERR_VALIDATION_001', 'selections must be an array')
    }

    // Shape + dedupe
    const seen = new Set<string>()
    const cleaned: PutSelectionInput[] = []
    for (const sel of rawSelections) {
      if (!sel || typeof sel.statement_id !== 'string') continue
      const id = sel.statement_id.trim()
      if (id.length === 0 || seen.has(id)) continue
      seen.add(id)
      const phVals = sel.placeholder_values
      cleaned.push({
        statement_id: id,
        placeholder_values:
          phVals && typeof phVals === 'object' && !Array.isArray(phVals)
            ? (phVals as Record<string, string | number>)
            : {},
      })
    }

    const serviceClient = createServiceClient()

    // Validate every statement_id exists and is active in the catalog.
    if (cleaned.length > 0) {
      crumb.supabase('select', 'market_optin_statement_catalog')
      const ids = cleaned.map((s) => s.statement_id)
      const { data: catalogRows, error: catalogErr } = await serviceClient
        .from('market_optin_statement_catalog')
        .select('id')
        .eq('active', true)
        .in('id', ids)

      if (catalogErr) {
        throw traced.fromSupabase(catalogErr, {
          table: 'market_optin_statement_catalog',
          operation: 'select',
        })
      }

      const validIds = new Set((catalogRows || []).map((r) => r.id as string))
      const invalid = ids.filter((id) => !validIds.has(id))
      if (invalid.length > 0) {
        throw traced.validation(
          'ERR_VALIDATION_002',
          `Unknown or inactive statement IDs: ${invalid.join(', ')}`
        )
      }
    }

    // Replace the whole set — delete first, insert second.
    crumb.supabase('delete', 'market_optin_selections')
    const { error: deleteErr } = await serviceClient
      .from('market_optin_selections')
      .delete()
      .eq('market_id', marketId)

    if (deleteErr) {
      throw traced.fromSupabase(deleteErr, {
        table: 'market_optin_selections',
        operation: 'delete',
      })
    }

    if (cleaned.length === 0) {
      // Cleared all selections — return empty list
      return NextResponse.json({ selections: [] as OptinSelection[] })
    }

    crumb.supabase('insert', 'market_optin_selections')
    const insertRows = cleaned.map((s) => ({
      market_id: marketId,
      statement_id: s.statement_id,
      placeholder_values: s.placeholder_values ?? {},
    }))

    const { data, error: insertErr } = await serviceClient
      .from('market_optin_selections')
      .insert(insertRows)
      .select('*')

    if (insertErr) {
      throw traced.fromSupabase(insertErr, {
        table: 'market_optin_selections',
        operation: 'insert',
      })
    }

    return NextResponse.json({ selections: (data || []) as OptinSelection[] })
  })
}
