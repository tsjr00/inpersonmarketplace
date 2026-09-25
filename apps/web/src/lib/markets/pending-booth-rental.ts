/**
 * "Continue payment" for a pending one-off booth week — the decision (PURE).
 *
 * THE PROBLEM (OB-030 D1, tester 2026-09-25): a vendor who leaves the Stripe
 * page keeps a `pending_payment` row, and UNIQUE (vendor, market, week) then
 * refuses every new booking of that week. There was no way back to the payment
 * page, and the only release was the daily Prod sweep 24h+ later (never on
 * Staging).
 *
 * THE RULE (owner 2026-09-25)
 *   - Stripe page still OPEN → send the vendor back to THAT page. Never a second
 *     session: one session can be paid at most once, and the webhook only flips
 *     pending → paid (webhooks.ts), so resuming can never double-charge.
 *   - Stripe says COMPLETE → the money is in; the webhook confirms the week.
 *     Touch nothing.
 *   - Stripe page EXPIRED → it can never be paid. Release the booking (status
 *     cancelled + any reserved booth credit returned) so the vendor can book the
 *     week again. Owner ruling (a): BR-10 forbids a vendor cancelling a PAID
 *     week; an expired UNPAID booking carries no money and is released.
 *   - No Stripe page was ever created → not payable here; the sweep owns it.
 *   Anything else (paid, cancelled, a season week) is not this flow's business.
 */

export type PendingRentalAction =
  | { action: 'resume'; checkoutUrl: string }
  | { action: 'confirming' }
  | { action: 'release' }
  | { action: 'already_paid' }
  | { action: 'refuse'; status: 404 | 409; message: string }

export interface PendingRentalInput {
  status: string
  groupId: string | null
  sessionId: string | null
}

export interface CheckoutSessionState {
  /** Stripe Checkout Session.status: 'open' | 'complete' | 'expired' */
  status: string | null
  url: string | null
}

/** Step 1 — can this row be resumed at all, before asking Stripe? */
export function precheckPendingRental(r: PendingRentalInput): PendingRentalAction | null {
  if (r.status === 'paid') return { action: 'already_paid' }
  if (r.status !== 'pending_payment') {
    return { action: 'refuse', status: 409, message: 'This booking is no longer waiting for payment. Book the week again if you still want it.' }
  }
  if (r.groupId) {
    return { action: 'refuse', status: 409, message: 'This week is part of a season purchase — finish or restart the season from the booking page.' }
  }
  if (!r.sessionId) {
    return { action: 'refuse', status: 409, message: 'This booking never reached the payment page. It is released automatically within a day — or ask the market manager to release it sooner.' }
  }
  return null
}

/** Step 2 — what Stripe says decides the rest. */
export function decideFromSession(s: CheckoutSessionState): PendingRentalAction {
  if (s.status === 'open' && s.url) return { action: 'resume', checkoutUrl: s.url }
  if (s.status === 'complete') return { action: 'confirming' }
  if (s.status === 'expired') return { action: 'release' }
  return { action: 'refuse', status: 409, message: 'We could not read this payment from Stripe. Please try again in a minute.' }
}
