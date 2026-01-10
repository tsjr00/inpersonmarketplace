import { stripe } from './config'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

/**
 * Verify webhook signature
 */
export function constructEvent(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret)
}

/**
 * Handle webhook event
 */
export async function handleWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session)
      break

    case 'payment_intent.succeeded':
      await handlePaymentSuccess(event.data.object as Stripe.PaymentIntent)
      break

    case 'payment_intent.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
      break

    case 'account.updated':
      await handleAccountUpdated(event.data.object as Stripe.Account)
      break

    case 'transfer.created':
      await handleTransferCreated(event.data.object as Stripe.Transfer)
      break

    case 'transfer.reversed':
      await handleTransferFailed(event.data.object as Stripe.Transfer)
      break

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = await createClient()
  const orderId = session.metadata?.order_id

  if (!orderId) return

  await supabase
    .from('orders')
    .update({ status: 'paid' })
    .eq('id', orderId)

  await supabase.from('payments').insert({
    order_id: orderId,
    stripe_payment_intent_id: session.payment_intent as string,
    amount_cents: session.amount_total!,
    platform_fee_cents: 0, // Will be calculated from order
    status: 'succeeded',
    paid_at: new Date().toISOString(),
  })
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const supabase = await createClient()

  await supabase
    .from('payments')
    .update({
      status: 'succeeded',
      paid_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentIntent.id)
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const supabase = await createClient()

  await supabase
    .from('payments')
    .update({ status: 'failed' })
    .eq('stripe_payment_intent_id', paymentIntent.id)
}

async function handleAccountUpdated(account: Stripe.Account) {
  const supabase = await createClient()

  await supabase
    .from('vendor_profiles')
    .update({
      stripe_charges_enabled: account.charges_enabled,
      stripe_payouts_enabled: account.payouts_enabled,
      stripe_onboarding_complete: account.details_submitted,
    })
    .eq('stripe_account_id', account.id)
}

async function handleTransferCreated(transfer: Stripe.Transfer) {
  const supabase = await createClient()
  const orderItemId = transfer.metadata?.order_item_id

  if (!orderItemId) return

  await supabase
    .from('vendor_payouts')
    .update({
      status: 'completed',
      transferred_at: new Date().toISOString(),
    })
    .eq('order_item_id', orderItemId)
}

async function handleTransferFailed(transfer: Stripe.Transfer) {
  const supabase = await createClient()
  const orderItemId = transfer.metadata?.order_item_id

  if (!orderItemId) return

  await supabase
    .from('vendor_payouts')
    .update({ status: 'failed' })
    .eq('order_item_id', orderItemId)
}
