/**
 * Webhook Error Catalog (PRK-12)
 *
 * Error codes raised by Stripe webhook handlers (market box + park spot
 * checkout-complete branches). These all fire AFTER the buyer was charged,
 * so every entry is a money-reconciliation signal.
 */

import { ErrorCatalogEntry } from '../types'

export const WEBHOOK_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'ERR_WEBHOOK_011',
    title: 'Checkout-Complete Handler Critical Failure',
    category: 'STRIPE',
    severity: 'high',
    description: 'A checkout.session.completed handler hit a critical failure after payment. Two known sources: a market box subscription RPC failed AND its auto-refund also failed (buyer charged, nothing delivered, manual refund needed); or a park_spot session arrived without a group_id in metadata (cannot match bookings).',
    userGuidance: '',
    causes: [
      'Market box: subscribe RPC error followed by a refund failure — manual refund required',
      'Park spot: Stripe session metadata missing group_id (checkout-creation bug or stripped metadata)',
    ],
    solutions: [
      'Market box: refund the payment intent in the Stripe dashboard, then investigate the RPC error',
      'Park spot: find the session in Stripe, identify the booking group from the success URL, reconcile manually',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_WEBHOOK_012',
    title: 'Paid Session Unmatched (No Bookings for Group)',
    category: 'STRIPE',
    severity: 'high',
    description: 'A park_spot payment completed but no park_spot_bookings rows exist for its booking_group_id — buyer charged, nothing to flip. Typically the pay-route linkage update failed (hardened by PRK-6) or rows were deleted.',
    userGuidance: '',
    causes: [
      'Group-linkage update failed after session creation (pre-PRK-6 builds)',
      'Booking rows deleted between checkout start and webhook delivery',
    ],
    solutions: [
      'Find the charge in Stripe by session id; refund or manually create/flip the booking',
      'Check error_logs for the paired linkage-update failure',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_WEBHOOK_013',
    title: 'Park Booking Paid-Flip Failed',
    category: 'STRIPE',
    severity: 'high',
    description: 'The park_spot bookings status update (pending_payment → paid) failed after a successful payment. The handler throws, so Stripe retries the webhook — usually self-heals.',
    userGuidance: '',
    causes: [
      'Transient database error during the update',
    ],
    solutions: [
      'Stripe retries automatically; if the error persists, check the DB error in the message and flip the group manually',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_WEBHOOK_014',
    title: 'Paid Session With No Pending Rows',
    category: 'STRIPE',
    severity: 'high',
    description: 'A park_spot group was paid in Stripe but none of its bookings are pending_payment (all cancelled/expired meanwhile). The handler never silently re-activates — the money needs a human decision (refund vs honor).',
    userGuidance: '',
    causes: [
      'Stale checkout session completed after the sweep released the occurrence (hardened by PRK-1 session-expire)',
      'Manager/system cancelled the bookings between checkout start and payment',
    ],
    solutions: [
      'Decide refund vs honor: refund the payment intent, or re-activate the booking rows if the slot is still free',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_WEBHOOK_015',
    title: 'Park Paid-Confirmation Notifications Failed',
    category: 'STRIPE',
    severity: 'medium',
    description: 'The park_spot payment was recorded (bookings flipped to paid) but the vendor/operator confirmation notifications failed. Money is safe; communication was not sent.',
    userGuidance: '',
    causes: [
      'Notification service or email provider error after the paid flip',
    ],
    solutions: [
      'No money action needed; optionally notify the truck/operator manually for the group in the message',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_WEBHOOK_016',
    title: 'Stripe Fee Capture Failed',
    category: 'STRIPE',
    severity: 'low',
    description: 'After a successful checkout, retrieving the charge\'s actual Stripe fee (balance_transaction.fee) to store on the payment row failed. NOT a money-safety issue — the payment, order, and payouts are unaffected. The report layer falls back to the 2.9%+$0.30 estimate for this order until the fee is captured.',
    userGuidance: '',
    causes: [
      'Transient Stripe API error on paymentIntents.retrieve',
      'balance_transaction still pending at webhook time (async payment method)',
    ],
    solutions: [
      'No action needed — reports use the estimate meanwhile',
      'Run POST /api/admin/backfill-stripe-fees to re-attempt fee capture for rows still missing it',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_WEBHOOK_017',
    title: 'Payment Landed on Dead Order (Auto-Refund Path)',
    category: 'STRIPE',
    severity: 'high',
    description: 'checkout.session.completed arrived for an order that is cancelled/refunded (or missing entirely). CHK-1 3-way branch: the payment row IS recorded, the order is NOT flipped paid, and a full-charge auto-refund is initiated with the deterministic key {orderId}-dead-order (shared with checkout/success — double-refund impossible). A CRITICAL variant of this code means the refund call itself failed and a manual refund is needed.',
    userGuidance: '',
    causes: [
      'Stale checkout tab paid after cleanup/cron/reject cancelled the order (session-expire race)',
      'Cleanup cancelled the order between this handler\'s status read and its guarded flip',
      'Unknown-order variant: session metadata references an order row that does not exist',
    ],
    solutions: [
      'Non-CRITICAL: verify the refund appears in Stripe; charge.refunded will mark the order refunded — no action needed',
      'CRITICAL variant: manually refund the payment intent in the Stripe dashboard for the amount in the message',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_WEBHOOK_018',
    title: 'Superseded Subscription Cancel Failed',
    category: 'STRIPE',
    severity: 'low',
    description: 'S8-1: after a vendor upgraded/switched tiers and the NEW subscription activated, cancelling the OLD subscription they switched away from failed. No money at risk — the vendor is on the correct new tier; the stale old subscription will bill until it expires or is cancelled manually.',
    userGuidance: '',
    causes: [
      'Transient Stripe API error on subscriptions.cancel',
      'Old subscription already cancelled/deleted in Stripe',
    ],
    solutions: [
      'Verify in Stripe whether the old subscription id in the message is still active; if so, cancel it manually',
      'No buyer/vendor-facing action needed — the vendor already holds the correct tier',
    ],
    pgCodes: [],
  },
  {
    code: 'ERR_WEBHOOK_019',
    title: 'Community Chip In Ledger Write Failed',
    category: 'STRIPE',
    severity: 'low',
    description: 'On a paid order carrying a Community Chip In contribution (mig 213), writing the cause_ledger "collected" row failed (non-23505). No money at risk — the chip-in was already collected into the platform balance and is fully reconcilable from orders.chipin_amount_cents / chipin_beneficiary_id; only the ledger accrual is missing, so the order is under-counted in the beneficiary\'s outstanding balance until backfilled.',
    userGuidance: '',
    causes: [
      'Transient DB error on the cause_ledger insert',
      'mig 213 not yet applied on this environment (cause_ledger absent)',
      'Beneficiary row removed between checkout and settlement (FK RESTRICT)',
    ],
    solutions: [
      'Backfill a collected cause_ledger row for the order in the message (beneficiary_id + amount from the order row)',
      'Confirm mig 213 is applied on this environment',
    ],
    pgCodes: [],
  },
]
