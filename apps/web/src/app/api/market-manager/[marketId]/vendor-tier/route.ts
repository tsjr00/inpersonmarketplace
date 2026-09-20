import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { boothAssignmentFrozenUntil, frozenBoothMessage } from '@/lib/markets/booth-freeze'

/**
 * PATCH /api/market-manager/[marketId]/vendor-tier
 *
 * Sets or clears `market_vendors.inventory_id` for a vendor at this
 * market — the size tier the vendor occupies. Mig 145 added the column
 * + the same-market integrity trigger; this route is the manager-facing
 * write surface.
 *
 * Body:
 *   { vendor_profile_id: string, inventory_id: string | null }
 *
 * Auth: assigned manager of the market.
 *
 * Same shape as vendor-booth — separate endpoint because tier and
 * booth_number are independent attributes (manager may set tier
 * without yet assigning a booth_number, or vice versa).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/vendor-tier', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm-vendor-tier:${clientIp}`, rateLimits.api)
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

    // inventory_id: null means clear; string means set
    const rawInventory = body?.inventory_id
    const inventoryId: string | null =
      rawInventory === null
        ? null
        : typeof rawInventory === 'string' && rawInventory.length > 0
          ? rawInventory
          : null

    const serviceClient = createServiceClient()

    // No tier-capacity check on a vendor's tier (was "mig 146 Issue 2"): the
    // tier on a roster row is the vendor's booth SIZE, a soft hold like the
    // pin — it occupies nothing until a week is paid for (BR-6, owner
    // 2026-09-19). The booking RPC enforces per-week capacity from
    // placeholders + active rentals; placeholders keep their own check.

    // BR-7: while the vendor holds a paid current/upcoming week under their
    // pinned number, the size (their price) is frozen with the number.
    const { data: existingMv } = await observed(serviceClient
      .from('market_vendors')
      .select('booth_number, inventory_id, vendor_profiles!market_vendors_vendor_profile_id_fkey ( profile_data )')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfileId)
      .maybeSingle(), { table: 'market_vendors' })
    if (existingMv?.booth_number && inventoryId !== (existingMv.inventory_id as string | null)) {
      const paidThrough = await boothAssignmentFrozenUntil(serviceClient, { marketId, vendorProfileId, boothNumber: existingMv.booth_number as string })
      if (paidThrough) {
        const vpRel = existingMv.vendor_profiles as unknown as { profile_data?: Record<string, unknown> } | { profile_data?: Record<string, unknown> }[] | null
        const vp = Array.isArray(vpRel) ? vpRel[0] : vpRel
        const name = (vp?.profile_data?.business_name as string) || (vp?.profile_data?.farm_name as string) || 'This vendor'
        return NextResponse.json(
          { error: frozenBoothMessage(name, existingMv.booth_number as string, paidThrough), code: 'ERR_BOOTH_ASSIGNED_FROZEN' },
          { status: 409 }
        )
      }
    }

    crumb.supabase('update', 'market_vendors')
    const { data, error } = await serviceClient
      .from('market_vendors')
      .update({
        inventory_id: inventoryId,
        updated_at: new Date().toISOString(),
      })
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfileId)
      .select('id, vendor_profile_id, inventory_id')
      .maybeSingle()

    if (error) {
      // Cross-market inventory_id raised by trigger (mig 145).
      if (error.code === 'P0001' && error.message.includes('does not belong to market')) {
        return NextResponse.json(
          { error: 'Selected booth size tier does not belong to this market.' },
          { status: 400 }
        )
      }
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
      inventory_id: data.inventory_id,
    })
  })
}
