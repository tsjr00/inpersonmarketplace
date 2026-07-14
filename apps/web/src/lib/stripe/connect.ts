import { stripe } from './config'
import { TracedError, logError } from '@/lib/errors'

/**
 * Create Stripe Connect Express account for a MARKET (manager-side).
 *
 * Phase C Stage 2 (2026-05-17). Separate from `createConnectAccount`
 * (vendor-side) so the idempotency keys don't collide when the same
 * human is both a vendor and a manager — they get distinct Connect
 * accounts under different keys. Same SDK call otherwise.
 *
 * Idempotency key: `connect-account-market-${marketId}` — deterministic,
 * safe to retry on network failure without creating dupes.
 */
export async function createMarketConnectAccount(email: string, marketId: string) {
  const idempotencyKey = `connect-account-market-${marketId}`

  const account = await stripe.accounts.create(
    {
      type: 'express',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    },
    {
      idempotencyKey,
    }
  )

  return account
}

/**
 * Create Stripe Connect Express account for vendor
 * Uses idempotency key to prevent duplicate accounts on retry
 *
 * Payout protection stack (decision 2026-07-13) — VENDOR accounts only
 * (market/operator accounts above are intentionally untouched):
 * - delay_days: 3 — each transfer rests 3 days before becoming payable to
 *   the vendor's bank (rolling recovery window for recent sales).
 * - $50 minimum Connect balance — automatic payouts sweep only funds above
 *   $50, leaving a permanent recovery floor (Balance Settings API; no
 *   first-class SDK resource in stripe-node v20, so rawRequest).
 * Both back the VOR-6(B) fee-ledger clawback for refunds on paid-out items.
 */
export async function createConnectAccount(email: string, vendorProfileId?: string) {
  // Use vendorProfileId if available for more precise idempotency
  const idempotencyKey = vendorProfileId
    ? `connect-account-${vendorProfileId}`
    : `connect-account-${email.toLowerCase()}`

  const account = await stripe.accounts.create(
    {
      type: 'express',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      settings: {
        payouts: {
          schedule: { interval: 'daily', delay_days: 3 },
        },
      },
    },
    {
      idempotencyKey,
    }
  )

  // $50 minimum balance — best-effort: a failure must not block onboarding,
  // but must be diagnosable (error_logs) so it can be applied manually.
  try {
    await stripe.rawRequest(
      'POST',
      '/v1/balance_settings',
      { payments: { payouts: { minimum_balance_by_currency: { usd: 5000 } } } },
      { stripeAccount: account.id }
    )
  } catch (balErr) {
    await logError(new TracedError('ERR_STRIPE_001', `Failed to set $50 minimum balance on new vendor Connect account ${account.id}: ${balErr instanceof Error ? balErr.message : String(balErr)}`, {
      route: 'lib/stripe/connect', method: 'createConnectAccount',
    }))
  }

  return account
}

/**
 * Create account link for vendor onboarding
 */
export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
) {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  })

  return accountLink
}

/**
 * Check account status
 */
export async function getAccountStatus(accountId: string) {
  const account = await stripe.accounts.retrieve(accountId)

  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requirements: account.requirements,
  }
}
