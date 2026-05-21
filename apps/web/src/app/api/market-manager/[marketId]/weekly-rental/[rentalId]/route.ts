import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * PATCH /api/market-manager/[marketId]/weekly-rental/[rentalId]
 *
 * Phase C Stage 1A (2026-05-17) — manager assigns or clears a booth
 * number on a specific weekly booking. Mirrors the vendor-booth
 * endpoint (per-vendor at-market booth_number) but operates on a
 * per-booking row in `weekly_booth_rentals`.
 *
 * Why separate from vendor-booth: weekly_booth_rentals.booth_number
 * is a per-week assignment, allowing a vendor to be in different
 * booths different weeks. market_vendors.booth_number is the
 * "default" booth for unbooked-but-attending vendors.
 *
 * Body:
 *   { booth_number: string | null }   // null/empty clears
 *
 * Auth: caller must be the assigned manager of this market. The rental
 * row's market_id is matched against the URL marketId for cross-market
 * spoofing rejection.
 *
 * No status enforcement on which rentals can be edited — manager can
 * adjust booth_number on pending/paid/cancelled/completed rows alike
 * (they may need to correct a typo retroactively). Future Stage 3
 * polish could restrict to non-cancelled.
 *
 * No critical-path files touched. No Stripe SDK calls.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; rentalId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/weekly-rental/[rentalId]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm-rental:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId, rentalId } = await params

    crumb.auth('Checking market manager auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) {
      return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))

    // Normalize booth_number: trim, treat empty as null, cap at 50 chars.
    const rawBooth = typeof body?.booth_number === 'string' ? body.booth_number.trim() : null
    const boothNumber: string | null = rawBooth && rawBooth.length > 0 ? rawBooth : null
    if (boothNumber !== null && boothNumber.length > 50) {
      throw traced.validation('ERR_VALIDATION_001', 'booth_number must be 50 characters or fewer')
    }

    const serviceClient = createServiceClient()

    // Update + match BOTH id AND market_id so a manager of market A can't
    // spoof a rentalId belonging to market B. If the row doesn't match,
    // .maybeSingle() returns null → 404.
    crumb.supabase('update', 'weekly_booth_rentals')
    const { data, error } = await serviceClient
      .from('weekly_booth_rentals')
      .update({
        booth_number: boothNumber,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rentalId)
      .eq('market_id', marketId)
      .select('id, booth_number, vendor_profile_id, week_start_date')
      .maybeSingle()

    if (error) {
      // Same-week booth-number uniqueness (mig 144 partial UNIQUE index
      // idx_wbr_market_week_booth). Translate to a friendly 409 so the
      // manager understands why their override was rejected.
      if (error.code === '23505') {
        return NextResponse.json(
          {
            error: boothNumber
              ? `Booth ${boothNumber} is already assigned to another vendor for this week. Pick a different label or move the other vendor first.`
              : 'Booth number conflict for this week.',
          },
          { status: 409 }
        )
      }
      throw traced.fromSupabase(error, { table: 'weekly_booth_rentals', operation: 'update' })
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Booking not found at this market' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      rental_id: data.id,
      vendor_profile_id: data.vendor_profile_id,
      week_start_date: data.week_start_date,
      booth_number: data.booth_number,
    })
  })
}
