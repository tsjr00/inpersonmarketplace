import { stripe } from './config'

export interface SeasonCheckoutSessionState {
  /** Stripe Checkout Session.payment_status: 'paid' | 'unpaid' | 'no_payment_required' */
  paymentStatus: string | null
  /** Stripe Checkout Session.status: 'open' | 'complete' | 'expired' */
  status: string | null
  paymentIntentId: string | null
}

/**
 * Retrieve the current state of a season booth checkout session from Stripe.
 *
 * Used by the expire-orders Phase 18 reconciliation to decide confirm-vs-cancel
 * for a booth_booking_groups row stuck in pending_payment: Stripe is the source
 * of truth, so a group is never cancelled on a timer alone while it holds a
 * session id (avoids the F1 class of bug).
 */
export async function getSeasonCheckoutSessionState(
  sessionId: string,
): Promise<SeasonCheckoutSessionState> {
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  const pi = session.payment_intent
  const paymentIntentId = typeof pi === 'string' ? pi : pi?.id ?? null
  return {
    paymentStatus: session.payment_status ?? null,
    status: session.status ?? null,
    paymentIntentId,
  }
}
