import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { getAccountStatus } from '@/lib/stripe/connect'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import Stripe from 'stripe'

/**
 * GET /api/market-manager/[marketId]/stripe/status
 *
 * Phase C Stage 2 (2026-05-17). Mirror of /api/vendor/stripe/status
 * for the manager-side "market" Stripe Connect account. Polled by the
 * manager dashboard card (Step 2.4) to display + sync Connect state.
 *
 * Lazy-sync model — every call hits Stripe for the latest state and
 * writes back to markets.stripe_charges_enabled / stripe_payouts_enabled
 * / stripe_onboarding_complete. No webhook required at this stage;
 * webhooks become useful in Stage 3 (`account.updated` events for
 * real-time status changes during a booking checkout flow).
 *
 * Auth chain (same as onboard route):
 *   1. Authenticated user
 *   2. isMarketManager(marketId, user)
 *
 * Response shape:
 *   200 → { connected: false }   when stripe_account_id is null
 *   200 → { connected: false }   when Stripe says the account doesn't exist
 *                                 (cleared in DB at the same time)
 *   200 → {
 *     connected: true,
 *     chargesEnabled, payoutsEnabled, detailsSubmitted, requirements
 *   }
 *   401 → not authenticated
 *   403 → caller is not the manager of this market
 *   404 → market not found
 *   500 → Stripe error (other than 404 on the account)
 *
 * No critical-path files touched. No mutations beyond syncing the three
 * stripe_* boolean columns on `markets`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/stripe/status', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm-stripe-status:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId } = await params

    crumb.auth('Checking market manager auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) {
      return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })
    }

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await serviceClient
      .from('markets')
      .select('id, stripe_account_id')
      .eq('id', marketId)
      .maybeSingle()

    if (marketErr) {
      throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    }
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    const stripeAccountId = market.stripe_account_id as string | null
    if (!stripeAccountId) {
      return NextResponse.json({ connected: false })
    }

    try {
      const status = await getAccountStatus(stripeAccountId)

      // Sync the latest Stripe state into the DB so the dashboard
      // doesn't need to call Stripe on every page render (only the
      // status endpoint does that).
      crumb.supabase('update', 'markets')
      await serviceClient
        .from('markets')
        .update({
          stripe_charges_enabled: status.chargesEnabled,
          stripe_payouts_enabled: status.payoutsEnabled,
          stripe_onboarding_complete: status.detailsSubmitted,
        })
        .eq('id', marketId)

      return NextResponse.json({
        connected: true,
        chargesEnabled: status.chargesEnabled,
        payoutsEnabled: status.payoutsEnabled,
        detailsSubmitted: status.detailsSubmitted,
        requirements: status.requirements,
      })
    } catch (error) {
      // Stripe says the account no longer exists — clear our reference
      // so the next onboard call creates a fresh account.
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.statusCode === 404
      ) {
        console.error(
          `[market-manager/stripe/status] Stripe account ${stripeAccountId} not found for market ${marketId} — clearing`
        )
        crumb.supabase('update', 'markets')
        await serviceClient
          .from('markets')
          .update({
            stripe_account_id: null,
            stripe_charges_enabled: false,
            stripe_payouts_enabled: false,
            stripe_onboarding_complete: false,
          })
          .eq('id', marketId)

        return NextResponse.json({ connected: false })
      }

      console.error('[market-manager/stripe/status] Stripe status check error:', error)
      return NextResponse.json(
        { error: 'Failed to check Stripe account status. Please try again.' },
        { status: 500 }
      )
    }
  })
}
