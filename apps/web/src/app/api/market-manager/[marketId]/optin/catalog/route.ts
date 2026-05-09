import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import type { OptinStatement } from '@/lib/markets/optin-types'

/**
 * GET /api/market-manager/[marketId]/optin/catalog
 *
 * Returns the curated catalog of opt-in vendor agreement statements
 * (active rows from `market_optin_statement_catalog`, ordered by
 * sort_order then id).
 *
 * The catalog is a read-only, curated list — managers select from it,
 * they don't add to it. Additions happen via support requests + a
 * separate migration.
 *
 * Auth: caller must be the assigned manager of the market. The catalog
 * is the same data for every manager but we still gate it behind the
 * manager check so unauthorized callers can't enumerate it.
 *
 * Phase B (co-branded vendor signup) will need a similar endpoint that
 * returns ONLY the statements selected for a specific market — vendors
 * never see the full catalog. That endpoint ships with Phase B.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/optin/catalog', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId } = await params

    crumb.auth('Checking market manager auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) {
      return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })
    }

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'market_optin_statement_catalog')
    const { data, error } = await serviceClient
      .from('market_optin_statement_catalog')
      .select('id, category, statement, placeholders, active, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })

    if (error) {
      throw traced.fromSupabase(error, {
        table: 'market_optin_statement_catalog',
        operation: 'select',
      })
    }

    return NextResponse.json({ catalog: (data || []) as OptinStatement[] })
  })
}
