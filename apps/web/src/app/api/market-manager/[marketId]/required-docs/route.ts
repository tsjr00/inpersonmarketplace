import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { parseRequiredDocs } from '@/lib/markets/required-docs'

/**
 * GET  /api/market-manager/[marketId]/required-docs
 *   Returns { required_docs: RequiredDocEntry[] }
 *
 * PATCH /api/market-manager/[marketId]/required-docs
 *   Body: { required_docs: RequiredDocEntry[] }  (empty array clears)
 *
 * Tester finding P4b (2026-07-15) → structured (2026-07-23): operators tell
 * trucks which documents to carry to book. Originally free text
 * (required_docs_note, mig 192); now a structured checkbox list of the standard
 * food-truck permits + repeatable "Other" entries (required_docs JSONB, mig 206).
 * Display-only at booking; enforcement stays human review (book-then-vet).
 *
 * PRE-MIGRATION SAFE: a select/update error on the required_docs column (mig 206
 * not applied) degrades to an empty list rather than failing the card. Auth:
 * assigned manager of the market.
 */

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-required-docs:${clientIp}`, rateLimits.api)
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
  return withErrorTracing('/api/market-manager/[marketId]/required-docs', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    crumb.supabase('select', 'markets')
    const { data, error } = await serviceClient
      .from('markets')
      .select('required_docs')
      .eq('id', marketId)
      .maybeSingle()

    // PRE-MIGRATION SAFE: column absent (mig 206 unapplied) → empty list, not a
    // 500. The card shows "no documents listed yet" until the migration lands.
    if (error) {
      return NextResponse.json({ required_docs: [] })
    }
    if (!data) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    return NextResponse.json({ required_docs: parseRequiredDocs(data.required_docs) })
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/required-docs', 'PATCH', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    if (!Array.isArray(body?.required_docs)) {
      throw traced.validation('ERR_VALIDATION_001', 'required_docs must be an array')
    }
    // Normalize + validate: drops unknown keys, de-dupes standard keys, trims +
    // caps custom labels, drops label-less "other" entries.
    const cleaned = parseRequiredDocs(body.required_docs)

    const serviceClient = createServiceClient()
    crumb.supabase('update', 'markets')
    const { data, error } = await serviceClient
      .from('markets')
      .update({ required_docs: cleaned })
      .eq('id', marketId)
      .select('required_docs')
      .maybeSingle()

    if (error) {
      throw traced.fromSupabase(error, { table: 'markets', operation: 'update' })
    }
    if (!data) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    return NextResponse.json({ required_docs: parseRequiredDocs(data.required_docs) })
  })
}
