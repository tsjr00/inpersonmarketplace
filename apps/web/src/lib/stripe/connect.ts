import { stripe } from './config'

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
    },
    {
      idempotencyKey,
    }
  )

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
