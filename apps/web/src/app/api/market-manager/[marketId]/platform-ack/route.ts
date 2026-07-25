import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * GET  /api/market-manager/[marketId]/platform-ack
 *   Returns { acknowledged: boolean, acknowledged_at: string | null }
 *
 * PATCH /api/market-manager/[marketId]/platform-ack
 *   Body: { acknowledged: boolean }
 *   Records the operator's acknowledgment of the platform compliance clause
 *   (F6, mig 209). The agreement editor gates Save on this being true.
 *
 * PRE-MIGRATION SAFE: a select/update error on the operator_platform_ack
 * columns (mig 209 not applied) degrades to not-acknowledged. Auth: assigned
 * manager of the market.
 */

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const rl = await checkRateLimit(`mm-platform-ack:${getClientIp(request)}`, rateLimits.api)
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
  return withErrorTracing('/api/market-manager/[marketId]/platform-ack', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    crumb.supabase('select', 'markets')
    const { data, error } = await serviceClient
      .from('markets')
      .select('operator_platform_ack, operator_platform_ack_at')
      .eq('id', marketId)
      .maybeSingle()

    // PRE-MIGRATION SAFE: columns absent (mig 209 unapplied) → not acknowledged.
    if (error) return NextResponse.json({ acknowledged: false, acknowledged_at: null })
    if (!data) return NextResponse.json({ error: 'Market not found' }, { status: 404 })

    return NextResponse.json({
      acknowledged: data.operator_platform_ack === true,
      acknowledged_at: (data.operator_platform_ack_at as string | null) ?? null,
    })
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/platform-ack', 'PATCH', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    if (typeof body?.acknowledged !== 'boolean') {
      throw traced.validation('ERR_VALIDATION_001', 'acknowledged must be a boolean')
    }
    const acknowledged = body.acknowledged as boolean

    const serviceClient = createServiceClient()
    crumb.supabase('update', 'markets')
    const { data, error } = await serviceClient
      .from('markets')
      .update({
        operator_platform_ack: acknowledged,
        operator_platform_ack_at: acknowledged ? new Date().toISOString() : null,
      })
      .eq('id', marketId)
      .select('operator_platform_ack, operator_platform_ack_at')
      .maybeSingle()

    if (error) throw traced.fromSupabase(error, { table: 'markets', operation: 'update' })
    if (!data) return NextResponse.json({ error: 'Market not found' }, { status: 404 })

    return NextResponse.json({
      acknowledged: data.operator_platform_ack === true,
      acknowledged_at: (data.operator_platform_ack_at as string | null) ?? null,
    })
  })
}
