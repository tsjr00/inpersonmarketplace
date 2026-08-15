import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { eventRefColumn } from '@/lib/events/event-ref'
import {
  createMarketConnectAccount,
  createAccountLink,
  getAccountStatus,
} from '@/lib/stripe/connect'
import Stripe from 'stripe'

/**
 * POST /api/events/[token]/stripe/onboard
 *
 * Organizer variant of /api/market-manager/[marketId]/stripe/onboard (Phase C
 * Stage 2) — same flow, organizer auth instead of manager auth. Event Vendor
 * Fees land on the event MARKET's Connect account (`markets.stripe_account_id`,
 * mig 141): event markets ARE markets rows, so the manager machinery is reused
 * wholesale; only WHO may onboard differs.
 *
 * Called lazily (decision 8b, 2026-08-14): only reachable from the fee-setup
 * card, which sends the organizer here when they try to set a fee with no
 * payout account. The hosted Stripe link expires in minutes and is single-use
 * — durability comes from THIS route minting a fresh link on every click of
 * the dashboard button (mig 218's lesson: never email the Stripe link itself).
 *
 * Auth: the event's organizer (organizer_user_id match). Post-approval only —
 * pre-approval events have no market row to attach the account to.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/stripe/onboard', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-stripe-onboard:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    crumb.auth('Checking organizer auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    if (!user.email) {
      return NextResponse.json(
        { error: 'Your account has no email on file — required for Stripe onboarding' },
        { status: 400 }
      )
    }

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
      return NextResponse.json(
        { error: 'Payout setup opens once your event is approved.' },
        { status: 409 }
      )
    }

    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await serviceClient
      .from('markets')
      .select('id, vertical_id, stripe_account_id')
      .eq('id', event.market_id)
      .maybeSingle()

    if (marketErr) {
      throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    }
    if (!market) {
      return NextResponse.json({ error: 'Event market not found' }, { status: 404 })
    }

    let stripeAccountId = market.stripe_account_id as string | null

    // Stored account may have been deleted at Stripe — verify, clear on 404,
    // proceed as fresh (mirrors the manager + vendor flows).
    if (stripeAccountId) {
      try {
        await getAccountStatus(stripeAccountId)
      } catch (validationError) {
        if (
          validationError instanceof Stripe.errors.StripeInvalidRequestError &&
          validationError.statusCode === 404
        ) {
          console.error(
            `[events/stripe/onboard] Stripe account ${stripeAccountId} not found for market ${event.market_id} — clearing`
          )
          stripeAccountId = null
          crumb.supabase('update', 'markets')
          await serviceClient
            .from('markets')
            .update({
              stripe_account_id: null,
              stripe_charges_enabled: false,
              stripe_payouts_enabled: false,
              stripe_onboarding_complete: false,
            })
            .eq('id', event.market_id)
        } else {
          throw validationError
        }
      }
    }

    if (!stripeAccountId) {
      const account = await createMarketConnectAccount(user.email, event.market_id)
      stripeAccountId = account.id

      crumb.supabase('update', 'markets')
      const { error: updateErr } = await serviceClient
        .from('markets')
        .update({ stripe_account_id: stripeAccountId })
        .eq('id', event.market_id)

      if (updateErr) {
        throw traced.fromSupabase(updateErr, { table: 'markets', operation: 'update' })
      }
    }

    // Refresh/return land back on the organizer's event dashboard, which is
    // keyed by catering_requests.id (not token — pre-approval has none, and
    // the dashboard accepts id always).
    const baseUrl = request.nextUrl.origin
    const vertical = (event.vertical_id as string) || 'farmers_market'
    const refreshUrl = `${baseUrl}/${vertical}/event-manager/${event.id}/dashboard?stripe=refresh`
    const returnUrl = `${baseUrl}/${vertical}/event-manager/${event.id}/dashboard?stripe=complete`

    try {
      const accountLink = await createAccountLink(stripeAccountId, refreshUrl, returnUrl)
      return NextResponse.json({ url: accountLink.url })
    } catch (error) {
      console.error('[events/stripe/onboard] Account link creation failed:', error)
      return NextResponse.json(
        { error: 'Failed to create onboarding link. Please try again.' },
        { status: 500 }
      )
    }
  })
}
