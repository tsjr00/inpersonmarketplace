import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

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

    // Mig 146 Issue 2: tier capacity hard-block — match the pattern in
    // vendor-booth + booth-placeholders. Only checks when moving INTO a
    // tier (non-null inventoryId); clearing (null) bypasses the check.
    // Self-exclusion handled by the helper so an in-tier no-op doesn't
    // false-trigger over-capacity. Mig 146 DB trigger enforces booth #
    // uniqueness but NOT tier capacity — without this guard the manager
    // could push vendors into already-full tiers via the per-row tier
    // dropdown on VendorBoothList.
    if (inventoryId !== null) {
      const { data: existingMv } = await serviceClient
        .from('market_vendors')
        .select('id, inventory_id')
        .eq('market_id', marketId)
        .eq('vendor_profile_id', vendorProfileId)
        .maybeSingle()

      // Only run the capacity check when actually changing tiers.
      // Staying in the same tier (or no prior row) skips — same logic
      // as vendor-booth/route.ts:114.
      if (existingMv && inventoryId !== existingMv.inventory_id) {
        const { checkTierCapacity } = await import('@/lib/markets/booth-conflict-checks')
        const cap = await checkTierCapacity(serviceClient, {
          marketId,
          inventoryId,
          excludeSelf: { kind: 'market_vendors', id: existingMv.id as string },
        })
        if (!cap.ok) {
          return NextResponse.json({ error: cap.message }, { status: 409 })
        }
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
