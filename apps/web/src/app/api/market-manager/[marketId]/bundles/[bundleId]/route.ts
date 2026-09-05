import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { validateBundleComponents, validateBundleFields, type BundleComponentInput } from '@/lib/bundles/validate'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * PATCH /api/market-manager/[marketId]/bundles/[bundleId]
 *
 * Manager edit + archive. The re-approval rule is the locked decision:
 * a MARGIN INCREASE on an active bundle sends it back to pending_approval;
 * every other edit (components, copy, qty, date, margin decrease) applies in
 * place. Archive stops sales immediately (existing sold orders continue to
 * fulfillment + handoff untouched).
 *
 * Body: { action: 'archive' } OR the same fields as create (full
 * replacement; components replaced as a set).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; bundleId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/bundles/[bundleId]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm-bundles:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId, bundleId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'market_bundles')
    const { data: bundle } = await observed(serviceClient
      .from('market_bundles')
      .select('id, market_id, status, margin_cents')
      .eq('id', bundleId)
      .maybeSingle(), { table: 'market_bundles' })
    if (!bundle || bundle.market_id !== marketId) {
      return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({})) as {
      action?: string
      name?: string; description?: string; marginCents?: number; quantityLimit?: number
      pickupMarketDate?: string; pickupNotes?: string; justification?: string
      components?: BundleComponentInput[]
      causeBeneficiaryId?: string | null; causePct?: number | null
    }

    if (body.action === 'archive') {
      crumb.supabase('update', 'market_bundles (archive)')
      await serviceClient
        .from('market_bundles')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', bundleId)
      return NextResponse.json({ id: bundleId, status: 'archived' })
    }

    if (!['pending_approval', 'active', 'rejected', 'draft'].includes(bundle.status as string)) {
      return NextResponse.json({ error: 'An archived bundle cannot be edited — create a new one.' }, { status: 409 })
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

    // Re-approval on margin INCREASE only (locked decision). A rejected
    // bundle resubmits as pending on any edit.
    const marginIncreased = (body.marginCents as number) > (bundle.margin_cents as number)
    const nextStatus =
      bundle.status === 'active'
        ? (marginIncreased ? 'pending_approval' : 'active')
        : 'pending_approval'

    crumb.supabase('update', 'market_bundles')
    const { error: updateErr } = await serviceClient
      .from('market_bundles')
      .update({
        name: (body.name as string).trim(),
        description: body.description?.trim() || null,
        margin_cents: body.marginCents,
        quantity_limit: body.quantityLimit,
        pickup_market_date: body.pickupMarketDate,
        pickup_notes: body.pickupNotes?.trim() || null,
        justification: (body.justification as string).trim(),
        cause_beneficiary_id: body.causeBeneficiaryId || null,
        cause_pct: body.causeBeneficiaryId ? body.causePct : null,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bundleId)
    if (updateErr) throw traced.fromSupabase(updateErr, { table: 'market_bundles', operation: 'update' })

    // Replace the component set (delete-and-reinsert is safe here: the table
    // is pure composition — no history, no FKs into it, and sold orders carry
    // their own order_items truth).
    await serviceClient.from('market_bundle_components').delete().eq('bundle_id', bundleId)
    const { error: componentsErr } = await serviceClient
      .from('market_bundle_components')
      .insert((body.components ?? []).map(c => ({
        bundle_id: bundleId,
        listing_id: c.listingId,
        quantity: c.quantity,
      })))
    if (componentsErr) throw traced.fromSupabase(componentsErr, { table: 'market_bundle_components', operation: 'insert' })

    return NextResponse.json({ id: bundleId, status: nextStatus, reapprovalRequired: nextStatus === 'pending_approval' && bundle.status === 'active' })
  })
}
