import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * GET  /api/market-manager/[marketId]/required-docs
 *   Returns { required_docs_note: string | null }
 *
 * PATCH /api/market-manager/[marketId]/required-docs
 *   Body: { required_docs_note: string | null }  (empty string clears)
 *
 * Tester finding P4b (2026-07-15): the booking flow tells trucks to upload
 * "the documents this park requires" but operators had no way to say what
 * those are. Free text, display-only at booking (mig 192); enforcement stays
 * human review. Auth: assigned manager of the market (auth pattern mirrors
 * onboarding-acks/route.ts).
 */

const MAX_NOTE_LENGTH = 2000

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
      .select('required_docs_note')
      .eq('id', marketId)
      .maybeSingle()

    if (error) {
      throw traced.fromSupabase(error, { table: 'markets', operation: 'select' })
    }
    if (!data) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    return NextResponse.json({ required_docs_note: (data.required_docs_note as string | null) ?? null })
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
    const raw = body?.required_docs_note
    if (raw !== null && typeof raw !== 'string') {
      throw traced.validation('ERR_VALIDATION_001', 'required_docs_note must be a string or null')
    }
    const trimmed = typeof raw === 'string' ? raw.trim() : null
    if (trimmed && trimmed.length > MAX_NOTE_LENGTH) {
      throw traced.validation('ERR_VALIDATION_001', `required_docs_note must be under ${MAX_NOTE_LENGTH} characters`)
    }

    const serviceClient = createServiceClient()
    crumb.supabase('update', 'markets')
    const { data, error } = await serviceClient
      .from('markets')
      .update({ required_docs_note: trimmed || null })
      .eq('id', marketId)
      .select('required_docs_note')
      .maybeSingle()

    if (error) {
      throw traced.fromSupabase(error, { table: 'markets', operation: 'update' })
    }
    if (!data) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    return NextResponse.json({ required_docs_note: (data.required_docs_note as string | null) ?? null })
  })
}
