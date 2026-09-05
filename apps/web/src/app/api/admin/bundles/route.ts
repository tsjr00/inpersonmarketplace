import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole, verifyAdminScope } from '@/lib/auth/admin'
import { withErrorTracing, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/admin/bundles — the bundle approval queue (mig 244).
 *
 * Per-bundle admin approval with a value-add justification is a LOCKED
 * decision (Q6: no code margin bounds — this human review is the judgment).
 * Returns pending bundles enriched with everything the reviewer needs in one
 * screen: market + manager context, the component list with live listing
 * titles/prices/vendor names, the margin, the derived bundle price, and the
 * cause attachment. ?status= lists other states (default pending_approval).
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/bundles', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userProfile } = await observed(supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single(), { table: 'user_profiles' })
    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const serviceClient = createServiceClient()
    const status = request.nextUrl.searchParams.get('status') || 'pending_approval'
    const vertical = request.nextUrl.searchParams.get('vertical') || 'farmers_market'

    // Vertical admins see only their vertical's queue (same scope contract as
    // /api/admin/events). Bundles join verticals through their market.
    const scope = await verifyAdminScope(vertical)
    if (!scope?.authorized) {
      return NextResponse.json({ error: 'Not authorized for this vertical' }, { status: 403 })
    }
    const { data: verticalMarkets } = await observed(serviceClient
      .from('markets')
      .select('id, name, vertical_id, city, state, manager_email')
      .eq('vertical_id', vertical), { table: 'markets' })
    const verticalMarketIds = (verticalMarkets ?? []).map(m => m.id as string)

    const { data: bundles } = verticalMarketIds.length
      ? await observed(serviceClient
          .from('market_bundles')
          .select('id, market_id, name, description, margin_cents, quantity_limit, quantity_sold, status, justification, pickup_market_date, pickup_notes, cause_beneficiary_id, cause_pct, approved_by, approved_at, created_by, created_at, market_bundle_components (listing_id, quantity)')
          .eq('status', status)
          .in('market_id', verticalMarketIds)
          .order('created_at', { ascending: true }), { table: 'market_bundles' })
      : { data: [] }

    const marketIds = new Set((bundles ?? []).map(b => b.market_id as string))
    const markets = (verticalMarkets ?? []).filter(m => marketIds.has(m.id as string))

    const listingIds = [...new Set((bundles ?? []).flatMap(b =>
      ((b.market_bundle_components ?? []) as Array<{ listing_id: string }>).map(c => c.listing_id)))]
    const { data: listings } = listingIds.length
      ? await observed(serviceClient
          .from('listings')
          .select('id, title, price_cents, status, vendor_profile_id, vendor_profiles (profile_data, bundles_opt_out)')
          .in('id', listingIds), { table: 'listings' })
      : { data: [] }

    const { data: beneficiaries } = await observed(serviceClient
      .from('cause_beneficiaries')
      .select('id, name, active'), { table: 'cause_beneficiaries' })

    return NextResponse.json({
      bundles: bundles ?? [],
      markets: markets ?? [],
      listings: listings ?? [],
      beneficiaries: beneficiaries ?? [],
    })
  })
}
