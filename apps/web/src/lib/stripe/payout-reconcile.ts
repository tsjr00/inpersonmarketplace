/**
 * Payout reconciliation helper (S3-1).
 *
 * The expire-orders Phase-5 retry re-sends vendor_payouts rows in status
 * 'failed'. H-9 flips stale 'processing' payouts — which KEEP their
 * stripe_transfer_id — to 'failed' after 7 days. A row in that state may
 * represent a transfer that ALREADY succeeded (its transfer.created webhook was
 * missed). Re-sending with the deterministic idempotency key after Stripe's key
 * TTL (~24h) has lapsed creates a SECOND real transfer → the platform
 * double-pays the vendor.
 *
 * Before re-sending any 'failed' payout that carries a stripe_transfer_id, the
 * cron asks Stripe whether that transfer exists and classifies it. The verdict
 * fails SAFE — it only greenlights a re-send when Stripe positively confirms no
 * live transfer exists.
 */

import { stripe } from './config'

export type TransferVerdict =
  | 'live'          // transfer exists and is not (fully) reversed — money already moved; DO NOT re-send
  | 'reversed'      // transfer exists but was fully reversed — ambiguous (refund/clawback); needs human review
  | 'missing'       // Stripe has no such transfer — the id is stale; a re-send is safe
  | 'unverifiable'  // Stripe could not be reached / transient error — cannot confirm; DO NOT re-send this run

/**
 * Classify an existing vendor_payouts.stripe_transfer_id against Stripe.
 * Only 'missing' authorizes a re-send; every other verdict means the caller
 * must NOT re-send (avoiding the S3-1 double-pay).
 */
export async function classifyExistingTransfer(transferId: string): Promise<TransferVerdict> {
  if (!stripe) return 'unverifiable'
  try {
    const transfer = await stripe.transfers.retrieve(transferId)
    if (!transfer) return 'missing'
    const amount = transfer.amount ?? 0
    const amountReversed = transfer.amount_reversed ?? 0
    if (amount > 0 && amountReversed >= amount) return 'reversed'
    return 'live'
  } catch (err) {
    // Stripe returns resource_missing / HTTP 404 when the id is not a real
    // transfer — that (and only that) makes a re-send safe.
    const e = err as { code?: string; statusCode?: number }
    if (e?.code === 'resource_missing' || e?.statusCode === 404) return 'missing'
    // Any other error (network, rate limit, auth) leaves the true state unknown.
    // Fail safe: treat as unverifiable so the caller skips the re-send this run.
    return 'unverifiable'
  }
}
