import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, logError } from '@/lib/errors'
import { calculateBoothRentalFees } from '@/lib/pricing'
import { createParkSpotCheckoutSession } from '@/lib/stripe/payments'
import { PARK_SPOT_MIN_CHARGE_CENTS, PARK_SPOT_MAX_DATES } from '@/lib/markets/park-booking-types'

/**
 * POST /api/vendor/markets/[id]/book-park-spot
 *
 * FT park-manager P2 — a food truck books ONE spot for one date (single day)
 * or several dates (prepay-week), paid in ONE Stripe destination charge to the
 * park operator. Reuses book_park_spot_atomic (mig 172, all-or-nothing) +
 * pricing.ts (fee math) + createParkSpotCheckoutSession (money path). Returns
 * { url } for the Stripe Checkout session.
 *
 * Gates: park_mode='paid', operator Stripe-ready, spot active + in-market, each
 * date valid + future + an operating day + not a cancelled override, and the
 * total charge >= the FT minimum. Open booking (no operator approval), matching
 * the FM booth model.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/markets/[id]/book-park-spot', 'POST', async () => {
    const { id: marketId } = await params

    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`book-park-spot:${clientIp}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const body = await request.json().catch(() => ({}))
    const spotId = typeof body?.spot_id === 'string' ? body.spot_id : ''
    const rawDates: unknown = body?.booking_dates
    if (!spotId) {
      return NextResponse.json({ error: 'spot_id is required', field: 'spot_id' }, { status: 400 })
    }
    if (!Array.isArray(rawDates) || rawDates.length === 0) {
      return NextResponse.json({ error: 'booking_dates is required', field: 'booking_dates' }, { status: 400 })
    }

    // --- Market + payment gates. ---
    const { data: market } = await supabase
      .from('markets')
      .select('id, name, vertical_id, timezone, stripe_charges_enabled, stripe_account_id, park_mode')
      .eq('id', marketId)
      .maybeSingle()
    if (!market) {
      return NextResponse.json({ error: 'Park not found' }, { status: 404 })
    }
    if (market.park_mode !== 'paid') {
      return NextResponse.json(
        { error: `${(market.name as string) || 'This park'} isn't taking paid spot bookings right now.` },
        { status: 409 }
      )
    }
    if (market.stripe_charges_enabled !== true) {
      return NextResponse.json(
        { error: `${(market.name as string) || 'This park'} isn't set up for online payments yet — the operator hasn't finished their payment setup.` },
        { status: 409 }
      )
    }

    const { profile, error: profErr } = await getVendorProfileForVertical<{ id: string }>(
      supabase, user.id, market.vertical_id as string, 'id'
    )
    if (profErr || !profile) {
      return NextResponse.json(
        { error: profErr || 'Food truck profile not found for this park\'s vertical' },
        { status: 404 }
      )
    }

    const serviceClient = createServiceClient()

    // --- Spot exists + belongs to this park + active. ---
    crumb.supabase('select', 'park_spots')
    const { data: spot } = await serviceClient
      .from('park_spots')
      .select('id, market_id, label, base_price_cents, active')
      .eq('id', spotId)
      .maybeSingle()
    if (!spot || spot.market_id !== marketId) {
      return NextResponse.json({ error: 'Spot not found at this park', field: 'spot_id' }, { status: 404 })
    }
    if (spot.active !== true) {
      return NextResponse.json({ error: 'That spot is not available for booking.', field: 'spot_id' }, { status: 409 })
    }

    // --- Date validation: valid, deduped, future (market-tz), operating day,
    //     not a cancelled override. ---
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    const dates = Array.from(
      new Set(rawDates.filter((d): d is string => typeof d === 'string' && dateRe.test(d)))
    ).sort()
    if (dates.length === 0) {
      return NextResponse.json({ error: 'No valid booking dates provided', field: 'booking_dates' }, { status: 400 })
    }
    if (dates.length > PARK_SPOT_MAX_DATES) {
      return NextResponse.json({ error: `You can book at most ${PARK_SPOT_MAX_DATES} days at once.`, field: 'booking_dates' }, { status: 400 })
    }

    const tz = (market.timezone as string | null) || 'America/Chicago'
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
    const todayLocal = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate())

    const [schedRes, ovrRes] = await Promise.all([
      serviceClient.from('market_schedules').select('day_of_week').eq('market_id', marketId).eq('active', true),
      serviceClient.from('market_date_overrides').select('override_date').eq('market_id', marketId).eq('status', 'cancelled').in('override_date', dates),
    ])
    const activeDows = new Set((schedRes.data ?? []).map((r) => r.day_of_week as number))
    const cancelled = new Set((ovrRes.data ?? []).map((o) => o.override_date as string))

    for (const d of dates) {
      const [y, mo, dd] = d.split('-').map(Number)
      const dateLocal = new Date(y, mo - 1, dd)
      if (dateLocal < todayLocal) {
        return NextResponse.json({ error: `${d} is in the past.`, field: 'booking_dates' }, { status: 400 })
      }
      const dow = new Date(Date.UTC(y, mo - 1, dd)).getUTCDay()
      if (!activeDows.has(dow)) {
        return NextResponse.json({ error: `The park isn't open on ${d}.`, field: 'booking_dates' }, { status: 400 })
      }
      if (cancelled.has(d)) {
        return NextResponse.json({ error: `${d} has been cancelled by the operator.`, field: 'booking_dates' }, { status: 409 })
      }
    }

    // --- Fees (every date is the spot's per-day price). ---
    const fees = calculateBoothRentalFees(spot.base_price_cents as number)
    const totalVendorPaysCents = fees.vendorPaysCents * dates.length
    const totalManagerReceivesCents = fees.managerReceivesCents * dates.length
    if (totalVendorPaysCents < PARK_SPOT_MIN_CHARGE_CENTS) {
      return NextResponse.json(
        { error: `Minimum booking is $${(PARK_SPOT_MIN_CHARGE_CENTS / 100).toFixed(0)}. Add more days, or contact the operator.`, field: 'booking_dates' },
        { status: 400 }
      )
    }

    // --- Book atomically (all-or-nothing across the dates). ---
    const groupId = crypto.randomUUID()
    crumb.supabase('rpc', 'book_park_spot_atomic')
    const { data: bookedRows, error: rpcErr } = await serviceClient.rpc('book_park_spot_atomic', {
      p_vendor_profile_id: profile.id,
      p_market_id: marketId,
      p_spot_id: spotId,
      p_booking_dates: dates,
      p_group_id: groupId,
      p_acceptance_id: null,
    })

    if (rpcErr) {
      const msg = rpcErr.message || ''
      if (msg.includes('SPOT_DATE_TAKEN')) {
        const m = msg.match(/date=(\d{4}-\d{2}-\d{2})/)
        const which = m ? m[1] : 'one of those days'
        return NextResponse.json(
          { error: `Spot ${spot.label} is already booked (or you already hold a spot) on ${which}. Adjust your dates.`, field: 'booking_dates' },
          { status: 409 }
        )
      }
      if (msg.includes('SPOT_NOT_FOUND')) {
        return NextResponse.json({ error: 'Spot not found at this park', field: 'spot_id' }, { status: 404 })
      }
      if (msg.includes('NO_DATES')) {
        return NextResponse.json({ error: 'No valid booking dates', field: 'booking_dates' }, { status: 400 })
      }
      throw traced.fromSupabase(rpcErr, { table: 'park_spot_bookings', operation: 'rpc' })
    }

    const rows = (bookedRows as Array<{ booking_id: string; booked_date: string; booking_price_cents: number }>) ?? []
    if (rows.length === 0) {
      console.error('[book-park-spot] book_park_spot_atomic returned empty result')
      return NextResponse.json({ error: 'Could not complete booking. Please try again.' }, { status: 500 })
    }

    // --- Stripe Checkout. On failure, delete the pending rows so the vendor
    //     can retry immediately (partial-unique would otherwise block them). ---
    let checkoutUrl: string | null = null
    try {
      const baseUrl = request.nextUrl.origin
      const vertical = (market.vertical_id as string) || 'food_trucks'
      const successUrl = `${baseUrl}/${vertical}/markets/${marketId}/book-spot?session=success&group=${groupId}`
      const cancelUrl = `${baseUrl}/${vertical}/markets/${marketId}/book-spot?session=cancel`

      const session = await createParkSpotCheckoutSession({
        groupId,
        marketId,
        marketName: (market.name as string) || 'this park',
        spotLabel: spot.label as string,
        managerStripeAccountId: market.stripe_account_id as string,
        dates: dates.map((d) => ({ bookingDate: d, vendorPaysCents: fees.vendorPaysCents })),
        managerReceivesTotalCents: totalManagerReceivesCents,
        successUrl,
        cancelUrl,
        vertical,
      })
      checkoutUrl = session.url

      crumb.supabase('update', 'park_spot_bookings')
      const { error: sidErr } = await serviceClient
        .from('park_spot_bookings')
        .update({ stripe_checkout_session_id: session.id })
        .eq('booking_group_id', groupId)
      if (sidErr) {
        logError(traced.fromSupabase(sidErr, { table: 'park_spot_bookings', operation: 'update' }))
      }
    } catch (stripeError) {
      console.error('[book-park-spot] Stripe session creation failed:', stripeError)
      const { error: cleanupErr } = await serviceClient
        .from('park_spot_bookings')
        .delete()
        .eq('booking_group_id', groupId)
        .eq('status', 'pending_payment')
        .is('stripe_checkout_session_id', null)
      if (cleanupErr) {
        logError(traced.fromSupabase(cleanupErr, { table: 'park_spot_bookings', operation: 'delete' }))
      }
      return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
    }

    if (!checkoutUrl) {
      return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
    }
    return NextResponse.json({ url: checkoutUrl, group_id: groupId, day_count: rows.length }, { status: 200 })
  })
}
