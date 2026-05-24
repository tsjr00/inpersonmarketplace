import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { hasAdminRole } from '@/lib/auth/admin'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/admin/markets/[id]/duplicates
 *
 * Returns the same possible-duplicate set the platform admin detail page
 * computes server-side (apps/web/src/app/admin/markets/[id]/page.tsx).
 * Lets the vertical admin client-side edit form fetch on demand when
 * the manager opens a pending-intake market in the inline edit modal.
 *
 * Matching logic — kept in lockstep with the intake route + admin detail
 * page (a hash of the same normalize-and-compare):
 *   1. Fetch every market in the same city (ilike on city).
 *   2. Normalize each candidate's name (lowercase + strip non-alphanum).
 *   3. Keep ones whose normalized name === target's normalized name.
 *
 * Auth: platform admin OR vertical admin for the market's vertical_id
 * (same gate as PUT on the parent route).
 *
 * Response:
 *   200 → { duplicates: Array<{ id, name, city, state, status, manager_email }> }
 *   401 → unauthenticated
 *   403 → not an admin for this market's vertical
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
  return withErrorTracing('/api/admin/markets/[id]/duplicates', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const { id: marketId } = await params
    const serviceClient = createServiceClient()

    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await serviceClient
      .from('markets')
      .select('id, name, city, vertical_id')
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

    // No city or no name → can't meaningfully detect duplicates. Return empty.
    if (!market.name || !market.city) {
      return NextResponse.json({ duplicates: [] })
    }

    const normalizeName = (s: string): string =>
      s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const targetNormalized = normalizeName(market.name as string)

    crumb.supabase('select', 'markets')
    const { data: cityCandidates } = await serviceClient
      .from('markets')
      .select('id, name, city, state, status, manager_email')
      .ilike('city', market.city as string)
      .neq('id', marketId)

    const duplicates = (cityCandidates ?? [])
      .filter((c) => normalizeName((c.name as string | null) ?? '') === targetNormalized)
      .map((c) => ({
        id: c.id as string,
        name: c.name as string,
        city: (c.city as string | null) ?? null,
        state: (c.state as string | null) ?? null,
        status: (c.status as string | null) ?? null,
        manager_email: (c.manager_email as string | null) ?? null,
      }))

    return NextResponse.json({ duplicates })
  })
}
