import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * PATCH /api/market-manager/[marketId]/vendor-approval
 *
 * Flip market_vendors.approved for a vendor at this market. Closes the
 * loop opened by the co-branded signup flow (Phase B follow-through):
 * vendor signs up via /vendor-signup?market=<id>, /api/submit auto-creates
 * a market_vendors row with approved=false, manager reviews + approves
 * here.
 *
 * Allows both directions:
 *   - approve (false → true) — typical "I reviewed, they're good"
 *   - revoke (true → false) — manager wants to deactivate without removing
 *
 * Note: Removal of a vendor from a market (DELETE) remains unsupported by
 * the manager API by design — see market_manager_v2_plan.md §4 permission
 * boundary rules. The approved flag is a soft activation toggle; the
 * vendor stays associated with the market either way.
 *
 * Body: { vendor_profile_id: string, approved: boolean }
 *
 * Auth: caller must be the assigned manager of the market (dual-key via
 * isMarketManager). 403 otherwise.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/vendor-approval', 'PATCH', async () => {
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

    const body = await request.json().catch(() => ({}))
    const vendorProfileId = typeof body?.vendor_profile_id === 'string' ? body.vendor_profile_id : ''
    if (!vendorProfileId) {
      throw traced.validation('ERR_VALIDATION_001', 'vendor_profile_id is required')
    }

    if (typeof body?.approved !== 'boolean') {
      throw traced.validation('ERR_VALIDATION_002', 'approved must be a boolean')
    }
    const approved = body.approved as boolean

    const serviceClient = createServiceClient()

    crumb.supabase('update', 'market_vendors')
    const { data, error } = await serviceClient
      .from('market_vendors')
      .update({
        approved,
        updated_at: new Date().toISOString(),
      })
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfileId)
      .select('id, vendor_profile_id, approved')
      .maybeSingle()

    if (error) {
      throw traced.fromSupabase(error, { table: 'market_vendors', operation: 'update' })
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Vendor not associated with this market' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      market_vendor_id: data.id,
      vendor_profile_id: data.vendor_profile_id,
      approved: data.approved,
    })
  })
}
