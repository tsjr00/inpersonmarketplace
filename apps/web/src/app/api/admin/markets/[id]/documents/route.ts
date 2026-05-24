import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { hasAdminRole } from '@/lib/auth/admin'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import type { MarketDocumentRow } from '@/lib/markets/document-types'

/**
 * GET /api/admin/markets/[id]/documents
 *
 * Lists all verification documents uploaded for this market — admin
 * review surface for NEW-7. Read-only on the admin side: admin can list
 * + open signed URLs but cannot upload or delete (manager owns the
 * evidence trail; if a doc is fraudulent, admin escalates by rejecting
 * the market or contacting the manager, not by silently destroying).
 *
 * Mirror endpoint of /api/market-manager/[marketId]/documents GET, with
 * admin auth (platform admin OR vertical admin for the market's vertical)
 * instead of isMarketManager.
 *
 * Auth chain: same as /api/admin/markets/[id]/duplicates and
 * /api/admin/markets/[id] PUT — read market.vertical_id, then check
 * platform admin OR vertical_admin entry.
 *
 * Response:
 *   200 → { documents: MarketDocumentRow[] }
 *   401 → unauthenticated
 *   403 → not admin for this market's vertical
 *   404 → market not found
 */
async function verifyAdminAccess(
  supabase: SupabaseClient,
  userId: string,
  verticalId?: string
): Promise<boolean> {
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single()

  if (hasAdminRole(userProfile || {})) return true

  if (verticalId) {
    const { data: verticalAdmin } = await supabase
      .from('vertical_admins')
      .select('id')
      .eq('user_id', userId)
      .eq('vertical_id', verticalId)
      .single()
    return !!verticalAdmin
  }
  return false
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/markets/[id]/documents', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const { id: marketId } = await params
    const serviceClient = createServiceClient()

    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await serviceClient
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

    if (!(await verifyAdminAccess(supabase, user.id, market.vertical_id as string))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    crumb.supabase('select', 'market_documents')
    const { data, error } = await serviceClient
      .from('market_documents')
      .select('*')
      .eq('market_id', marketId)
      .order('uploaded_at', { ascending: false })

    if (error) {
      throw traced.fromSupabase(error, { table: 'market_documents', operation: 'select' })
    }

    return NextResponse.json({ documents: (data || []) as MarketDocumentRow[] })
  })
}
