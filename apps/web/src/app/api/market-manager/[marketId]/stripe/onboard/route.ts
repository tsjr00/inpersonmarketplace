import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import {
  createMarketConnectAccount,
  createAccountLink,
  getAccountStatus,
} from '@/lib/stripe/connect'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import Stripe from 'stripe'

/**
 * POST /api/market-manager/[marketId]/stripe/onboard
 *
 * Phase C Stage 2 (2026-05-17). Mirror of /api/vendor/stripe/onboard
 * for the manager-side "market" Stripe Connect account. Creates or
 * resumes onboarding for the market's Connect Express account.
 *
 * Auth chain:
 *   1. Authenticated user
 *   2. isMarketManager(marketId, user) — dual-key (manager_user_id or
 *      manager_email match)
 *
 * Flow (matches vendor pattern):
 *   1. Fetch the market row + vertical_id.
 *   2. If markets.stripe_account_id is set, validate it on Stripe; if
 *      Stripe 404s, clear the columns and treat as fresh onboarding.
 *   3. If no account, create one via createMarketConnectAccount and
 *      persist the account ID. (Idempotency key prevents dupes on retry.)
 *   4. Generate a hosted account link (refresh + return URLs both point
 *      to the manager dashboard with a query flag so the dashboard card
 *      can trigger a status sync on return).
 *   5. Return { url } for the client to redirect to.
 *
 * No webhook needed at this stage — status syncs lazily via the
 * companion /stripe/status GET endpoint.
 *
 * No critical-path files touched. No new tables. Mig 141 (markets
 * stripe_* columns) must be applied — currently Dev + Staging only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/stripe/onboard', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm-stripe-onboard:${clientIp}`, rateLimits.submit)
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

    // user.email is guaranteed when the auth.getUser() succeeded for an
    // email-verified Supabase user. Belt-and-suspenders check below.
    if (!user.email) {
      return NextResponse.json(
        { error: 'Your account has no email on file — required for Stripe onboarding' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await serviceClient
      .from('markets')
      .select('id, name, vertical_id, status, stripe_account_id')
      .eq('id', marketId)
      .maybeSingle()

    if (marketErr) {
      throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    }
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    // Stripe Connect is locked until admin approves the market.
    // Otherwise a fraudulent intake could route booth-rental payments
    // away from the legitimate manager before the duplicate gets caught.
    // Status 'pending' = waiting for admin review; anything else
    // (active, suspended, etc.) is treated as approved for this gate.
    const marketStatus = (market.status as string | null) || 'active'
    if (marketStatus === 'pending') {
      return NextResponse.json(
        {
          error:
            "Stripe Connect is locked until your market is approved by the platform. We're reviewing your intake — usually within one business day. Once approved, you can connect a Stripe account to receive booth rental payments.",
        },
        { status: 403 }
      )
    }

    let stripeAccountId = market.stripe_account_id as string | null

    // If we have a stored Stripe account, verify it still exists at
    // Stripe. If Stripe says no (404), clear our columns and proceed
    // as if onboarding fresh. Matches vendor flow's defensive handling.
    if (stripeAccountId) {
      try {
        await getAccountStatus(stripeAccountId)
      } catch (validationError) {
        if (
          validationError instanceof Stripe.errors.StripeInvalidRequestError &&
          validationError.statusCode === 404
        ) {
          console.error(
            `[market-manager/stripe/onboard] Stripe account ${stripeAccountId} not found for market ${marketId} — clearing`
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
            .eq('id', marketId)
        } else {
          throw validationError
        }
      }
    }

    // No account on file (fresh or just-cleared) — create one.
    if (!stripeAccountId) {
      const account = await createMarketConnectAccount(user.email, marketId)
      stripeAccountId = account.id

      crumb.supabase('update', 'markets')
      const { error: updateErr } = await serviceClient
        .from('markets')
        .update({ stripe_account_id: stripeAccountId })
        .eq('id', marketId)

      if (updateErr) {
        throw traced.fromSupabase(updateErr, { table: 'markets', operation: 'update' })
      }
    }

    // Generate the hosted onboarding link.
    const baseUrl = request.nextUrl.origin
    const vertical = (market.vertical_id as string) || 'farmers_market'
    const refreshUrl = `${baseUrl}/${vertical}/market-manager/${marketId}/dashboard?stripe=refresh`
    const returnUrl = `${baseUrl}/${vertical}/market-manager/${marketId}/dashboard?stripe=complete`

    try {
      const accountLink = await createAccountLink(stripeAccountId, refreshUrl, returnUrl)
      return NextResponse.json({ url: accountLink.url })
    } catch (error) {
      console.error('[market-manager/stripe/onboard] Account link creation failed:', error)
      return NextResponse.json(
        { error: 'Failed to create onboarding link. Please try again.' },
        { status: 500 }
      )
    }
  })
}
