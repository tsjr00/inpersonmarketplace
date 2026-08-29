import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, logError, TracedError, observed } from '@/lib/errors'
import { calculateBoothRentalFees } from '@/lib/pricing'
import { createParkSpotCheckoutSession } from '@/lib/stripe/payments'
import { PARK_SPOT_MIN_CHARGE_CENTS } from '@/lib/markets/park-booking-types'
import {
  PARK_SAME_DAY_CUTOFF_MINUTES,
  earliestOpenByDow,
  localMinutesOfDay,
  formatClockMinutes,
  isPastSameDayCutoff,
} from '@/lib/markets/park-booking-window'

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
    const { data: booking } = await observed(service
      .from('park_spot_bookings')
      .select('id, market_id, vendor_profile_id, spot_id, booking_date, price_cents, status, standing_reservation_id, booking_group_id')
      .eq('id', bookingId)
      .maybeSingle(), { table: 'park_spot_bookings' })
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
    const { data: market } = await observed(service
      .from('markets')
      .select('id, name, vertical_id, timezone, stripe_charges_enabled, stripe_account_id, park_mode, operator_keep_pct')
      .eq('id', booking.market_id)
      .maybeSingle(), { table: 'markets' })
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

    // PRK-4: a vetting BLOCK also stops paying existing occurrences (mirrors
    // the book-park-spot gate; fail-open when no vetting row exists).
    const { data: vetting } = await observed(service
      .from('park_vendor_vetting')
      .select('blocked')
      .eq('market_id', booking.market_id)
      .eq('vendor_profile_id', booking.vendor_profile_id)
      .maybeSingle(), { table: 'park_vendor_vetting' })
    if (vetting?.blocked === true) {
      return NextResponse.json(
        { error: `${(market.name as string) || 'This park'} has blocked bookings from your food truck. Contact the operator for details.` },
        { status: 403 }
      )
    }

    // PRK-5: the hold must still be active — a revoked/suspended hold's
    // already-generated occurrence must not be payable (the manager's only
    // recourse after payment is a no-refund bar).
    const { data: hold } = await observed(service
      .from('park_standing_reservations')
      .select('status')
      .eq('id', booking.standing_reservation_id)
      .maybeSingle(), { table: 'park_standing_reservations' })
    if (hold?.status !== 'active') {
      return NextResponse.json(
        { error: 'This recurring hold is no longer active, so this occurrence can no longer be paid.' },
        { status: 409 }
      )
    }

    // --- DATE WINDOW (owner decision 2026-07-23) ---------------------------
    // This route previously had NO date validation at all: a stale occurrence
    // could be paid for a date already past, or same-day after the park had
    // opened. In practice the daily sweep expires unpaid occurrences
    // PARK_STANDING_PREPAY_CUTOFF_DAYS out (park-standing.ts), so those 409 on
    // the status check above — but that is cron-dependent, not enforced here.
    //
    // The relationship test from book-park-spot does NOT apply: an ACTIVE
    // operator-approved standing hold IS the established relationship. Only
    // the time cutoff applies.
    {
      const tz = (market.timezone as string | null) || 'America/Chicago'
      const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
      const todayLocal = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate())
      const pad2 = (n: number) => String(n).padStart(2, '0')
      const todayYmd = `${todayLocal.getFullYear()}-${pad2(todayLocal.getMonth() + 1)}-${pad2(todayLocal.getDate())}`
      const occurrenceDate = booking.booking_date as string
      const parkName = (market.name as string) || 'this park'

      if (occurrenceDate < todayYmd) {
        return NextResponse.json(
          {
            error:
              `This occurrence (${occurrenceDate}) has already passed and can no longer be paid. ` +
              `Reason: a spot can only be paid for a day that hasn't happened yet.`,
            code: 'ERR_PARK_OCCURRENCE_PAST',
          },
          { status: 409 }
        )
      }

      if (occurrenceDate === todayYmd) {
        const [oy, omo, odd] = occurrenceDate.split('-').map(Number)
        const dow = new Date(Date.UTC(oy, omo - 1, odd)).getUTCDay()
        crumb.supabase('select', 'market_schedules')
        const { data: scheds } = await observed(service
          .from('market_schedules')
          .select('day_of_week, start_time')
          .eq('market_id', booking.market_id)
          .eq('active', true), { table: 'market_schedules' })
        const openMinutes = earliestOpenByDow(scheds ?? []).get(dow) ?? null
        if (isPastSameDayCutoff(localMinutesOfDay(localNow), openMinutes) && openMinutes !== null) {
          return NextResponse.json(
            {
              error:
                `Today's spot can no longer be paid for. ` +
                `Reason: same-day payment closes ${PARK_SAME_DAY_CUTOFF_MINUTES} minutes before opening — ` +
                `${parkName} opens at ${formatClockMinutes(openMinutes)} today, so payment closed at ` +
                `${formatClockMinutes(openMinutes - PARK_SAME_DAY_CUTOFF_MINUTES)}. ` +
                `Your recurring hold is unaffected — the next occurrence is still yours.`,
              code: 'ERR_PARK_SAME_DAY_CLOSED',
            },
            { status: 409 }
          )
        }
      }
    }

    const { data: spot } = await observed(service
      .from('park_spots')
      .select('label')
      .eq('id', booking.spot_id)
      .maybeSingle(), { table: 'park_spots' })
    const spotLabel = (spot?.label as string) || 'your spot'

    // Fees (single day = the spot's per-day price).
    const fees = calculateBoothRentalFees(booking.price_cents as number, market.operator_keep_pct as number)
    if (fees.vendorPaysCents < PARK_SPOT_MIN_CHARGE_CENTS) {
      return NextResponse.json(
        { error: `This spot is below the $${(PARK_SPOT_MIN_CHARGE_CENTS / 100).toFixed(0)} minimum for a single day — contact the operator.` },
        { status: 400 }
      )
    }

    // Deterministic per-occurrence group: derive from the booking's own id so two
    // concurrent pay requests compute the SAME idempotency key (park-spot-${groupId})
    // and dedupe to ONE Stripe charge, instead of minting divergent random groups.
    // A generated occurrence has no prior group; reuse one only if already set.
    const groupId = (booking.booking_group_id as string | null) || bookingId
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
        // PRK-6: without the linkage the paid session's webhook can't find the
        // row (ERR_WEBHOOK_012 — money stranded, booking expires + strikes).
        // Fatal BEFORE handing out the URL; retry is safe because the Stripe
        // idempotency key is deterministic (same session comes back).
        await logError(traced.fromSupabase(updErr, { table: 'park_spot_bookings', operation: 'update' }))
        return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
      }
    } catch (stripeError) {
      // PRK-11: must reach error_logs, not just the server console
      await logError(new TracedError('ERR_CHECKOUT_002', `[park-occurrence-pay] Stripe session creation failed: ${stripeError instanceof Error ? stripeError.message : String(stripeError)}`, {
        route: '/api/vendor/park-occurrences/[bookingId]/pay', method: 'POST',
      }))
      return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
    }

    if (!checkoutUrl) {
      return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 })
    }
    return NextResponse.json({ url: checkoutUrl, group_id: groupId }, { status: 200 })
  })
}
