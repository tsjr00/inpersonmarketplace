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

    // --- Gate 5: availability — don't overbook. ---
    //
    // Capacity = inventory.count − placeholders for this size at this
    // market (placeholders are always-taken off-platform vendors) −
    // pending/paid rentals at this market + this size + this week.
    // If the result is <= 0, reject. UNIQUE (vendor, market, week)
    // already prevents the SAME vendor from double-booking; this gate
    // prevents the SAME tier from over-allocation across all vendors.

    const totalSlots = (inventory.count as number) || 0
    crumb.supabase('select', 'market_booth_placeholders')
    const { count: placeholderCount } = await serviceClient
      .from('market_booth_placeholders')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId)
      .eq('inventory_id', inventoryId)
    crumb.supabase('select', 'weekly_booth_rentals')
    const { count: takenThisWeek } = await serviceClient
      .from('weekly_booth_rentals')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId)
      .eq('inventory_id', inventoryId)
      .eq('week_start_date', weekStartDate)
      .in('status', ['pending_payment', 'paid'])

    const remainingSlots = totalSlots - (placeholderCount ?? 0) - (takenThisWeek ?? 0)
    if (remainingSlots <= 0) {
      return NextResponse.json(
        {
          error: `All ${inventory.size_label} booths for the week of ${weekStartDate} are taken. Try a different week or size.`,
          field: 'week_start_date',
        },
        { status: 409 }
      )
    }

    // --- All gates passed. Begin write sequence. ---

    // Step 1: snapshot + version
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

    // Step 3 + 4: snapshot price + insert rental row
    const priceCents = inventory.weekly_price_cents as number

    crumb.supabase('insert', 'weekly_booth_rentals')
    const { data: rental, error: rentalErr } = await serviceClient
      .from('weekly_booth_rentals')
      .insert({
        vendor_profile_id: profile.id,
        market_id: marketId,
        week_start_date: weekStartDate,
        inventory_id: inventoryId,
        price_cents: priceCents,
        status: 'pending_payment',
        agreement_acceptance_id: acceptanceId,
      })
      .select('id, status, price_cents, week_start_date')
      .single()

    if (rentalErr) {
      if (rentalErr.code === '23505') {
        return NextResponse.json(
          {
            error: 'You already have a booking for this week. Cancel the existing booking before booking again.',
            field: 'week_start_date',
          },
          { status: 409 }
        )
      }
      // The insert failed AFTER the acceptance row was written. The
      // acceptance is recoverable (same hash = idempotent on retry).
      logError(traced.fromSupabase(rentalErr, {
        table: 'weekly_booth_rentals',
        operation: 'insert',
      }))
      throw traced.fromSupabase(rentalErr, {
        table: 'weekly_booth_rentals',
        operation: 'insert',
      })
    }

    // Phase C Stage 3 (2026-05-17): if the manager has completed Stripe
    // Connect onboarding (account exists AND charges_enabled), create a
    // Stripe Checkout session and return its URL so the vendor UI can
    // redirect. If Stripe isn't ready, fall through to the Stage 1
    // shape (rental created, status=pending_payment, no checkout_url) —
    // manager will coordinate payment offline until they finish onboarding.
    //
    // This dual-mode behavior intentionally relaxes the locked decision
    // C.7 ("hide booking CTA entirely when Stripe not ready") so existing
    // managers without Connect can still receive bookings during the
    // transition. The vendor UI (booking page) gates the CTA separately.
    const stripeAccountId = market.stripe_account_id as string | null
    const stripeChargesEnabled = market.stripe_charges_enabled as boolean | null
    let checkoutUrl: string | null = null

    if (stripeAccountId && stripeChargesEnabled === true) {
      try {
        const fees = calculateBoothRentalFees(rental.price_cents as number)
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
          successUrl,
          cancelUrl,
          vertical,
        })

        checkoutUrl = session.url

        // Persist the session ID so the webhook handler (Step 4) can
        // resolve the event to this rental row. Failure here is logged
        // but non-blocking — vendor still gets the checkout URL; webhook
        // matching falls back to client_reference_id.
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
        // Stripe session creation failed. Without remediation the rental
        // row sits with status=pending_payment + no stripe_checkout_session_id
        // until cron Phase 16 sweeps it (~30 min) — during that window the
        // vendor cannot retry because the UNIQUE (vendor, market, week)
        // constraint blocks the insert. Delete the row eagerly so retry
        // works immediately. WHERE conditions belt-and-suspender to ensure
        // we only delete the row we just made, not a row that a concurrent
        // retry might have created.
        console.error('[vendor/markets/book] Stripe session creation failed:', stripeError)
        const { error: cleanupErr } = await serviceClient
          .from('weekly_booth_rentals')
          .delete()
          .eq('id', rental.id)
          .eq('status', 'pending_payment')
          .is('stripe_checkout_session_id', null)
        if (cleanupErr) {
          // Logged, not thrown — the original Stripe error is what we want
          // to surface. Cron sweep is the safety net if cleanup also failed.
          logError(traced.fromSupabase(cleanupErr, {
            table: 'weekly_booth_rentals',
            operation: 'delete',
          }))
        }
        // Note: agreement_acceptance row is left intact — it's idempotent
        // on the version hash, so a retry will reuse it via the 23505
        // catch path above.
        return NextResponse.json(
          {
            error: 'Could not start the payment flow. Please try again in a few minutes, or reach out to the market manager.',
          },
          { status: 502 }
        )
      }
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
