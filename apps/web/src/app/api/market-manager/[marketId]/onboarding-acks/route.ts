import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * GET  /api/market-manager/[marketId]/onboarding-acks
 *   Returns { no_existing_vendors_ack, no_placeholders_ack }
 *
 * PUT  /api/market-manager/[marketId]/onboarding-acks
 *   Body: { no_existing_vendors_ack?: boolean, no_placeholders_ack?: boolean }
 *   Each field is optional — caller updates whichever ack(s) they're
 *   toggling. Returns the new state.
 *
 * Auth: assigned manager of the market.
 *
 * Why these exist (mig 145): the onboarding wizard's "existing vendors"
 * + "placeholders" steps need to be required for setup completeness,
 * BUT a brand-new market may legitimately have neither yet. The
 * manager toggles an explicit ack ("I have no existing X yet") to skip
 * the step without lying about the data. getOnboardingProgress reads
 * these flags to determine step completion.
 */

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-acks:${clientIp}`, rateLimits.api)
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
  return withErrorTracing('/api/market-manager/[marketId]/onboarding-acks', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    crumb.supabase('select', 'markets')
    const { data, error } = await serviceClient
      .from('markets')
      .select('onboarding_no_existing_vendors_ack, onboarding_no_placeholders_ack')
      .eq('id', marketId)
      .maybeSingle()

    if (error) {
      throw traced.fromSupabase(error, { table: 'markets', operation: 'select' })
    }
    if (!data) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    return NextResponse.json({
      no_existing_vendors_ack: !!data.onboarding_no_existing_vendors_ack,
      no_placeholders_ack: !!data.onboarding_no_placeholders_ack,
    })
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/onboarding-acks', 'PUT', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))

    const updates: Record<string, boolean> = {}
    if (typeof body?.no_existing_vendors_ack === 'boolean') {
      updates.onboarding_no_existing_vendors_ack = body.no_existing_vendors_ack
    }
    if (typeof body?.no_placeholders_ack === 'boolean') {
      updates.onboarding_no_placeholders_ack = body.no_placeholders_ack
    }

    if (Object.keys(updates).length === 0) {
      throw traced.validation(
        'ERR_VALIDATION_001',
        'Provide no_existing_vendors_ack and/or no_placeholders_ack as booleans.'
      )
    }

    const serviceClient = createServiceClient()
    crumb.supabase('update', 'markets')
    const { data, error } = await serviceClient
      .from('markets')
      .update(updates)
      .eq('id', marketId)
      .select('onboarding_no_existing_vendors_ack, onboarding_no_placeholders_ack')
      .maybeSingle()

    if (error) {
      throw traced.fromSupabase(error, { table: 'markets', operation: 'update' })
    }
    if (!data) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    return NextResponse.json({
      no_existing_vendors_ack: !!data.onboarding_no_existing_vendors_ack,
      no_placeholders_ack: !!data.onboarding_no_placeholders_ack,
    })
  })
}
