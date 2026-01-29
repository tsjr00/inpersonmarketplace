import { stripe } from './config'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'

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

    // Subscription events for premium tiers
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
      break

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
      break

    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
      break

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
      break

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceClient()

  // Check if this is a subscription checkout
  if (session.mode === 'subscription') {
    await handleSubscriptionCheckoutComplete(session)
    return
  }

  // Handle regular product checkout
  const orderId = session.metadata?.order_id
  if (!orderId) return

  // Set grace period (1 hour from now)
  const gracePeriodEndsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  await supabase
    .from('orders')
    .update({ status: 'paid', grace_period_ends_at: gracePeriodEndsAt })
    .eq('id', orderId)

  // Idempotent insert - skip if success route already created the record
  const paymentIntentId = session.payment_intent as string
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single()

  if (!existingPayment) {
    // Get platform fee from order for accurate record
    const { data: order } = await supabase
      .from('orders')
      .select('platform_fee_cents')
      .eq('id', orderId)
      .single()

    await supabase.from('payments').insert({
      order_id: orderId,
      stripe_payment_intent_id: paymentIntentId,
      amount_cents: session.amount_total!,
      platform_fee_cents: order?.platform_fee_cents || 0,
      status: 'succeeded',
      paid_at: new Date().toISOString(),
    })
  }
}

/**
 * Handle subscription checkout completion - activate premium tier
 */
async function handleSubscriptionCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceClient()

  const userId = session.metadata?.user_id
  const subscriptionType = session.metadata?.type as 'vendor' | 'buyer' | undefined
  const cycle = session.metadata?.cycle as 'monthly' | 'annual' | undefined
  const subscriptionId = session.subscription as string

  if (!userId || !subscriptionType || !subscriptionId) {
    console.error('[webhook] Missing metadata in subscription checkout:', { userId, subscriptionType, subscriptionId })
    return
  }

  console.log(`[webhook] Activating ${subscriptionType} premium for user ${userId}, subscription ${subscriptionId}`)

  // Retrieve subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentPeriodEnd = new Date((subscription as any).current_period_end * 1000).toISOString()

  if (subscriptionType === 'vendor') {
    // Update vendor profile to premium
    const { error } = await supabase
      .from('vendor_profiles')
      .update({
        tier: 'premium',
        stripe_subscription_id: subscriptionId,
        subscription_status: 'active',
        subscription_cycle: cycle,
        tier_started_at: new Date().toISOString(),
        tier_expires_at: currentPeriodEnd,
      })
      .eq('user_id', userId)

    if (error) {
      console.error('[webhook] Error updating vendor tier:', error)
    } else {
      console.log(`[webhook] Vendor ${userId} upgraded to premium`)
    }
  } else if (subscriptionType === 'buyer') {
    // Update user profile to premium buyer
    const { error } = await supabase
      .from('user_profiles')
      .update({
        buyer_tier: 'premium',
        stripe_subscription_id: subscriptionId,
        subscription_status: 'active',
        subscription_cycle: cycle,
        tier_started_at: new Date().toISOString(),
        tier_expires_at: currentPeriodEnd,
      })
      .eq('user_id', userId)

    if (error) {
      console.error('[webhook] Error updating buyer tier:', error)
    } else {
      console.log(`[webhook] Buyer ${userId} upgraded to premium`)
    }
  }
}

/**
 * Handle subscription updates (status changes, renewals)
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subData = subscription as any

  const userId = subData.metadata?.user_id
  const subscriptionType = subData.metadata?.type as 'vendor' | 'buyer' | undefined

  if (!userId || !subscriptionType) {
    console.log('[webhook] Subscription updated without user metadata:', subscription.id)
    return
  }

  const status = subscription.status
  const currentPeriodEnd = new Date(subData.current_period_end * 1000).toISOString()

  console.log(`[webhook] Subscription ${subscription.id} updated: status=${status}`)

  if (subscriptionType === 'vendor') {
    const updateData: Record<string, unknown> = {
      subscription_status: status,
      tier_expires_at: currentPeriodEnd,
    }

    // If subscription is no longer active, handle tier appropriately
    if (status === 'canceled' || status === 'unpaid') {
      // Keep premium until period ends (already set in tier_expires_at)
      // A separate job should downgrade when tier_expires_at passes
    } else if (status === 'active') {
      updateData.tier = 'premium'
    }

    await supabase
      .from('vendor_profiles')
      .update(updateData)
      .eq('user_id', userId)
  } else if (subscriptionType === 'buyer') {
    const updateData: Record<string, unknown> = {
      subscription_status: status,
      tier_expires_at: currentPeriodEnd,
    }

    if (status === 'active') {
      updateData.buyer_tier = 'premium'
    }

    await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('user_id', userId)
  }
}

/**
 * Handle subscription deletion (cancellation completed)
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subData = subscription as any

  const userId = subData.metadata?.user_id
  const subscriptionType = subData.metadata?.type as 'vendor' | 'buyer' | undefined

  if (!userId || !subscriptionType) {
    console.log('[webhook] Subscription deleted without user metadata:', subscription.id)
    return
  }

  console.log(`[webhook] Subscription ${subscription.id} deleted for ${subscriptionType} ${userId}`)

  // Downgrade to standard tier
  if (subscriptionType === 'vendor') {
    await supabase
      .from('vendor_profiles')
      .update({
        tier: 'standard',
        stripe_subscription_id: null,
        subscription_status: 'canceled',
        tier_expires_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
  } else if (subscriptionType === 'buyer') {
    await supabase
      .from('user_profiles')
      .update({
        buyer_tier: 'standard',
        stripe_subscription_id: null,
        subscription_status: 'canceled',
        tier_expires_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
  }
}

/**
 * Handle successful invoice payment (subscription renewals)
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoiceData = invoice as any
  // Only handle subscription invoices
  if (!invoiceData.subscription) return

  const supabase = createServiceClient()
  const subscriptionId = invoiceData.subscription as string

  // Get subscription to find metadata
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subData = subscription as any
  const userId = subData.metadata?.user_id
  const subscriptionType = subData.metadata?.type as 'vendor' | 'buyer' | undefined

  if (!userId || !subscriptionType) return

  const currentPeriodEnd = new Date(subData.current_period_end * 1000).toISOString()

  console.log(`[webhook] Invoice paid for ${subscriptionType} ${userId}, extends to ${currentPeriodEnd}`)

  // Update tier expiration
  if (subscriptionType === 'vendor') {
    await supabase
      .from('vendor_profiles')
      .update({
        subscription_status: 'active',
        tier_expires_at: currentPeriodEnd,
      })
      .eq('user_id', userId)
  } else if (subscriptionType === 'buyer') {
    await supabase
      .from('user_profiles')
      .update({
        subscription_status: 'active',
        tier_expires_at: currentPeriodEnd,
      })
      .eq('user_id', userId)
  }
}

/**
 * Handle failed invoice payment (renewal failures)
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoiceData = invoice as any
  // Only handle subscription invoices
  if (!invoiceData.subscription) return

  const supabase = createServiceClient()
  const subscriptionId = invoiceData.subscription as string

  // Get subscription to find metadata
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subData = subscription as any
  const userId = subData.metadata?.user_id
  const subscriptionType = subData.metadata?.type as 'vendor' | 'buyer' | undefined

  if (!userId || !subscriptionType) return

  console.log(`[webhook] Invoice payment failed for ${subscriptionType} ${userId}`)

  // Update status to past_due (Stripe will retry)
  if (subscriptionType === 'vendor') {
    await supabase
      .from('vendor_profiles')
      .update({ subscription_status: 'past_due' })
      .eq('user_id', userId)
  } else if (subscriptionType === 'buyer') {
    await supabase
      .from('user_profiles')
      .update({ subscription_status: 'past_due' })
      .eq('user_id', userId)
  }
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const supabase = createServiceClient()

  await supabase
    .from('payments')
    .update({
      status: 'succeeded',
      paid_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentIntent.id)
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const supabase = createServiceClient()

  await supabase
    .from('payments')
    .update({ status: 'failed' })
    .eq('stripe_payment_intent_id', paymentIntent.id)
}

async function handleAccountUpdated(account: Stripe.Account) {
  const supabase = createServiceClient()

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
  const supabase = createServiceClient()
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
  const supabase = createServiceClient()
  const orderItemId = transfer.metadata?.order_item_id

  if (!orderItemId) return

  await supabase
    .from('vendor_payouts')
    .update({ status: 'failed' })
    .eq('order_item_id', orderItemId)
}
