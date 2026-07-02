import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, logError } from '@/lib/errors'
import { calculateBoothRentalFees } from '@/lib/pricing'
import { createParkSpotCheckoutSession } from '@/lib/stripe/payments'
import { PARK_SPOT_MIN_CHARGE_CENTS } from '@/lib/markets/park-booking-types'

/**
 * POST /api/vendor/park-occurrences/[bookingId]/pay
 *
 * FT park-manager P4b — pay for an AUTO-GENERATED recurring occurrence. The
 * daily sweep (cron Phase 21) creates a pending_payment park_spot_bookings row
 * for each active standing hold; this route lets the holding truck pay it before
 * the cutoff. Attaches the existing row to a booking_group_id and reuses
 * createParkSpotCheckoutSession + the park_spot webhook branch (which flips the
 * row to paid by group). Does NOT create a new booking (unlike book-park-spot).
 *
 * Gates: caller owns the occurrence, it's still pending_payment + tied to a
 * standing hold, park_mode='paid', operator Stripe-ready, >= FT minimum.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  return withErrorTracing('/api/vendor/park-occurrences/[bookingId]/pay', 'POST', async () => {
    const { bookingId } = await params

    const rl = await checkRateLimit(`park-occ-pay:${getClientIp(request)}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const service = createServiceClient()

    crumb.supabase('select', 'park_spot_bookings')
    const { data: booking } = await service
      .from('park_spot_bookings')
      .select('id, market_id, vendor_profile_id, spot_id, booking_date, price_cents, status, standing_reservation_id, booking_group_id')
      .eq('id', bookingId)
      .maybeSingle()
    if (!booking || !booking.standing_reservation_id) {
      return NextResponse.json({ error: 'Recurring occurrence not found' }, { status: 404 })
    }
    if (booking.status !== 'pending_payment') {
      return NextResponse.json(
        { error: 'This occurrence is no longer awaiting payment (already paid, cancelled, or expired).' },
        { status: 409 }
      )
    }

    // Market + payment gates.
    const { data: market } = await service
      .from('markets')
      .select('id, name, vertical_id, stripe_charges_enabled, stripe_account_id, park_mode')
      .eq('id', booking.market_id)
      .maybeSingle()
    if (!market) return NextResponse.json({ error: 'Park not found' }, { status: 404 })
    if (market.park_mode !== 'paid') {
      return NextResponse.json({ error: `${(market.name as string) || 'This park'} isn't taking paid spot bookings right now.` }, { status: 409 })
    }
    if (market.stripe_charges_enabled !== true) {
      return NextResponse.json({ error: `${(market.name as string) || 'This park'} isn't set up for online payments yet.` }, { status: 409 })
    }

    // Caller must own the occurrence.
    const { profile, error: profErr } = await getVendorProfileForVertical<{ id: string }>(
      supabase, user.id, market.vertical_id as string, 'id'
    )
    if (profErr || !profile) {
      return NextResponse.json({ error: profErr || 'Food truck profile not found' }, { status: 404 })
    }
    if (profile.id !== booking.vendor_profile_id) {
      return NextResponse.json({ error: 'This recurring occurrence belongs to another food truck.' }, { status: 403 })
    }

    const { data: spot } = await service
      .from('park_spots')
      .select('label')
      .eq('id', booking.spot_id)
      .maybeSingle()
    const spotLabel = (spot?.label as string) || 'your spot'

    // Fees (single day = the spot's per-day price).
    const fees = calculateBoothRentalFees(booking.price_cents as number)
    if (fees.vendorPaysCents < PARK_SPOT_MIN_CHARGE_CENTS) {
      return NextResponse.json(
        { error: `This spot is below the $${(PARK_SPOT_MIN_CHARGE_CENTS / 100).toFixed(0)} minimum for a single day — contact the operator.` },
        { status: 400 }
      )
    }

    // Reuse a prior group if this row already had one; else mint one.
    const groupId = (booking.booking_group_id as string | null) || crypto.randomUUID()
    const bookingDate = booking.booking_date as string

    let checkoutUrl: string | null = null
    try {
      const baseUrl = request.nextUrl.origin
      const vertical = (market.vertical_id as string) || 'food_trucks'
      const successUrl = `${baseUrl}/${vertical}/markets/${booking.market_id}/book-spot?session=success&group=${groupId}`
      const cancelUrl = `${baseUrl}/${vertical}/markets/${booking.market_id}/book-spot?session=cancel`

      const session = await createParkSpotCheckoutSession({
        groupId,
        marketId: booking.market_id as string,
        marketName: (market.name as string) || 'this park',
        spotLabel,
        managerStripeAccountId: market.stripe_account_id as string,
        dates: [{ bookingDate, vendorPaysCents: fees.vendorPaysCents }],
        managerReceivesTotalCents: fees.managerReceivesCents,
        successUrl,
        cancelUrl,
        vertical,
      })
      checkoutUrl = session.url

      crumb.supabase('update', 'park_spot_bookings')
      const { error: updErr } = await service
        .from('park_spot_bookings')
        .update({ booking_group_id: groupId, stripe_checkout_session_id: session.id })
        .eq('id', bookingId)
        .eq('status', 'pending_payment')
      if (updErr) {
        logError(traced.fromSupabase(updErr, { table: 'park_spot_bookings', operation: 'update' }))
      }
    } catch (stripeError) {
      console.error('[park-occurrence-pay] Stripe session creation failed:', stripeError)
      return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
    }

    if (!checkoutUrl) {
      return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
    }
    return NextResponse.json({ url: checkoutUrl, group_id: groupId }, { status: 200 })
  })
}
