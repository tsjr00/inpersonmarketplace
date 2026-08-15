import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { eventRefColumn } from '@/lib/events/event-ref'
import { getAccountStatus } from '@/lib/stripe/connect'
import { getReusablePayoutAccounts } from '@/lib/events/reusable-payout-accounts'

/**
 * POST /api/events/[token]/stripe/reuse
 *
 * Point this event's payout at a Stripe Connect account the organizer already
 * finished onboarding elsewhere — their VENDOR account or a PRIOR EVENT's
 * (owner decision 2026-08-15: offered as a choice next to "set up a separate
 * account", never automatic — the same person is not always the same
 * business).
 *
 * The client sends only `source: 'vendor' | 'prior_event'`. The account id is
 * re-derived server-side (lib/events/reusable-payout-accounts) so an organizer
 * can never point their event at an arbitrary account. The account is
 * live-verified with Stripe before it's copied: a dead or disabled account is
 * refused with a "set up a new one" message.
 *
 * Refused once this event already has a COMPLETE payout account (nothing to
 * reuse over); an incomplete/abandoned onboarding attempt may be replaced.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/stripe/reuse', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-stripe-reuse:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const { token } = await params
    const serviceClient = createServiceClient()

    crumb.supabase('select', 'catering_requests')
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('id, organizer_user_id, market_id, vertical_id')
      .eq(eventRefColumn(token), token)
      .maybeSingle()

    if (!event || event.organizer_user_id !== user.id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    if (!event.market_id) {
      return NextResponse.json({ error: 'Event not yet approved' }, { status: 409 })
    }

    const body = await request.json().catch(() => ({}))
    const source = body.source
    if (source !== 'vendor' && source !== 'prior_event') {
      return NextResponse.json({ error: 'source must be vendor or prior_event' }, { status: 400 })
    }

    crumb.supabase('select', 'markets')
    const { data: market } = await serviceClient
      .from('markets')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', event.market_id)
      .maybeSingle()

    if (!market) {
      return NextResponse.json({ error: 'Event market not found' }, { status: 404 })
    }
    if (market.stripe_onboarding_complete === true) {
      return NextResponse.json(
        { error: 'This event already has a working payout account.' },
        { status: 409 }
      )
    }

    const candidates = await getReusablePayoutAccounts(serviceClient, user.id, {
      excludeMarketId: event.market_id as string,
      verticalId: event.vertical_id as string,
    })
    const candidate = candidates.find(c => c.source === source)
    if (!candidate) {
      return NextResponse.json(
        { error: 'No reusable payout account found — set up a new one instead.' },
        { status: 404 }
      )
    }

    // Owner's notice made mechanical: "if your prior event payout account is
    // still active" — verify with Stripe before copying, never trust our cache.
    let status
    try {
      status = await getAccountStatus(candidate.stripeAccountId)
    } catch {
      return NextResponse.json(
        { error: 'That payout account is no longer active — set up a new one instead.' },
        { status: 409 }
      )
    }
    if (status.chargesEnabled !== true || status.detailsSubmitted !== true) {
      return NextResponse.json(
        { error: 'That payout account is no longer active — set up a new one instead.' },
        { status: 409 }
      )
    }

    crumb.supabase('update', 'markets')
    const { error: updateErr } = await serviceClient
      .from('markets')
      .update({
        stripe_account_id: candidate.stripeAccountId,
        stripe_onboarding_complete: true,
        stripe_charges_enabled: status.chargesEnabled === true,
        stripe_payouts_enabled: status.payoutsEnabled === true,
      })
      .eq('id', event.market_id)

    if (updateErr) {
      throw traced.fromSupabase(updateErr, { table: 'markets', operation: 'update' })
    }

    return NextResponse.json({
      ok: true,
      payout: { connected: true, onboardingComplete: true },
    })
  })
}
