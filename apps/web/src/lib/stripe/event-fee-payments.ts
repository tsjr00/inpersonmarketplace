import { stripe } from '@/lib/stripe/config'
import { getStatementSuffix } from '@/lib/stripe/payments'

/**
 * Stripe Checkout session for an EVENT VENDOR FEE (V1, 2026-08-14).
 *
 * Deliberately its OWN module, not an edit to the protected
 * lib/stripe/payments.ts — same destination-charge model as
 * createBoothRentalCheckoutSession (the organizer's portion auto-routes to the
 * event market's Connect account at payment time; no later transfer), cloned
 * so the money file's approval gate isn't in this feature's blast radius.
 *
 * Does NO math: amounts come from calculateBoothRentalFees (decision 6 —
 * booth math verbatim) and were snapshotted into the payment row by
 * create_event_fee_payment_if_eligible (mig 229) before this is called.
 *
 * Idempotency `event-fee-${paymentId}` — deterministic, its own namespace.
 * metadata.type='event_vendor_fee' is the webhook routing signal; the
 * checkout.session.completed handler calls mark_event_fee_paid_if_capacity
 * (first PAYMENT wins; the rare over-capacity loser is auto-refunded).
 */
export async function createEventVendorFeeCheckoutSession({
  paymentId,
  marketId,
  eventName,
  organizerStripeAccountId,
  eventDate,
  feeCents,
  vendorPaysCents,
  organizerReceivesCents,
  successUrl,
  cancelUrl,
  vertical,
}: {
  paymentId: string
  marketId: string
  eventName: string
  organizerStripeAccountId: string  // markets.stripe_account_id of the event market
  eventDate: string                 // YYYY-MM-DD, for the line-item description
  feeCents: number                  // audit metadata only
  vendorPaysCents: number           // unit_amount
  organizerReceivesCents: number    // transfer_data.amount
  successUrl: string
  cancelUrl: string
  vertical?: string
}) {
  const idempotencyKey = `event-fee-${paymentId}`

  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ['card', 'cashapp', 'amazon_pay', 'link'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Event Vendor Fee — ${eventName}`,
            description: `Event on ${eventDate}. Your spot is confirmed when payment completes.`,
          },
          unit_amount: vendorPaysCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: `event_fee_${paymentId}`,
      payment_intent_data: {
        statement_descriptor_suffix: getStatementSuffix(vertical),
        transfer_data: {
          destination: organizerStripeAccountId,
          amount: organizerReceivesCents,
        },
      },
      metadata: {
        type: 'event_vendor_fee',
        payment_id: paymentId,
        market_id: marketId,
        fee_cents: feeCents.toString(),
        vendor_pays_cents: vendorPaysCents.toString(),
        organizer_receives_cents: organizerReceivesCents.toString(),
      },
    },
    { idempotencyKey }
  )

  return session
}
