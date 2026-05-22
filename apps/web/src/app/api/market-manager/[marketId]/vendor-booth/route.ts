import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * PATCH /api/market-manager/[marketId]/vendor-booth
 *
 * Assigns or clears a booth number for a vendor at this market. Updates
 * `market_vendors.booth_number` for the (market_id, vendor_profile_id)
 * row.
 *
 * Body:
 *   { vendor_profile_id: string, booth_number: string | null }
 *
 * Auth: caller must be the assigned manager of the market.
 *
 * Validation:
 *   - booth_number: max 50 chars, trimmed (loose policy — markets vary
 *     in their numbering schemes so we don't constrain format).
 *     Pass `null` (or empty string after trim) to clear the booth.
 *
 * No uniqueness check across vendors at the same market. Two vendors
 * with the same booth_number is allowed (managers occasionally share
 * booths). Surface duplicates in the manager dashboard if needed.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/vendor-booth', 'PATCH', async () => {
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

    // Normalize booth_number: trim, treat empty as null, cap at 50 chars
    const rawBooth = typeof body?.booth_number === 'string' ? body.booth_number.trim() : null
    const boothNumber: string | null = rawBooth && rawBooth.length > 0 ? rawBooth : null
    if (boothNumber !== null && boothNumber.length > 50) {
      throw traced.validation('ERR_VALIDATION_002', 'booth_number must be 50 characters or fewer')
    }

    // Mig 145: optional inventory_id update in the same call. Omitted
    // when the caller is only changing booth_number (legacy clients).
    // Empty string is interpreted as "clear the tier"; absent field
    // means "don't touch the tier."
    const inventoryIdProvided = Object.prototype.hasOwnProperty.call(body ?? {}, 'inventory_id')
    let inventoryId: string | null | undefined = undefined
    if (inventoryIdProvided) {
      const rawInv = body?.inventory_id
      inventoryId =
        rawInv === null || rawInv === ''
          ? null
          : typeof rawInv === 'string' && rawInv.length > 0
            ? rawInv
            : undefined
    }

    const serviceClient = createServiceClient()

    // Resolve the existing market_vendors row so we can self-exclude
    // from the booth-# uniqueness + capacity checks below. Also gives
    // us the prior inventory_id so we know whether the tier is changing.
    const { data: existingMv } = await serviceClient
      .from('market_vendors')
      .select('id, inventory_id')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfileId)
      .maybeSingle()

    if (!existingMv) {
      return NextResponse.json(
        { error: 'Vendor not associated with this market' },
        { status: 404 }
      )
    }

    // Mig 146 Issue 1: booth_number uniqueness pre-flight (friendly
    // error before the DB trigger fires).
    if (boothNumber !== null) {
      const { checkBoothNumberAvailable } = await import('@/lib/markets/booth-conflict-checks')
      const conflict = await checkBoothNumberAvailable(serviceClient, {
        marketId,
        boothNumber,
        excludeSelf: { kind: 'market_vendors', id: existingMv.id as string },
      })
      if (conflict) {
        return NextResponse.json({ error: conflict.message }, { status: 409 })
      }
    }

    // Mig 146 Issue 2: tier capacity check. Only runs when the tier is
    // CHANGING to a non-null value (no need to re-check if vendor stays
    // in the same tier — they were already counted). Excludes self.
    if (inventoryIdProvided && typeof inventoryId === 'string' && inventoryId !== existingMv.inventory_id) {
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

    const updates: Record<string, unknown> = {
      booth_number: boothNumber,
      updated_at: new Date().toISOString(),
    }
    if (inventoryIdProvided) {
      updates.inventory_id = inventoryId
    }

    crumb.supabase('update', 'market_vendors')
    const { data, error } = await serviceClient
      .from('market_vendors')
      .update(updates)
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfileId)
      .select('id, vendor_profile_id, booth_number, inventory_id')
      .maybeSingle()

    if (error) {
      // Cross-market inventory_id raised by trigger (mig 145).
      if (error.code === 'P0001' && error.message.includes('does not belong to market')) {
        return NextResponse.json(
          { error: 'Selected booth size tier does not belong to this market.' },
          { status: 400 }
        )
      }
      // Booth_number conflict raised by mig 146 trigger. Should have
      // been caught by the pre-flight check above, but the trigger is
      // the canonical safety net (handles races + any caller that
      // bypasses the helper).
      if (error.code === 'P0005' && error.message.startsWith('BOOTH_CONFLICT')) {
        return NextResponse.json(
          { error: error.message.replace(/^BOOTH_CONFLICT:\s*/, '') },
          { status: 409 }
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
      booth_number: data.booth_number,
      inventory_id: data.inventory_id,
    })
  })
}
