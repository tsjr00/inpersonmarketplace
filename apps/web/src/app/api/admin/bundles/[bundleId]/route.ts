import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole, verifyAdminScope } from '@/lib/auth/admin'
import { validateBundleComponents, countActiveBundles } from '@/lib/bundles/validate'
import { BUNDLE_LIMITS } from '@/lib/bundles/core'
import { withErrorTracing, crumb, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * PATCH /api/admin/bundles/[bundleId] — approve or reject (mig 244).
 *
 * Approval re-runs the composition checks (the locked decision says approval
 * verifies component vendors have not opted out — a vendor may have opted
 * out between submit and review) and enforces the Q5 cap of
 * BUNDLE_LIMITS.maxActivePerMarket active bundles per market.
 *
 * Body: { action: 'approve' | 'reject' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bundleId: string }> }
) {
  return withErrorTracing('/api/admin/bundles/[bundleId]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { bundleId } = await params

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

    crumb.supabase('select', 'market_bundles')
    const { data: bundle } = await observed(serviceClient
      .from('market_bundles')
      .select('id, market_id, status, market_bundle_components (listing_id, quantity)')
      .eq('id', bundleId)
      .maybeSingle(), { table: 'market_bundles' })
    if (!bundle) return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })

    // Vertical admins act only inside their vertical — resolve via the market.
    const { data: market } = await observed(serviceClient
      .from('markets')
      .select('id, vertical_id, stripe_account_id')
      .eq('id', bundle.market_id)
      .maybeSingle(), { table: 'markets' })
    if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    const scope = await verifyAdminScope(market.vertical_id as string)
    if (!scope?.authorized) {
      return NextResponse.json({ error: 'Not authorized for this vertical' }, { status: 403 })
    }

    if (bundle.status !== 'pending_approval') {
      return NextResponse.json({ error: 'Only pending bundles can be reviewed.' }, { status: 409 })
    }

    const { action } = await request.json().catch(() => ({})) as { action?: string }

    if (action === 'reject') {
      crumb.supabase('update', 'market_bundles (reject)')
      await serviceClient
        .from('market_bundles')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', bundleId)
        .eq('status', 'pending_approval')
      return NextResponse.json({ id: bundleId, status: 'rejected' })
    }

    if (action !== 'approve') {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    }

    if (!market.stripe_account_id) {
      return NextResponse.json({ error: 'This market has no Stripe payout account — the margin cannot be paid.' }, { status: 409 })
    }

    const componentCheck = await validateBundleComponents(
      serviceClient,
      bundle.market_id as string,
      ((bundle.market_bundle_components ?? []) as Array<{ listing_id: string; quantity: number }>)
        .map(c => ({ listingId: c.listing_id, quantity: c.quantity }))
    )
    if (!componentCheck.ok) {
      return NextResponse.json({ error: `Cannot approve: ${componentCheck.error}` }, { status: 409 })
    }

    const activeCount = await countActiveBundles(serviceClient, bundle.market_id as string, bundleId)
    if (activeCount >= BUNDLE_LIMITS.maxActivePerMarket) {
      return NextResponse.json(
        { error: `This market already has ${BUNDLE_LIMITS.maxActivePerMarket} active bundles (the cap).` },
        { status: 409 }
      )
    }

    crumb.supabase('update', 'market_bundles (approve)')
    const { error: approveErr } = await serviceClient
      .from('market_bundles')
      .update({
        status: 'active',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bundleId)
      .eq('status', 'pending_approval')
    if (approveErr) {
      return NextResponse.json({ error: 'Approve failed — please retry.' }, { status: 500 })
    }

    return NextResponse.json({ id: bundleId, status: 'active' })
  })
}
