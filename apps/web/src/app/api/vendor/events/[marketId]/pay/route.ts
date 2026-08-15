import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { calculateBoothRentalFees } from '@/lib/pricing'
import { createEventVendorFeeCheckoutSession } from '@/lib/stripe/event-fee-payments'

/**
 * POST /api/vendor/events/[marketId]/pay — Event Vendor Fee payment (V1 Phase 3).
 *
 * The vendor's pay step after the organizer selects them (decisions.md
 * 2026-08-14). Flow:
 *   1. Vendor auth (profile in the event's vertical).
 *   2. Event by market: fee set, status approved/ready, organizer payout ready.
 *   3. Amounts from calculateBoothRentalFees(fee) — decision 6, booth math
 *      verbatim; NO math here.
 *   4. `create_event_fee_payment_if_eligible` (mig 229, advisory-locked)
 *      enforces decision 4: accepted + organizer-selected, capacity, and the
 *      12h protected windows. Pending rows never hold capacity — first
 *      PAYMENT wins at the webhook flip, the rare loser is auto-refunded.
 *   5. Stripe Checkout session (destination charge to the event market's
 *      Connect account) → { url }.
 *
 * Refusal reasons map to vendor-readable messages here; the RPC stays terse.
 */

const REASON_MESSAGES: Record<string, string> = {
  event_not_found: 'This event could not be found.',
  no_fee: 'This event has no vendor fee — nothing to pay.',
  event_not_open: 'This event is not accepting vendor payments right now.',
  fee_changed: 'The organizer just changed the fee — reload the page to see the current amount.',
  not_selected: 'The organizer has not selected you for this event yet. You can pay once they confirm their selection.',
  already_paid: 'You have already paid for your spot at this event.',
  event_full: 'All vendor spots at this event have been taken.',
  spots_protected: 'The remaining spots are reserved for other selected vendors for a few more hours. If they do not pay in time, you will be able to take a spot.',
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/vendor/events/[marketId]/pay', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-fee-pay:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const { marketId } = await params
    const serviceClient = createServiceClient()

    crumb.supabase('select', 'catering_requests')
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('id, company_name, event_date, vertical_id, status, event_vendor_fee_cents, market_id')
      .eq('market_id', marketId)
      .maybeSingle()

    if (!event) {
      return NextResponse.json({ error: REASON_MESSAGES.event_not_found }, { status: 404 })
    }

    const { profile: vendorProfile } = await getVendorProfileForVertical(supabase, user.id, event.vertical_id as string)
    if (!vendorProfile) {
      return NextResponse.json({ error: 'No vendor profile for this vertical' }, { status: 403 })
    }

    const feeCents = event.event_vendor_fee_cents as number | null
    if (!feeCents || feeCents <= 0) {
      return NextResponse.json({ error: REASON_MESSAGES.no_fee }, { status: 409 })
    }

    // The organizer must be able to RECEIVE the money (decision 8b enforces
    // this before a fee can be set, but re-check — the account could have
    // been cleared after a Stripe-side deletion).
    crumb.supabase('select', 'markets')
    const { data: market } = await serviceClient
      .from('markets')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', marketId)
      .maybeSingle()

    if (!market?.stripe_account_id || market.stripe_onboarding_complete !== true) {
      return NextResponse.json(
        { error: 'The organizer has not finished their payout setup yet — try again soon.' },
        { status: 409 }
      )
    }

    // Booth math verbatim (decision 6): fee plays the weekly price's role.
    const fees = calculateBoothRentalFees(feeCents)

    crumb.supabase('rpc', 'create_event_fee_payment_if_eligible')
    const { data: gate, error: gateErr } = await serviceClient.rpc('create_event_fee_payment_if_eligible', {
      p_market_id: marketId,
      p_vendor_profile_id: vendorProfile.id,
      p_fee_cents: fees.basePriceCents,
      p_vendor_pays_cents: fees.vendorPaysCents,
      p_organizer_receives_cents: fees.managerReceivesCents,
      p_platform_keeps_cents: fees.platformKeepsCents,
    })

    if (gateErr) {
      throw traced.fromSupabase(gateErr, { table: 'event_vendor_fee_payments', operation: 'rpc' })
    }
    const result = gate as { allowed: boolean; reason?: string; payment_id?: string }
    if (!result.allowed) {
      const reason = result.reason || 'event_not_open'
      return NextResponse.json(
        { error: REASON_MESSAGES[reason] || 'Payment is not available right now.', reason },
        { status: reason === 'event_not_found' ? 404 : 409 }
      )
    }

    const baseUrl = request.nextUrl.origin
    const vertical = event.vertical_id as string
    const pageUrl = `${baseUrl}/${vertical}/vendor/events/${marketId}`

    const session = await createEventVendorFeeCheckoutSession({
      paymentId: result.payment_id as string,
      marketId,
      // The vendor has accepted by the time they can pay, so the REAL event
      // name is theirs to see (T-75 masks pre-acceptance surfaces only).
      eventName: (event.company_name as string) || 'Private event',
      organizerStripeAccountId: market.stripe_account_id as string,
      eventDate: (event.event_date as string) || '',
      feeCents: fees.basePriceCents,
      vendorPaysCents: fees.vendorPaysCents,
      organizerReceivesCents: fees.managerReceivesCents,
      successUrl: `${pageUrl}?fee=paid`,
      cancelUrl: `${pageUrl}?fee=cancelled`,
      vertical,
    })

    return NextResponse.json({ url: session.url, vendor_pays_cents: fees.vendorPaysCents })
  })
}
