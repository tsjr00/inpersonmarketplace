import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { getVendorAgreementStaleness } from '@/lib/markets/agreement-version'

/**
 * GET /api/vendor/markets/[id]/agreement-status
 *
 * B-close-3 (2026-05-16): returns staleness of the calling vendor's
 * latest agreement acceptance for this market vs the manager's current
 * statements. Used by the vendor-signup page State D (vendor already
 * at this market) to decide whether to render the friendly "you're
 * already here" message OR a "agreement was updated, re-accept" prompt.
 *
 * Auth: must be authenticated AND have a vendor profile in the market's
 * vertical. Returns 404 if either is missing.
 *
 * Response shape:
 *   200 → { is_stale, current_version, last_accepted_version, has_any_acceptance }
 *   401 → not authenticated
 *   404 → market or vendor profile not found
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/markets/[id]/agreement-status', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vmar-status:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: marketId } = await params

    crumb.auth('Checking vendor authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await supabase
      .from('markets')
      .select('id, vertical_id')
      .eq('id', marketId)
      .maybeSingle()

    if (marketErr) {
      throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    }
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    const { profile, error: profErr } = await getVendorProfileForVertical<{
      id: string
    }>(supabase, user.id, market.vertical_id as string, 'id')

    if (profErr || !profile) {
      return NextResponse.json(
        { error: profErr || "Vendor profile not found for this market's vertical" },
        { status: 404 }
      )
    }

    const staleness = await getVendorAgreementStaleness(profile.id, marketId)

    return NextResponse.json(staleness)
  })
}
