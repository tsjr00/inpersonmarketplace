import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, logError, TracedError } from '@/lib/errors'
import { calculateBoothRentalFees } from '@/lib/pricing'
import { createParkSpotCheckoutSession } from '@/lib/stripe/payments'
import { PARK_SPOT_MIN_CHARGE_CENTS, PARK_SPOT_MAX_DATES } from '@/lib/markets/park-booking-types'
import { fetchMarketOptinForVendor } from '@/lib/markets/optin-public'
import { computeAgreementVersionFromSnapshot } from '@/lib/markets/agreement-version'
import { padTime, timesOverlap, dayOfWeekName, formatTimeDisplay } from '@/lib/utils/schedule-overlap'

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
    // B1 — compliance acknowledgment is required to book (docs themselves are
    // NOT required at booking time; book-then-vet).
    if (body?.doc_ack_accepted !== true) {
      return NextResponse.json({ error: 'doc_ack_accepted must be true to book', field: 'doc_ack_accepted' }, { status: 400 })
    }

    // --- Market + payment gates. ---
    const { data: market } = await supabase
      .from('markets')
      .select('id, name, vertical_id, timezone, stripe_charges_enabled, stripe_account_id, park_mode, operator_keep_pct, season_start, season_end')
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

    const { profile, error: profErr } = await getVendorProfileForVertical<{ id: string; profile_data: Record<string, unknown> | null }>(
      supabase, user.id, market.vertical_id as string, 'id, profile_data'
    )
    if (profErr || !profile) {
      return NextResponse.json(
        { error: profErr || 'Food truck profile not found for this park\'s vertical' },
        { status: 404 }
      )
    }

    const serviceClient = createServiceClient()

    // B3 — book-then-vet: a truck the operator blocked can't make new bookings.
    // Fail-open if the vetting row is absent (blocking is the exception).
    const { data: vetting } = await serviceClient
      .from('park_vendor_vetting')
      .select('blocked')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', profile.id)
      .maybeSingle()
    if (vetting?.blocked === true) {
      return NextResponse.json(
        { error: `${(market.name as string) || 'This park'} has blocked new bookings from your food truck. Contact the operator for details.` },
        { status: 403 }
      )
    }

    // --- Spot exists + belongs to this park + active. ---
    crumb.supabase('select', 'park_spots')
    const { data: spot } = await serviceClient
      .from('park_spots')
      .select('id, market_id, label, base_price_cents, active, max_length_ft')
      .eq('id', spotId)
      .maybeSingle()
    if (!spot || spot.market_id !== marketId) {
      return NextResponse.json({ error: 'Spot not found at this park', field: 'spot_id' }, { status: 404 })
    }
    if (spot.active !== true) {
      return NextResponse.json({ error: 'That spot is not available for booking.', field: 'spot_id' }, { status: 409 })
    }

    // Tester finding P6 (user decision 2026-07-15: BLOCK with explanation) —
    // a truck longer than the spot can't book it. Only enforced when BOTH
    // numbers are known; a truck with no declared length books freely (the
    // form nudges them to add it).
    const readiness = ((profile.profile_data as Record<string, unknown> | null)?.event_readiness ?? {}) as Record<string, unknown>
    const truckLengthFt = typeof readiness.vehicle_length_feet === 'number' && readiness.vehicle_length_feet > 0
      ? readiness.vehicle_length_feet
      : null
    const spotMaxLengthFt = (spot.max_length_ft as number | null) ?? null
    if (truckLengthFt !== null && spotMaxLengthFt !== null && truckLengthFt > spotMaxLengthFt) {
      return NextResponse.json(
        {
          error: `Your truck is ${truckLengthFt} ft, but ${(spot.label as string) || 'this spot'} fits up to ${spotMaxLengthFt} ft. Choose a larger spot.`,
          field: 'spot_id',
        },
        { status: 409 }
      )
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
      serviceClient.from('market_schedules').select('day_of_week, start_time, end_time').eq('market_id', marketId).eq('active', true),
      serviceClient.from('market_date_overrides').select('override_date').eq('market_id', marketId).eq('status', 'cancelled').in('override_date', dates),
    ])
    const activeDows = new Set((schedRes.data ?? []).map((r) => r.day_of_week as number))
    const cancelled = new Set((ovrRes.data ?? []).map((o) => o.override_date as string))

    // Tester finding P2/P5 (2026-07-15): the manager's season window now
    // bounds bookings. Dates are YYYY-MM-DD strings, so string comparison is
    // safe; a missing bound is open-ended on that side.
    const seasonStart = (market.season_start as string | null) ?? null
    const seasonEnd = (market.season_end as string | null) ?? null

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
      if ((seasonStart && d < seasonStart) || (seasonEnd && d > seasonEnd)) {
        return NextResponse.json(
          { error: `${d} is outside the park's season (${seasonStart || 'open'} – ${seasonEnd || 'open'}).`, field: 'booking_dates' },
          { status: 400 }
        )
      }
    }

    // --- P10 Layers 0+1 (2026-07-15): DATE-AWARE schedule-conflict pre-check
    //     BEFORE payment. Previously a truck could PAY for a spot and only
    //     then discover the one-truck schedule rule blocked selling here.
    //     Date-aware: a conflict only counts when the truck's other ACTIVE
    //     schedule falls on one of the ACTUAL booked dates' weekdays with
    //     overlapping hours — a recurring Tuesday elsewhere never blocks a
    //     Saturday booking. multiple_trucks vendors are exempt (they can be
    //     in two places at once). Layer 2 (webhook) auto-creates the park
    //     schedule after payment, which this check guarantees is conflict-free.
    const isMultiTruck = (profile.profile_data as Record<string, unknown> | null)?.multiple_trucks === true
    if (!isMultiTruck) {
      const { data: otherSchedules } = await serviceClient
        .from('vendor_market_schedules')
        .select(`
          market_id,
          vendor_start_time,
          vendor_end_time,
          markets!inner ( id, name ),
          market_schedules!inner ( day_of_week, start_time, end_time )
        `)
        .eq('vendor_profile_id', profile.id)
        .eq('is_active', true)
        .neq('market_id', marketId)

      const parkSlotsByDow = new Map<number, Array<{ start: string; end: string }>>()
      for (const r of schedRes.data ?? []) {
        const dow = r.day_of_week as number
        const arr = parkSlotsByDow.get(dow) ?? []
        arr.push({ start: padTime(r.start_time as string), end: padTime(r.end_time as string) })
        parkSlotsByDow.set(dow, arr)
      }

      for (const d of dates) {
        const [y, mo, dd] = d.split('-').map(Number)
        const dow = new Date(Date.UTC(y, mo - 1, dd)).getUTCDay()
        const parkSlots = parkSlotsByDow.get(dow) ?? []
        for (const other of otherSchedules ?? []) {
          const ms = other.market_schedules as unknown as { day_of_week: number; start_time: string; end_time: string }
          if (ms.day_of_week !== dow) continue
          const otherStart = padTime((other.vendor_start_time as string | null) || ms.start_time)
          const otherEnd = padTime((other.vendor_end_time as string | null) || ms.end_time)
          const overlaps = parkSlots.some((p) => timesOverlap(p.start, p.end, otherStart, otherEnd))
          if (!overlaps) continue
          const otherMarket = other.markets as unknown as { id: string; name: string }
          return NextResponse.json(
            {
              error: `Schedule conflict: you're already scheduled at "${otherMarket.name}" on ${dayOfWeekName(dow)}s from ${formatTimeDisplay(otherStart)} - ${formatTimeDisplay(otherEnd)}, which overlaps ${d} at this park. Deactivate that schedule first, or enable "Multiple Trucks" in your profile if you operate more than one truck.`,
              code: 'ERR_PARK_SCHEDULE_CONFLICT',
              field: 'booking_dates',
              conflict: {
                marketId: otherMarket.id,
                marketName: otherMarket.name,
                dayOfWeek: dow,
                startTime: otherStart,
                endTime: otherEnd,
                date: d,
              },
            },
            { status: 409 }
          )
        }
      }
    }

    // --- Fees (every date is the spot's per-day price). ---
    const fees = calculateBoothRentalFees(spot.base_price_cents as number, market.operator_keep_pct as number)
    const totalVendorPaysCents = fees.vendorPaysCents * dates.length
    const totalManagerReceivesCents = fees.managerReceivesCents * dates.length
    if (totalVendorPaysCents < PARK_SPOT_MIN_CHARGE_CENTS) {
      return NextResponse.json(
        { error: `Minimum booking is $${(PARK_SPOT_MIN_CHARGE_CENTS / 100).toFixed(0)}. Add more days, or contact the operator.`, field: 'booking_dates' },
        { status: 400 }
      )
    }

    // --- B2: auto-affiliate — ensure a market_vendors row so the truck lands
    //     on the operator's roster to be vetted (book-then-vet). Idempotent;
    //     best-effort (booking still proceeds if this fails). ---
    crumb.supabase('insert', 'market_vendors')
    const { error: mvErr } = await serviceClient
      .from('market_vendors')
      .upsert(
        { market_id: marketId, vendor_profile_id: profile.id, approved: false },
        { onConflict: 'market_id,vendor_profile_id', ignoreDuplicates: true }
      )
    if (mvErr) {
      logError(traced.fromSupabase(mvErr, { table: 'market_vendors', operation: 'insert' }))
    }

    // --- B1: record acceptance of the park's opt-in agreement + the compliance
    //     acknowledgment + info-sharing consent (unlocks manager doc review).
    //     Synthetic `_` entries are excluded from the version hash (mirrors
    //     join/route.ts). Idempotent on the per-version UNIQUE (23505). ---
    const { snapshot } = await fetchMarketOptinForVendor(marketId)
    const finalSnapshot = [
      ...snapshot,
      {
        statement_id: '_info_sharing_consent',
        category: '_meta',
        statement_text: 'Vendor authorizes the platform to share their compliance documentation with the park operator.',
        placeholder_values: {},
      },
      {
        statement_id: '_park_doc_acknowledgment',
        category: '_meta',
        statement_text: 'Truck acknowledges it must upload every required document, keep them unexpired and valid before the rented time, and that missing/expired/inaccurate docs may result in cancellation without refund and declined future bookings.',
        placeholder_values: {},
      },
    ]
    const agreementVersion = computeAgreementVersionFromSnapshot(snapshot)
    crumb.supabase('insert', 'vendor_market_agreement_acceptances')
    let acceptanceId: string
    const { data: insertedAcceptance, error: vmaaErr } = await serviceClient
      .from('vendor_market_agreement_acceptances')
      .insert({
        vendor_profile_id: profile.id,
        market_id: marketId,
        statements_snapshot: finalSnapshot,
        agreement_version: agreementVersion,
      })
      .select('id')
      .single()
    if (vmaaErr) {
      if (vmaaErr.code === '23505') {
        crumb.supabase('select', 'vendor_market_agreement_acceptances')
        const { data: existing, error: fetchErr } = await serviceClient
          .from('vendor_market_agreement_acceptances')
          .select('id')
          .eq('vendor_profile_id', profile.id)
          .eq('market_id', marketId)
          .eq('agreement_version', agreementVersion)
          .maybeSingle()
        if (fetchErr || !existing) {
          throw traced.fromSupabase(
            fetchErr || new Error('Could not locate prior acceptance row'),
            { table: 'vendor_market_agreement_acceptances', operation: 'select' }
          )
        }
        acceptanceId = existing.id as string
      } else {
        throw traced.fromSupabase(vmaaErr, { table: 'vendor_market_agreement_acceptances', operation: 'insert' })
      }
    } else {
      acceptanceId = insertedAcceptance.id as string
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
      p_acceptance_id: acceptanceId,
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
      // PRK-11: must reach error_logs, not just the server console
      await logError(new TracedError('ERR_CHECKOUT_010', '[book-park-spot] book_park_spot_atomic returned empty result', {
        route: '/api/vendor/markets/[id]/book-park-spot', method: 'POST',
      }))
      return NextResponse.json({ error: 'Could not complete booking. Please try again.' }, { status: 500 })
    }

    // --- G3/PRK-16 (mig 201): apply any booth credit (park date-cancel
    //     grants). Cap keeps the residual charge >= Stripe's 50¢ minimum and
    //     the operator transfer >= 0 (credit reduces BOTH sides — the operator
    //     was already paid on the cancelled booking). RPC error (incl. mig 201
    //     not applied) → books at full price, logged (FM book/route pattern). ---
    const STRIPE_MIN_CHARGE_CENTS = 50
    const creditRequest = Math.min(totalManagerReceivesCents, totalVendorPaysCents - STRIPE_MIN_CHARGE_CENTS)
    let appliedCreditCents = 0
    if (creditRequest > 0) {
      const { data: redeemed, error: redeemErr } = await serviceClient.rpc('redeem_booth_credit', {
        p_vendor_profile_id: profile.id,
        p_market_id: marketId,
        p_group_id: null,
        p_requested_cents: creditRequest,
        p_rental_id: null,
        p_park_booking_id: rows[0].booking_id,
      })
      if (redeemErr) {
        logError(traced.fromSupabase(redeemErr, { table: 'booth_credits', operation: 'rpc' }))
      } else if (typeof redeemed === 'number') {
        appliedCreditCents = redeemed
      }
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
        appliedCreditCents,
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
      // PRK-11: must reach error_logs, not just the server console
      await logError(new TracedError('ERR_CHECKOUT_002', `[book-park-spot] Stripe session creation failed: ${stripeError instanceof Error ? stripeError.message : String(stripeError)}`, {
        route: '/api/vendor/markets/[id]/book-park-spot', method: 'POST',
      }))
      // G3/PRK-16: release any redeemed booth credit BEFORE deleting the rows
      // (the delete SET-NULLs the FK and would strand the −redeemed row).
      // Unlike FM's MGR-7 keep-rows-on-failure pattern, parks have NO orphan
      // sweep to retry a failed release — so we delete regardless and make a
      // failed release LOUD for a manual re-credit (a stranded slot blocking
      // the spot+date indefinitely is the worse outcome).
      if (appliedCreditCents > 0) {
        const { error: releaseErr } = await serviceClient.from('booth_credits').insert({
          vendor_profile_id: profile.id,
          market_id: marketId,
          amount_cents: appliedCreditCents,
          source: 'redeemed',
          related_park_booking_id: rows[0].booking_id,
          note: 'Released — park booking cancelled unpaid (Stripe session failed)',
        })
        if (releaseErr) {
          await logError(new TracedError('ERR_REFUND_001', `CRITICAL: booth-credit release failed after park checkout failure — manually re-credit ${appliedCreditCents}¢ to vendor ${profile.id} at market ${marketId}: ${releaseErr.message}`, {
            route: '/api/vendor/markets/[id]/book-park-spot', method: 'POST',
            amountCents: appliedCreditCents, vendorProfileId: profile.id,
          }))
        }
      }
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
