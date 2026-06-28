import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb, logError } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { fetchMarketOptinForVendor } from '@/lib/markets/optin-public'
import { computeAgreementVersionFromSnapshot } from '@/lib/markets/agreement-version'
import { calculateBoothRentalFees } from '@/lib/pricing'
import { createBoothRentalCheckoutSession } from '@/lib/stripe/payments'

/**
 * POST /api/vendor/markets/[id]/book
 *
 * Phase C Stage 1 (2026-05-16) — weekly booth booking endpoint. Writes
 * a row to `weekly_booth_rentals` with status='pending_payment'. No
 * Stripe integration yet — payment ships in Stage 3.
 *
 * Slug name `[id]` matches sibling routes at /api/vendor/markets/[id]/...
 *
 * Body:
 *   {
 *     week_start_date: "YYYY-MM-DD",   // must be a Sunday in the future
 *     inventory_id: "<uuid>",           // must belong to this market
 *     agreement_accepted: true          // hard gate; rejected if false
 *   }
 *
 * Auth gates (in order — first failure short-circuits with a clear error):
 *   1. Authenticated user
 *   2. Vendor profile exists in market's vertical
 *   3. Market exists
 *   4. `market_vendors` row exists with approved=true — vendor must be
 *      approved at this market before booking. Rejects "not at market"
 *      and "pending approval" with distinct messages so the vendor knows
 *      whether to apply or wait.
 *   5. Inventory tier exists AND belongs to this market
 *
 * Validation:
 *   - week_start_date parses as YYYY-MM-DD
 *   - week_start_date is a Sunday (markets.day_of_week 0-Sunday convention)
 *   - week_start_date is in the future relative to today in the market's
 *     timezone (canonical cron pattern; matches manager-dashboard-stats)
 *   - agreement_accepted === true
 *
 * Write sequence (after all gates pass):
 *   1. Fetch market opt-in snapshot + compute deterministic agreement
 *      version hash (Phase B helpers).
 *   2. Insert `vendor_market_agreement_acceptances` row — on 23505 (vendor
 *      already accepted this version), fetch the existing row's id to
 *      use for the FK link.
 *   3. Snapshot `price_cents` from market_booth_inventory.weekly_price_cents
 *      so the price is locked at booking time (manager can change
 *      inventory pricing later without affecting existing bookings).
 *   4. Insert `weekly_booth_rentals` row with `status='pending_payment'`
 *      and `agreement_acceptance_id` linking step 2's row.
 *
 * Idempotency: UNIQUE (vendor_profile_id, market_id, week_start_date).
 * Re-booking the same slot returns 409 — vendor must cancel first.
 * (Cancellation endpoint ships separately; for v1, manager handles
 * cancellation requests manually.)
 *
 * No critical-path files touched. No Stripe SDK calls.
 *
 * Returns:
 *   200 → { rental_id, acceptance_id, price_cents, status, week_start_date }
 *   400 → validation error (with .field key for client form mapping)
 *   401 → not authenticated
 *   403 → vendor not approved at this market (or not at market at all)
 *   404 → market / vendor profile / inventory not found
 *   409 → already booked this week
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/markets/[id]/book', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-book:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    // Slug is `id` to satisfy Next.js sibling-route constraint; alias
    // to marketId internally so function body reads naturally.
    const { id: marketId } = await params

    crumb.auth('Checking vendor authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const body = await request.json().catch(() => ({}))

    // --- Body validation ---
    const weekStartDate = typeof body?.week_start_date === 'string' ? body.week_start_date : ''
    const inventoryId = typeof body?.inventory_id === 'string' ? body.inventory_id : ''
    const agreementAccepted = body?.agreement_accepted === true

    if (!agreementAccepted) {
      return NextResponse.json(
        { error: 'agreement_accepted must be true to book', field: 'agreement_accepted' },
        { status: 400 }
      )
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
      return NextResponse.json(
        { error: 'week_start_date must be in YYYY-MM-DD format', field: 'week_start_date' },
        { status: 400 }
      )
    }

    if (!inventoryId) {
      return NextResponse.json(
        { error: 'inventory_id is required', field: 'inventory_id' },
        { status: 400 }
      )
    }

    // --- Gate 1 done (authenticated). Gate 2: vendor profile in market's vertical. ---

    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await supabase
      .from('markets')
      .select('id, vertical_id, timezone, name, stripe_account_id, stripe_charges_enabled')
      .eq('id', marketId)
      .maybeSingle()

    if (marketErr) {
      throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    }
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    // Stripe-only booking model (revised 2026-05-18): booth rentals
    // require the manager to have completed Stripe Connect onboarding.
    // No offline-payment fallback. Reject early — before any DB writes
    // or expensive validation — so vendor gets a clear bail-out message.
    if (market.stripe_charges_enabled !== true) {
      return NextResponse.json(
        {
          error: `${(market.name as string) || 'This market'} isn't set up for online booth rentals yet — the manager hasn't finished their payment setup. Try again later or contact the market manager directly.`,
        },
        { status: 409 }
      )
    }

    const { profile, error: profErr } = await getVendorProfileForVertical<{
      id: string
    }>(supabase, user.id, market.vertical_id as string, 'id')

    if (profErr || !profile) {
      return NextResponse.json(
        { error: profErr || "Vendor profile not found for this market's vertical" },
        { status: 404 }
      )
    }

    // Phase C Stage 3 design correction (2026-05-17): booth booking
    // does NOT require manager pre-approval. Per user direction:
    // "approving each rental wouldn't save the manager time — if there
    // are open booths and the vendor agrees + pays, the system should
    // let them." Manager controls supply (booth inventory + placeholders);
    // demand routes through automatically.
    //
    // The market_vendors relationship is for REGULAR vendors with
    // permanent booth assignments. A booth-rental booking does not need
    // it. Manager sees rentals in WeeklyBookingsCard regardless of
    // whether the vendor has a market_vendors row.

    const serviceClient = createServiceClient()

    // --- Gate 4: inventory tier exists + belongs to this market. ---

    crumb.supabase('select', 'market_booth_inventory')
    const { data: inventory, error: invErr } = await serviceClient
      .from('market_booth_inventory')
      .select('id, market_id, size_label, weekly_price_cents, count')
      .eq('id', inventoryId)
      .maybeSingle()

    if (invErr) {
      throw traced.fromSupabase(invErr, { table: 'market_booth_inventory', operation: 'select' })
    }
    if (!inventory) {
      return NextResponse.json(
        { error: 'Booth size tier not found', field: 'inventory_id' },
        { status: 404 }
      )
    }
    if (inventory.market_id !== marketId) {
      return NextResponse.json(
        { error: 'Booth size tier does not belong to this market', field: 'inventory_id' },
        { status: 400 }
      )
    }

    // --- Week validation: must be Sunday + must be in the future (market-tz). ---

    // Construct the date at midnight UTC. We don't need timezone math for
    // day-of-week (Sunday is Sunday regardless of tz); we DO need it for
    // future-check, where "today" depends on the market's timezone.
    const weekStartParts = weekStartDate.split('-').map(Number)
    const weekStartUtc = new Date(Date.UTC(weekStartParts[0], weekStartParts[1] - 1, weekStartParts[2]))
    if (Number.isNaN(weekStartUtc.getTime())) {
      return NextResponse.json(
        { error: 'week_start_date is not a valid date', field: 'week_start_date' },
        { status: 400 }
      )
    }
    if (weekStartUtc.getUTCDay() !== 0) {
      return NextResponse.json(
        { error: 'week_start_date must be a Sunday', field: 'week_start_date' },
        { status: 400 }
      )
    }

    // "Today" in market timezone — canonical cron pattern from
    // manager-dashboard-stats.ts:130 / cron/expire-orders/route.ts.
    const tz = (market.timezone as string | null) || 'America/Chicago'
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
    const todayMarketLocal = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate())
    const weekStartLocal = new Date(weekStartUtc.getUTCFullYear(), weekStartUtc.getUTCMonth(), weekStartUtc.getUTCDate())
    if (weekStartLocal < todayMarketLocal) {
      return NextResponse.json(
        { error: 'week_start_date must be today or in the future', field: 'week_start_date' },
        { status: 400 }
      )
    }

    // --- Gates 1-4 passed. Capacity check + rental insert handled atomically
    //     by mig 142 book_weekly_booth_atomic RPC (race-safe under
    //     pg_advisory_xact_lock). The RPC RAISEs:
    //       - P0001 OVERBOOKED        : all slots taken for this week+size
    //       - P0002 DUPLICATE         : this vendor already booked this week
    //       - P0003 INVENTORY_NOT_FOUND : inventory_id missing for this market
    //     Translated below to the same HTTP shape the prior inline checks
    //     returned. ---

    // Step 1: snapshot + version (must happen BEFORE the RPC because the
    //         acceptance_id is passed in).
    const { snapshot } = await fetchMarketOptinForVendor(marketId)
    const agreementVersion = computeAgreementVersionFromSnapshot(snapshot)

    // Step 2: write acceptance row (or fetch existing on UNIQUE conflict)
    crumb.supabase('insert', 'vendor_market_agreement_acceptances')
    let acceptanceId: string
    const { data: insertedAcceptance, error: vmaaErr } = await serviceClient
      .from('vendor_market_agreement_acceptances')
      .insert({
        vendor_profile_id: profile.id,
        market_id: marketId,
        statements_snapshot: snapshot,
        agreement_version: agreementVersion,
      })
      .select('id')
      .single()

    if (vmaaErr) {
      if (vmaaErr.code === '23505') {
        // Vendor already accepted this version — fetch the existing row's
        // id so we can link the rental to it. This is the idempotent path.
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
        throw traced.fromSupabase(vmaaErr, {
          table: 'vendor_market_agreement_acceptances',
          operation: 'insert',
        })
      }
    } else {
      acceptanceId = insertedAcceptance.id as string
    }

    // Step 3: atomic capacity check + rental insert via mig 142 RPC.
    // Replaces the prior inline check-then-insert race condition.
    crumb.supabase('rpc', 'book_weekly_booth_atomic')
    const { data: rentalRows, error: rpcErr } = await serviceClient.rpc(
      'book_weekly_booth_atomic',
      {
        p_vendor_profile_id: profile.id,
        p_market_id: marketId,
        p_inventory_id: inventoryId,
        p_week_start_date: weekStartDate,
        p_acceptance_id: acceptanceId,
      }
    )

    if (rpcErr) {
      // Match on message — custom SQLSTATE codes P0001-P0003 also work
      // but message is the authoritative signal (P0001 is the default
      // for any RAISE EXCEPTION without explicit ERRCODE).
      const msg = rpcErr.message || ''
      if (msg.includes('OVERBOOKED')) {
        return NextResponse.json(
          {
            error: `All ${inventory.size_label} booths for the week of ${weekStartDate} are taken. Try a different week or size.`,
            field: 'week_start_date',
          },
          { status: 409 }
        )
      }
      if (msg.includes('DUPLICATE')) {
        return NextResponse.json(
          {
            error: 'You already have a booking for this week. If you need to change anything, contact the market manager.',
            field: 'week_start_date',
          },
          { status: 409 }
        )
      }
      if (msg.includes('INVENTORY_NOT_FOUND')) {
        return NextResponse.json(
          { error: 'Booth size tier not found for this market', field: 'inventory_id' },
          { status: 404 }
        )
      }
      if (msg.includes('LABELS_EXHAUSTED')) {
        // Mig 144 RPC RAISE: manager's declared booth label range
        // (markets.booth_label_start/end) is shorter than the configured
        // inventory total. Capacity exists but no label is available.
        // Vendor can't self-fix this — they need the manager to update
        // their booth label range.
        return NextResponse.json(
          {
            error: `${(market.name as string) || 'This market'} can't accept new bookings right now — the manager needs to update their booth label range. Please contact the market manager directly.`,
          },
          { status: 409 }
        )
      }
      logError(traced.fromSupabase(rpcErr, {
        table: 'weekly_booth_rentals',
        operation: 'rpc',
      }))
      throw traced.fromSupabase(rpcErr, {
        table: 'weekly_booth_rentals',
        operation: 'rpc',
      })
    }

    const rentalRow = (rentalRows as Array<{
      rental_id: string
      rental_price_cents: number
      rental_status: string
      rental_week_start_date: string
    }>)?.[0]
    if (!rentalRow) {
      // RPC returned no rows AND no error — defense-in-depth (shouldn't
      // happen given the function contract, but don't silently 200).
      console.error('[vendor/markets/book] book_weekly_booth_atomic returned empty result')
      return NextResponse.json(
        { error: 'Could not complete booking. Please try again.' },
        { status: 500 }
      )
    }

    // Re-shape to match the rest of the route's expected `rental` shape.
    const rental = {
      id: rentalRow.rental_id,
      price_cents: rentalRow.rental_price_cents,
      status: rentalRow.rental_status,
      week_start_date: rentalRow.rental_week_start_date,
    }

    // --- Apply any booth credit (Item 4b). Reserve atomically against this
    // rental; released by Phase 16 if it's abandoned unpaid. Cap so the residual
    // charge stays >= Stripe's minimum (D4) and the transfer can't go negative. ---
    const fees = calculateBoothRentalFees(rental.price_cents as number)
    const STRIPE_MIN_CHARGE_CENTS = 50
    const creditRequest = Math.min(fees.managerReceivesCents, fees.vendorPaysCents - STRIPE_MIN_CHARGE_CENTS)
    let appliedCreditCents = 0
    if (creditRequest > 0) {
      const { data: redeemed, error: redeemErr } = await serviceClient.rpc('redeem_booth_credit', {
        p_vendor_profile_id: profile.id,
        p_market_id: marketId,
        p_group_id: null,
        p_requested_cents: creditRequest,
        p_rental_id: rental.id,
      })
      if (redeemErr) {
        logError(traced.fromSupabase(redeemErr, { table: 'booth_credits', operation: 'rpc' }))
      } else if (typeof redeemed === 'number') {
        appliedCreditCents = redeemed
      }
    }

    // Phase C Stage 3 (revised 2026-05-18): booth rentals are Stripe-only.
    // The early gate at the top of this route guarantees stripe_charges_enabled
    // is true; this block is now unconditional. Create the Stripe Checkout
    // session and return its URL. If session creation fails, delete the
    // freshly-created rental row so the vendor can retry immediately
    // (otherwise UNIQUE on (vendor, market, week) would block them until
    // the cron orphan-sweep runs ~30 min later).
    const stripeAccountId = market.stripe_account_id as string
    let checkoutUrl: string | null = null

    try {
      const baseUrl = request.nextUrl.origin
      const vertical = (market.vertical_id as string) || 'farmers_market'
      const successUrl = `${baseUrl}/${vertical}/markets/${marketId}/book?session=success&rental=${rental.id}`
      const cancelUrl = `${baseUrl}/${vertical}/markets/${marketId}/book?session=cancel`

      const session = await createBoothRentalCheckoutSession({
        rentalId: rental.id as string,
        marketId,
        marketName: (market.name as string) || 'this market',
        managerStripeAccountId: stripeAccountId,
        weekStartDate: rental.week_start_date as string,
        basePriceCents: rental.price_cents as number,
        vendorPaysCents: fees.vendorPaysCents,
        managerReceivesCents: fees.managerReceivesCents,
        appliedCreditCents,
        successUrl,
        cancelUrl,
        vertical,
      })

      checkoutUrl = session.url

      // Persist the session ID so the webhook handler can resolve the event
      // to this rental row. Failure here is logged but non-blocking —
      // vendor still gets the checkout URL; webhook matching falls back
      // to client_reference_id.
      crumb.supabase('update', 'weekly_booth_rentals')
      const { error: sidErr } = await serviceClient
        .from('weekly_booth_rentals')
        .update({ stripe_checkout_session_id: session.id })
        .eq('id', rental.id)

      if (sidErr) {
        logError(traced.fromSupabase(sidErr, {
          table: 'weekly_booth_rentals',
          operation: 'update',
        }))
      }
    } catch (stripeError) {
      // Delete the orphan rental row so vendor can retry immediately.
      // WHERE conditions belt-and-suspender to ensure we only delete the
      // row we just made.
      console.error('[vendor/markets/book] Stripe session creation failed:', stripeError)
      // Release any booth credit reserved for this rental before deleting it
      // (delete SET-NULLs the FK and would strand the −amount otherwise).
      if (appliedCreditCents > 0) {
        await serviceClient.from('booth_credits').insert({
          vendor_profile_id: profile.id,
          market_id: marketId,
          amount_cents: appliedCreditCents,
          source: 'redeemed',
          related_rental_id: rental.id,
          note: 'Released — booking cancelled unpaid',
        })
      }
      const { error: cleanupErr } = await serviceClient
        .from('weekly_booth_rentals')
        .delete()
        .eq('id', rental.id)
        .eq('status', 'pending_payment')
        .is('stripe_checkout_session_id', null)
      if (cleanupErr) {
        logError(traced.fromSupabase(cleanupErr, {
          table: 'weekly_booth_rentals',
          operation: 'delete',
        }))
      }
      // agreement_acceptance row is left intact — idempotent on the
      // version hash, so a retry will reuse it via the 23505 catch path.
      return NextResponse.json(
        {
          error: 'Could not start the payment flow. Please try again in a few minutes, or reach out to the market manager.',
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      rental_id: rental.id,
      acceptance_id: acceptanceId,
      price_cents: rental.price_cents,
      status: rental.status,
      week_start_date: rental.week_start_date,
      ...(checkoutUrl ? { checkout_url: checkoutUrl } : {}),
    })
  })
}
