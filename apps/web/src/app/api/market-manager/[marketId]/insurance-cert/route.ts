import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * GET  /api/market-manager/[marketId]/insurance-cert
 *   Returns { certified: boolean, certified_at: string | null }
 *
 * PATCH /api/market-manager/[marketId]/insurance-cert
 *   Body: { certified: boolean }
 *   Records the operator's insurance self-certification (F7, mig 208).
 *   Advisory — does NOT block setup; admin still verifies the market.
 *
 * PRE-MIGRATION SAFE: a select/update error on the insurance_self_certified
 * columns (mig 208 not applied) degrades to not-certified rather than failing
 * the card. Auth: assigned manager of the market.
 */

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const rl = await checkRateLimit(`mm-insurance-cert:${getClientIp(request)}`, rateLimits.api)
  if (!rl.success) return { ok: false, response: rateLimitResponse(rl) }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 }) }
  }
  return { ok: true }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/insurance-cert', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    crumb.supabase('select', 'markets')
    const { data, error } = await serviceClient
      .from('markets')
      .select('insurance_self_certified, insurance_self_certified_at')
      .eq('id', marketId)
      .maybeSingle()

    // PRE-MIGRATION SAFE: columns absent (mig 208 unapplied) → not certified.
    if (error) return NextResponse.json({ certified: false, certified_at: null })
    if (!data) return NextResponse.json({ error: 'Market not found' }, { status: 404 })

    return NextResponse.json({
      certified: data.insurance_self_certified === true,
      certified_at: (data.insurance_self_certified_at as string | null) ?? null,
    })
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/insurance-cert', 'PATCH', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    if (typeof body?.certified !== 'boolean') {
      throw traced.validation('ERR_VALIDATION_001', 'certified must be a boolean')
    }
    const certified = body.certified as boolean

    const serviceClient = createServiceClient()
    crumb.supabase('update', 'markets')
    const { data, error } = await serviceClient
      .from('markets')
      .update({
        insurance_self_certified: certified,
        insurance_self_certified_at: certified ? new Date().toISOString() : null,
      })
      .eq('id', marketId)
      .select('insurance_self_certified, insurance_self_certified_at')
      .maybeSingle()

    if (error) throw traced.fromSupabase(error, { table: 'markets', operation: 'update' })
    if (!data) return NextResponse.json({ error: 'Market not found' }, { status: 404 })

    return NextResponse.json({
      certified: data.insurance_self_certified === true,
      certified_at: (data.insurance_self_certified_at as string | null) ?? null,
    })
  })
}
