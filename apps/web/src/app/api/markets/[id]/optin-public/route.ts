import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { fetchMarketOptinForVendor } from '@/lib/markets/optin-public'

/**
 * GET /api/markets/[id]/optin-public
 *
 * Public-read endpoint for a market's selected opt-in vendor agreement
 * statements. Returns rendered text (with placeholders substituted) so
 * an anonymous user landing via an invite link (`?market=<id>`) can see
 * what they'd be agreeing to BEFORE creating an account.
 *
 * Auth: none. Markets are already a public concept; the manager
 * curated these statements specifically for vendor visibility, so
 * exposing them anonymously is intentional.
 *
 * RLS handling: market_optin_selections + market_optin_statement_catalog
 * are default-deny (mig 137). This route uses createServiceClient() and
 * is the only public surface that exposes this data.
 *
 * Response shape:
 *   200 →
 *     {
 *       market_id, market_name,
 *       statements: [
 *         { statement_id, category, category_label, rendered_text },
 *         ...
 *       ]
 *     }
 *   404 → market not found
 *
 * The statements array is empty when the manager hasn't selected any
 * statements yet — UI handles by hiding the agreement block.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/markets/[id]/optin-public', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`optin-public:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: marketId } = await params

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await serviceClient
      .from('markets')
      .select('id, name')
      .eq('id', marketId)
      .maybeSingle()

    if (marketErr) {
      throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    }
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    const { rendered } = await fetchMarketOptinForVendor(marketId)

    return NextResponse.json({
      market_id: market.id,
      market_name: market.name,
      statements: rendered,
    })
  })
}
