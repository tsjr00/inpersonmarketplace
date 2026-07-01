import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * PUT /api/market-manager/[marketId]/park-mode — set markets.park_mode.
 *
 * 'free' = attendance/compliance only (no paid spots); 'paid' = spots +
 * bookings. FT park-manager P1. Auth: assigned manager of the market only.
 */

type ParkMode = 'free' | 'paid'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/park-mode', 'PUT', async () => {
    const { marketId } = await params

    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) {
      return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const parkMode = body?.park_mode
    if (parkMode !== 'free' && parkMode !== 'paid') {
      throw traced.validation('ERR_VALIDATION_001', 'park_mode must be "free" or "paid"')
    }

    const serviceClient = createServiceClient()

    crumb.supabase('update', 'markets')
    const { error } = await serviceClient
      .from('markets')
      .update({ park_mode: parkMode as ParkMode })
      .eq('id', marketId)

    if (error) {
      throw traced.fromSupabase(error, { table: 'markets', operation: 'update' })
    }

    return NextResponse.json({ success: true, park_mode: parkMode })
  })
}
