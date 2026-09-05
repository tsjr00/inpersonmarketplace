import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { validateBundleComponents, validateBundleFields, type BundleComponentInput } from '@/lib/bundles/validate'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * Market-curated bundles — manager side (mig 244, market_bundles_build_plan.md).
 *
 * GET  — this market's bundles (all statuses) + run-sheet data per bundle:
 *        every paid order with its component pickup list, handoff state, and
 *        margin payout state.
 * POST — create a bundle → status 'pending_approval' (per-bundle admin
 *        approval with a value-add justification is a locked decision; there
 *        is no self-activation path).
 *
 * Eligibility (Q4): isMarketManager proves manager_user_id; the market must
 * also have its Stripe Connect account (the margin rail) — checked here so
 * the manager hears it at create time, not at payout time.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/bundles', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm-bundles:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'market_bundles (manager list)')
    const { data: bundles } = await observed(serviceClient
      .from('market_bundles')
      .select('id, name, description, margin_cents, quantity_limit, quantity_sold, status, justification, pickup_market_date, pickup_notes, cause_beneficiary_id, cause_pct, approved_at, created_at, market_bundle_components (listing_id, quantity)')
      .eq('market_id', marketId)
      .order('created_at', { ascending: false }), { table: 'market_bundles' })

    const bundleIds = (bundles ?? []).map(b => b.id as string)

    // Component listing titles + vendor names for the picker/run-sheet.
    const listingIds = [...new Set((bundles ?? []).flatMap(b =>
      ((b.market_bundle_components ?? []) as Array<{ listing_id: string }>).map(c => c.listing_id)))]
    const { data: listings } = listingIds.length
      ? await observed(serviceClient
          .from('listings')
          .select('id, title, price_cents, status, vendor_profile_id')
          .in('id', listingIds), { table: 'listings' })
      : { data: [] }

    // Run-sheet: paid orders per bundle with per-item status.
    const { data: orders } = bundleIds.length
      ? await observed(serviceClient
          .from('orders')
          .select('id, order_number, status, created_at, bundle_id, bundle_margin_cents, bundle_handed_off_at, bundle_margin_transfer_id, order_items (listing_id, quantity, status)')
          .in('bundle_id', bundleIds)
          .in('status', ['paid', 'completed'])
          .order('created_at', { ascending: false }), { table: 'orders' })
      : { data: [] }

    // Component PICKER source: every published listing sold at this market
    // whose vendor is opted in (mirrors validateBundleComponents, so the
    // picker can't offer what submit would reject).
    const { data: availableRaw } = await observed(serviceClient
      .from('listings')
      .select('id, title, price_cents, vendor_profile_id, listing_markets!inner (market_id), vendor_profiles!inner (id, bundles_opt_out, profile_data)')
      .eq('listing_markets.market_id', marketId)
      .eq('status', 'published')
      .is('deleted_at', null), { table: 'listings' })
    const availableListings = (availableRaw ?? [])
      .filter(l => !(l.vendor_profiles as unknown as { bundles_opt_out: boolean }).bundles_opt_out)
      .map(l => {
        const pd = ((l.vendor_profiles as unknown as { profile_data: Record<string, unknown> | null }).profile_data) ?? {}
        return {
          id: l.id,
          title: l.title,
          price_cents: l.price_cents,
          vendor_profile_id: l.vendor_profile_id,
          vendor_name: (pd.business_name as string) || (pd.farm_name as string) || 'Vendor',
        }
      })

    // Cause picker (B2): active beneficiaries only.
    const { data: beneficiaries } = await observed(serviceClient
      .from('cause_beneficiaries')
      .select('id, name')
      .eq('active', true), { table: 'cause_beneficiaries' })

    return NextResponse.json({
      bundles: bundles ?? [],
      listings: listings ?? [],
      orders: orders ?? [],
      availableListings,
      beneficiaries: beneficiaries ?? [],
    })
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/bundles', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm-bundles:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })

    const serviceClient = createServiceClient()

    // Q4 eligibility: the margin rail must exist before a bundle can.
    const { data: market } = await observed(serviceClient
      .from('markets')
      .select('id, stripe_account_id')
      .eq('id', marketId)
      .maybeSingle(), { table: 'markets' })
    if (!market?.stripe_account_id) {
      return NextResponse.json(
        { error: 'Connect your market\'s payout account first — the bundle margin is paid through it.' },
        { status: 409 }
      )
    }

    const body = await request.json().catch(() => ({})) as {
      name?: string; description?: string; marginCents?: number; quantityLimit?: number
      pickupMarketDate?: string; pickupNotes?: string; justification?: string
      components?: BundleComponentInput[]
      causeBeneficiaryId?: string | null; causePct?: number | null
    }

    const fieldCheck = validateBundleFields(body)
    if (!fieldCheck.ok) return NextResponse.json({ error: fieldCheck.error }, { status: 400 })

    const componentCheck = await validateBundleComponents(serviceClient, marketId, body.components ?? [])
    if (!componentCheck.ok) return NextResponse.json({ error: componentCheck.error }, { status: 400 })

    if (body.causeBeneficiaryId) {
      const { data: beneficiary } = await observed(serviceClient
        .from('cause_beneficiaries')
        .select('id, active')
        .eq('id', body.causeBeneficiaryId)
        .maybeSingle(), { table: 'cause_beneficiaries' })
      if (!beneficiary?.active) {
        return NextResponse.json({ error: 'That cause organization is not available.' }, { status: 400 })
      }
    }

    crumb.supabase('insert', 'market_bundles')
    const { data: created, error: insertErr } = await serviceClient
      .from('market_bundles')
      .insert({
        market_id: marketId,
        name: (body.name as string).trim(),
        description: body.description?.trim() || null,
        margin_cents: body.marginCents,
        quantity_limit: body.quantityLimit,
        status: 'pending_approval',
        justification: (body.justification as string).trim(),
        pickup_market_date: body.pickupMarketDate,
        pickup_notes: body.pickupNotes?.trim() || null,
        cause_beneficiary_id: body.causeBeneficiaryId || null,
        cause_pct: body.causeBeneficiaryId ? body.causePct : null,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (insertErr || !created) throw traced.fromSupabase(insertErr!, { table: 'market_bundles', operation: 'insert' })

    const { error: componentsErr } = await serviceClient
      .from('market_bundle_components')
      .insert((body.components ?? []).map(c => ({
        bundle_id: created.id,
        listing_id: c.listingId,
        quantity: c.quantity,
      })))
    if (componentsErr) {
      // Composition failed — remove the header row rather than leave an
      // empty pending bundle in the admin queue.
      await serviceClient.from('market_bundles').delete().eq('id', created.id)
      throw traced.fromSupabase(componentsErr, { table: 'market_bundle_components', operation: 'insert' })
    }

    return NextResponse.json({ id: created.id, status: 'pending_approval' })
  })
}
