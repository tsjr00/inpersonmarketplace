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

    const serviceClient = createServiceClient()

    crumb.supabase('update', 'market_vendors')
    const { data, error } = await serviceClient
      .from('market_vendors')
      .update({
        booth_number: boothNumber,
        updated_at: new Date().toISOString(),
      })
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfileId)
      .select('id, vendor_profile_id, booth_number')
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
      booth_number: data.booth_number,
    })
  })
}
