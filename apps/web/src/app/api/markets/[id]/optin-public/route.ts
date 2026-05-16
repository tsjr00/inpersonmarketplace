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

    // Fetch market metadata for the invite-landing intro card (location,
    // schedule, description). The Phase B invite landing renders these
    // alongside the agreement so anonymous + existing-vendor visitors see
    // a welcoming "here's what you're applying to" page.
    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await serviceClient
      .from('markets')
      .select('id, name, description, address, city, state, day_of_week, start_time, end_time, timezone, website, logo_url')
      .eq('id', marketId)
      .maybeSingle()

    if (marketErr) {
      throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    }
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    // Fetch all active schedule rows for richer "when is this market open"
    // info. markets.day_of_week is the legacy single-schedule field; markets
    // with multiple weekly slots use market_schedules.
    crumb.supabase('select', 'market_schedules')
    const { data: schedules } = await serviceClient
      .from('market_schedules')
      .select('day_of_week, start_time, end_time, active')
      .eq('market_id', marketId)

    const activeSchedules = (schedules || [])
      .filter((s) => s.active !== false)
      .map((s) => ({
        day_of_week: s.day_of_week as number,
        start_time: s.start_time as string | null,
        end_time: s.end_time as string | null,
      }))

    const { rendered } = await fetchMarketOptinForVendor(marketId)

    return NextResponse.json({
      market_id: market.id,
      market_name: market.name,
      description: market.description as string | null,
      address: market.address as string | null,
      city: market.city as string | null,
      state: market.state as string | null,
      website: market.website as string | null,
      timezone: market.timezone as string | null,
      logo_url: market.logo_url as string | null,
      // Schedules: prefer the market_schedules rows; fall back to the
      // legacy markets.day_of_week field if none exist.
      schedules: activeSchedules.length > 0
        ? activeSchedules
        : (market.day_of_week !== null && market.day_of_week !== undefined
            ? [{
                day_of_week: market.day_of_week as number,
                start_time: market.start_time as string | null,
                end_time: market.end_time as string | null,
              }]
            : []),
      statements: rendered,
    })
  })
}
