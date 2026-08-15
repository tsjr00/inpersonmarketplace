import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { eventRefColumn } from '@/lib/events/event-ref'
import { getAccountStatus } from '@/lib/stripe/connect'

/**
 * Event Vendor Fee — organizer sets a flat per-event fee vendors pay for a
 * spot (V1, decisions.md "Event Vendor Fees" 2026-08-14).
 *
 * GET  → fee + payout-account state, for the dashboard card.
 * PUT  → set/clear the fee. Setting a NON-ZERO fee is REFUSED until the event
 *        market's Stripe Connect onboarding is complete (decision 8b, "lazy"):
 *        you cannot charge money with nowhere for it to land. The card drives
 *        onboarding via /api/events/[token]/stripe/onboard on that refusal.
 *        Clearing the fee (null/0) never needs Connect.
 *
 * Auth: the ORGANIZER of this event only (organizer_user_id match — fee setup
 * is post-approval, decision 1, and approval links the organizer account).
 * Accepts id OR token per lib/events/event-ref.ts.
 *
 * The fee lives on catering_requests (source of truth per mig 219's ownership
 * rule). Payment rows snapshot amounts at pay time, so changing the fee later
 * affects only future payers — stated on the card.
 *
 * INERT until mig 228 is applied (column read/write would 400 before then;
 * the dashboard card ships in the same commit and is the only caller).
 */

interface EventRow {
  id: string
  organizer_user_id: string | null
  market_id: string | null
  status: string
  vertical_id: string
  event_vendor_fee_cents: number | null
}

async function loadOrganizerEvent(ref: string, userId: string) {
  const serviceClient = createServiceClient()
  crumb.supabase('select', 'catering_requests')
  const { data: event } = await serviceClient
    .from('catering_requests')
    .select('id, organizer_user_id, market_id, status, vertical_id, event_vendor_fee_cents')
    .eq(eventRefColumn(ref), ref)
    .maybeSingle()

  if (!event || (event as EventRow).organizer_user_id !== userId) return null
  return event as EventRow
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/vendor-fee', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-vendor-fee:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const { token } = await params
    const event = await loadOrganizerEvent(token, user.id)
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Payout account state lives on the event's MARKET row (created at
    // approval) — same column the manager flow uses.
    const payout: { connected: boolean; onboardingComplete: boolean } = {
      connected: false,
      onboardingComplete: false,
    }
    if (event.market_id) {
      const serviceClient = createServiceClient()
      crumb.supabase('select', 'markets')
      const { data: market } = await serviceClient
        .from('markets')
        .select('stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled')
        .eq('id', event.market_id)
        .maybeSingle()

      if (market?.stripe_account_id) {
        payout.connected = true
        payout.onboardingComplete = market.stripe_onboarding_complete === true

        // Lazy status sync: Stripe is authoritative; our columns are a cache.
        // Only worth a round-trip while onboarding looks incomplete.
        if (!payout.onboardingComplete) {
          try {
            const status = await getAccountStatus(market.stripe_account_id as string)
            const complete = status.chargesEnabled === true && status.detailsSubmitted === true
            if (complete) {
              payout.onboardingComplete = true
              crumb.supabase('update', 'markets')
              await serviceClient
                .from('markets')
                .update({
                  stripe_onboarding_complete: true,
                  stripe_charges_enabled: status.chargesEnabled === true,
                  stripe_payouts_enabled: status.payoutsEnabled === true,
                })
                .eq('id', event.market_id)
            }
          } catch {
            // Status check is best-effort; the card just keeps showing the
            // "finish setup" state and the user can retry.
          }
        }
      }
    }

    return NextResponse.json({
      fee_cents: event.event_vendor_fee_cents,
      market_id: event.market_id,
      approved: !!event.market_id,
      payout,
    })
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/vendor-fee', 'PUT', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-vendor-fee:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const { token } = await params
    const event = await loadOrganizerEvent(token, user.id)
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Fee is a POST-APPROVAL feature (decision 1): the payout account hangs
    // off the market row, which approval creates.
    if (!event.market_id) {
      return NextResponse.json(
        { error: 'The Event Vendor Fee can be set once your event is approved.' },
        { status: 409 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const raw = body.fee_cents
    if (raw !== null && (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 1_000_000)) {
      return NextResponse.json(
        { error: 'fee_cents must be null or a whole number of cents between 0 and 1,000,000' },
        { status: 400 }
      )
    }
    const feeCents: number | null = raw === 0 ? null : raw

    // Decision 8b — you cannot set a chargeable fee without a place for the
    // money to land. Clearing a fee is always allowed.
    if (feeCents !== null) {
      const serviceClient = createServiceClient()
      crumb.supabase('select', 'markets')
      const { data: market } = await serviceClient
        .from('markets')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('id', event.market_id)
        .maybeSingle()

      if (!market?.stripe_account_id || market.stripe_onboarding_complete !== true) {
        return NextResponse.json(
          {
            error: 'Set up where your money goes first — connect a payout account, then set your fee.',
            connect_required: true,
          },
          { status: 409 }
        )
      }
    }

    const serviceClient = createServiceClient()
    crumb.supabase('update', 'catering_requests')
    const { error: updateErr } = await serviceClient
      .from('catering_requests')
      .update({ event_vendor_fee_cents: feeCents })
      .eq('id', event.id)

    if (updateErr) {
      throw traced.fromSupabase(updateErr, { table: 'catering_requests', operation: 'update' })
    }

    return NextResponse.json({ ok: true, fee_cents: feeCents })
  })
}
