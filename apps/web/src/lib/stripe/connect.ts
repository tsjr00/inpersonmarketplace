import { stripe } from './config'

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
