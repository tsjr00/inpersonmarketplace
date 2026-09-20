import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

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
 * the manager API by design — see .claude/archive/feature-plans/market_manager_v2_plan.md §4 permission
 * boundary rules. The approved flag is a soft activation toggle; the
 * vendor stays associated with the market either way.
 *
 * Body: { vendor_profile_id: string, approved: boolean,
 *         inventory_id?: string | null,   // BR-3: booth SIZE the manager grants (FM)
 *         booth_number?: string | null,   // BR-3: booth number — a PIN (hold), BR-5
 *         note?: string }                 // BR-3: note to the vendor (why a different size, etc.)
 *
 * BR-3 (owner 2026-09-19, booth_model_design.md): approval is where the manager
 * sets the vendor's booth size and number. The vendor asked for a size on their
 * application (market_vendors.requested_inventory_id, mig 256); the manager
 * confirms it or grants a different one and says why in the note. Booking is the
 * vendor's acceptance of what is set here (BR-4 locks the booking to the tier).
 * All three are optional so the old approve-only call still works.
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

    // BR-3 fields (approve only). Absent = don't touch; empty string = clear.
    const sizeProvided = Object.prototype.hasOwnProperty.call(body ?? {}, 'inventory_id')
    const inventoryId: string | null =
      typeof body?.inventory_id === 'string' && body.inventory_id.length > 0 ? body.inventory_id : null
    const boothProvided = Object.prototype.hasOwnProperty.call(body ?? {}, 'booth_number')
    const rawBooth = typeof body?.booth_number === 'string' ? body.booth_number.trim() : ''
    const boothNumber: string | null = rawBooth.length > 0 ? rawBooth : null
    if (boothNumber !== null && boothNumber.length > 50) {
      throw traced.validation('ERR_VALIDATION_003', 'booth_number must be 50 characters or fewer')
    }
    const managerNote: string | null =
      typeof body?.note === 'string' && body.note.trim().length > 0 ? body.note.trim().slice(0, 500) : null

    const serviceClient = createServiceClient()

    // BR-3 pre-flights (approve with a booth number): the number must be free —
    // never against this vendor's own rentals (BR-11); the tier must belong to
    // this market (the mig 145 trigger is the backstop).
    if (approved && boothNumber !== null) {
      const { checkBoothNumberAvailable } = await import('@/lib/markets/booth-conflict-checks')
      const { data: existingMv } = await observed(serviceClient
        .from('market_vendors')
        .select('id')
        .eq('market_id', marketId)
        .eq('vendor_profile_id', vendorProfileId)
        .maybeSingle(), { table: 'market_vendors' })
      const conflict = await checkBoothNumberAvailable(serviceClient, {
        marketId,
        boothNumber,
        ...(existingMv ? { excludeSelf: { kind: 'market_vendors' as const, id: existingMv.id as string } } : {}),
        vendorProfileId,
      })
      if (conflict) {
        return NextResponse.json({ error: conflict.message }, { status: 409 })
      }
    }
    let sizeLabel: string | null = null
    if (approved && sizeProvided && inventoryId) {
      const { data: tier } = await observed(serviceClient
        .from('market_booth_inventory')
        .select('id, size_label')
        .eq('id', inventoryId)
        .eq('market_id', marketId)
        .maybeSingle(), { table: 'market_booth_inventory' })
      if (!tier) {
        return NextResponse.json({ error: 'Selected booth size tier does not belong to this market.' }, { status: 400 })
      }
      sizeLabel = tier.size_label as string
    }

    crumb.supabase('update', 'market_vendors')
    // mig 217: `approved` alone cannot tell "never reviewed" from "the manager
    // removed this vendor" — so a revoked vendor used to reappear in the
    // dashboard's "pending your approval" list, inviting the manager to
    // re-approve someone they had just taken off the market. Revoking now stamps
    // revoked_at; re-approving CLEARS it, so a reinstated vendor carries no
    // permanent mark and can be revoked again later.
    //
    // BR-12 (owner 2026-09-19, OB-028 review C5): revoking also CLEARS the
    // vendor's booth pin + tier. Before this, the pin outlived the vendor —
    // the number stayed blocked for everyone (trigger + auto-assign) with
    // nobody in it. Paid weeks the vendor already holds are untouched (the
    // week is theirs, BR-10); only the standing hold goes.
    const { data, error } = await serviceClient
      .from('market_vendors')
      .update({
        approved,
        revoked_at: approved ? null : new Date().toISOString(),
        revoked_by: approved ? null : user.id,
        ...(approved ? {} : { booth_number: null, inventory_id: null }),
        // BR-3: size + number set at approval (only when the caller sent them).
        ...(approved && sizeProvided ? { inventory_id: inventoryId } : {}),
        ...(approved && boothProvided ? { booth_number: boothNumber } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfileId)
      .select('id, vendor_profile_id, approved, revoked_at, booth_number, inventory_id')
      .maybeSingle()

    if (error) {
      // BR-3: the booth number collided at the trigger (race past the pre-flight,
      // or the mig 145 cross-market tier check). Same 409/400 shape as vendor-booth.
      if (error.code === 'P0005' && error.message.startsWith('BOOTH_CONFLICT')) {
        return NextResponse.json({ error: error.message.replace(/^BOOTH_CONFLICT:s*/, '') }, { status: 409 })
      }
      if (error.code === 'P0001' && error.message.includes('does not belong to market')) {
        return NextResponse.json({ error: 'Selected booth size tier does not belong to this market.' }, { status: 400 })
      }
      throw traced.fromSupabase(error, { table: 'market_vendors', operation: 'update' })
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Vendor not associated with this market' },
        { status: 404 }
      )
    }

    // B-close-2 (2026-05-16): notify the vendor when their approval was
    // GRANTED (false → true). Silent on revoke (true → false) — revokes
    // are corrective actions the manager takes; no vendor-facing alert
    // beyond the dashboard state change. sendNotification is non-throwing
    // and uses fire-and-await pattern per existing call sites.
    if (approved === true) {
      // Look up vendor's user_id + market metadata for the notification.
      crumb.supabase('select', 'vendor_profiles')
      const { data: vp } = await observed(serviceClient
        .from('vendor_profiles')
        .select('user_id, vertical_id, profile_data')
        .eq('id', vendorProfileId)
        .maybeSingle(), { table: 'vendor_profiles' })

      crumb.supabase('select', 'markets')
      const { data: market } = await observed(serviceClient
        .from('markets')
        .select('name, vertical_id')
        .eq('id', marketId)
        .maybeSingle(), { table: 'markets' })

      // Vendor email is in auth.users (not vendor_profiles.profile_data
      // reliably) — fetch separately for the email channel.
      let vendorEmail: string | null = null
      if (vp?.user_id) {
        const { data: authUser } = await serviceClient.auth.admin.getUserById(
          vp.user_id as string
        )
        vendorEmail = authUser?.user?.email ?? null
      }

      if (vp?.user_id) {
        const profileData = (vp.profile_data || {}) as Record<string, unknown>
        const vendorName =
          (profileData.business_name as string | undefined) ||
          (profileData.farm_name as string | undefined) ||
          undefined

        await sendNotification(
          vp.user_id as string,
          'vendor_market_approval_granted',
          {
            marketName: (market?.name as string | undefined) || 'the market',
            ...(vendorName ? { vendorName } : {}),
            marketId,
            // BR-3/BR-8: the approval carries the booth size + number (a hold) and
            // the manager's note — one send, not a second "booth pinned" message.
            ...(sizeLabel ? { boothSizeLabel: sizeLabel } : {}),
            ...(data.booth_number ? { boothNumber: data.booth_number as string } : {}),
            ...(managerNote ? { managerNote } : {}),
          },
          {
            vertical: (market?.vertical_id as string | undefined) || (vp.vertical_id as string | undefined) || 'farmers_market',
            ...(vendorEmail ? { userEmail: vendorEmail } : {}),
          }
        )
      }
    }

    return NextResponse.json({
      success: true,
      market_vendor_id: data.id,
      vendor_profile_id: data.vendor_profile_id,
      approved: data.approved,
      revoked_at: data.revoked_at ?? null,
      booth_number: (data.booth_number as string | null) ?? null,
      inventory_id: (data.inventory_id as string | null) ?? null,
    })
  })
}
