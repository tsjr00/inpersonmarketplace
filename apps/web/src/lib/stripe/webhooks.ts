import { stripe } from './config'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { sendNotification } from '@/lib/notifications'
import { TracedError } from '@/lib/errors/traced-error'
import { logError } from '@/lib/errors/logger'
import { crumb } from '@/lib/errors/breadcrumbs'

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
      crumb.stripe(`Unhandled event type: ${event.type}`)
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceClient()

  // Check if this is a subscription checkout
  if (session.mode === 'subscription') {
    await handleSubscriptionCheckoutComplete(session)
    return
  }

  // Check if this is a market box purchase
  if (session.metadata?.type === 'market_box') {
    await handleMarketBoxCheckoutComplete(session)
    return
  }

  // Handle regular product checkout (may include market box items)
  const orderId = session.metadata?.order_id
  if (!orderId) return

  // Update order status to paid
  // Note: grace_period_ends_at column doesn't exist - calculate from created_at when needed
  await supabase
    .from('orders')
    .update({ status: 'paid' })
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
      .select('platform_fee_cents, buyer_user_id')
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

    // Process market box subscriptions from unified checkout (idempotent)
    if (session.metadata?.has_market_boxes === 'true' && session.metadata?.market_box_items && order?.buyer_user_id) {
      try {
        const marketBoxItems = JSON.parse(session.metadata.market_box_items) as Array<{
          offeringId: string
          termWeeks: number
          startDate?: string
          priceCents: number
        }>

        for (const mbItem of marketBoxItems) {
          const { data: existingSub } = await supabase
            .from('market_box_subscriptions')
            .select('id')
            .eq('offering_id', mbItem.offeringId)
            .eq('buyer_user_id', order.buyer_user_id)
            .eq('order_id', orderId)
            .single()

          if (!existingSub) {
            await supabase
              .from('market_box_subscriptions')
              .insert({
                offering_id: mbItem.offeringId,
                buyer_user_id: order.buyer_user_id,
                order_id: orderId,
                total_paid_cents: mbItem.priceCents,
                start_date: mbItem.startDate || new Date().toISOString().split('T')[0],
                term_weeks: mbItem.termWeeks,
                status: 'active',
                weeks_completed: 0,
                stripe_payment_intent_id: paymentIntentId,
              })
          }
        }
        crumb.stripe(`Created ${marketBoxItems.length} market box subscription(s) for order ${orderId}`)
      } catch {
        await logError(new TracedError('ERR_WEBHOOK_007', 'Failed to parse market box items metadata', { route: '/webhooks/stripe', method: 'POST' }))
      }
    }
  }
}

/**
 * Handle subscription checkout completion - activate premium tier
 */
async function handleSubscriptionCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceClient()

  const userId = session.metadata?.user_id
  const subscriptionType = session.metadata?.type as 'vendor' | 'buyer' | 'food_truck_vendor' | undefined
  const cycle = session.metadata?.cycle as 'monthly' | 'annual' | undefined
  const subscriptionId = session.subscription as string

  if (!userId || !subscriptionType || !subscriptionId) {
    await logError(new TracedError('ERR_WEBHOOK_001', 'Missing metadata in subscription checkout', { route: '/webhooks/stripe', method: 'POST' }))
    return
  }

  crumb.stripe(`Activating ${subscriptionType} premium for user ${userId}, subscription ${subscriptionId}`)

  // Retrieve subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentPeriodEnd = new Date((subscription as any).current_period_end * 1000).toISOString()

  if (subscriptionType === 'vendor' || subscriptionType === 'food_truck_vendor') {
    // Determine tier from metadata — FT uses basic/pro/boss, FM defaults to premium
    const targetTier = session.metadata?.tier || 'premium'
    const vertical = session.metadata?.vertical || ''

    // Update vendor profile
    let vpQuery = supabase
      .from('vendor_profiles')
      .update({
        tier: targetTier,
        stripe_subscription_id: subscriptionId,
        subscription_status: 'active',
        subscription_cycle: cycle,
        tier_started_at: new Date().toISOString(),
        tier_expires_at: currentPeriodEnd,
      })
      .eq('user_id', userId)
    if (vertical) {
      vpQuery = vpQuery.eq('vertical_id', vertical)
    }
    const { error } = await vpQuery

    if (error) {
      await logError(new TracedError('ERR_WEBHOOK_002', 'Failed to update vendor tier', { route: '/webhooks/stripe', method: 'POST', userId }))
    } else {
      crumb.stripe(`Vendor ${userId} upgraded to ${targetTier}`)
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
      await logError(new TracedError('ERR_WEBHOOK_003', 'Failed to update buyer tier', { route: '/webhooks/stripe', method: 'POST', userId }))
    } else {
      crumb.stripe(`Buyer ${userId} upgraded to premium`)
    }
  }
}

/**
 * Handle market box checkout completion - create subscription
 */
async function handleMarketBoxCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceClient()

  const offeringId = session.metadata?.offering_id
  const userId = session.metadata?.user_id
  const termWeeks = parseInt(session.metadata?.term_weeks || '4', 10)
  const startDate = session.metadata?.start_date
  const priceCents = parseInt(session.metadata?.price_cents || '0', 10)
  const paymentIntentId = session.payment_intent as string

  if (!offeringId || !userId || !startDate) {
    await logError(new TracedError('ERR_WEBHOOK_004', 'Missing metadata in market box checkout', { route: '/webhooks/stripe', method: 'POST' }))
    return
  }

  crumb.stripe(`Creating market box subscription for user ${userId}, offering ${offeringId}`)

  // Check if subscription already exists (idempotency)
  const { data: existing } = await supabase
    .from('market_box_subscriptions')
    .select('id')
    .eq('offering_id', offeringId)
    .eq('buyer_user_id', userId)
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single()

  if (existing) {
    crumb.stripe(`Market box subscription already exists: ${existing.id}`)
    return
  }

  // Create the market box subscription
  const { data: subscription, error: subError } = await supabase
    .from('market_box_subscriptions')
    .insert({
      offering_id: offeringId,
      buyer_user_id: userId,
      total_paid_cents: priceCents,
      start_date: startDate,
      term_weeks: termWeeks,
      status: 'active',
      weeks_completed: 0,
      stripe_payment_intent_id: paymentIntentId,
    })
    .select()
    .single()

  if (subError) {
    await logError(new TracedError('ERR_WEBHOOK_005', 'Failed to create market box subscription', { route: '/webhooks/stripe', method: 'POST', userId }))
    return
  }

  crumb.stripe(`Market box subscription created: ${subscription.id}`)

  // Pickups are auto-created by the database trigger
  // Verify pickups were created
  const { data: pickups, error: pickupsError } = await supabase
    .from('market_box_pickups')
    .select('id, week_number, scheduled_date')
    .eq('subscription_id', subscription.id)
    .order('week_number')

  if (pickupsError) {
    await logError(new TracedError('ERR_WEBHOOK_006', 'Failed to fetch pickups after subscription creation', { route: '/webhooks/stripe', method: 'POST' }))
  } else {
    crumb.stripe(`${pickups?.length || 0} pickups created for subscription ${subscription.id}`)
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
  const subscriptionType = subData.metadata?.type as 'vendor' | 'buyer' | 'food_truck_vendor' | undefined

  if (!userId || !subscriptionType) {
    crumb.stripe(`Subscription updated without user metadata: ${subscription.id}`)
    return
  }

  const status = subscription.status
  const currentPeriodEnd = new Date(subData.current_period_end * 1000).toISOString()

  crumb.stripe(`Subscription ${subscription.id} updated: status=${status}`)

  if (subscriptionType === 'vendor' || subscriptionType === 'food_truck_vendor') {
    const targetTier = subData.metadata?.tier || 'premium'
    const vertical = subData.metadata?.vertical || ''

    const updateData: Record<string, unknown> = {
      subscription_status: status,
      tier_expires_at: currentPeriodEnd,
    }

    // If subscription is no longer active, handle tier appropriately
    if (status === 'canceled' || status === 'unpaid') {
      // Keep tier until period ends (already set in tier_expires_at)
      // A separate job should downgrade when tier_expires_at passes
    } else if (status === 'active') {
      updateData.tier = targetTier
    }

    let vpQuery = supabase
      .from('vendor_profiles')
      .update(updateData)
      .eq('user_id', userId)
    if (vertical) {
      vpQuery = vpQuery.eq('vertical_id', vertical)
    }
    await vpQuery
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
  const subscriptionType = subData.metadata?.type as 'vendor' | 'buyer' | 'food_truck_vendor' | undefined

  if (!userId || !subscriptionType) {
    crumb.stripe(`Subscription deleted without user metadata: ${subscription.id}`)
    return
  }

  crumb.stripe(`Subscription ${subscription.id} deleted for ${subscriptionType} ${userId}`)

  // Downgrade tier on subscription deletion
  if (subscriptionType === 'vendor' || subscriptionType === 'food_truck_vendor') {
    // FT vendors downgrade to 'basic' (platform requires payment), FM to 'standard' (free)
    const downgradeTier = subscriptionType === 'food_truck_vendor' ? 'basic' : 'standard'
    const vertical = subData.metadata?.vertical || ''

    let vpQuery = supabase
      .from('vendor_profiles')
      .update({
        tier: downgradeTier,
        stripe_subscription_id: null,
        subscription_status: 'canceled',
        tier_expires_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    if (vertical) {
      vpQuery = vpQuery.eq('vertical_id', vertical)
    }
    await vpQuery
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
  const subscriptionType = subData.metadata?.type as 'vendor' | 'buyer' | 'food_truck_vendor' | undefined

  if (!userId || !subscriptionType) return

  const currentPeriodEnd = new Date(subData.current_period_end * 1000).toISOString()

  crumb.stripe(`Invoice paid for ${subscriptionType} ${userId}, extends to ${currentPeriodEnd}`)

  // Update tier expiration
  if (subscriptionType === 'vendor' || subscriptionType === 'food_truck_vendor') {
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
  const subscriptionType = subData.metadata?.type as 'vendor' | 'buyer' | 'food_truck_vendor' | undefined

  if (!userId || !subscriptionType) return

  crumb.stripe(`Invoice payment failed for ${subscriptionType} ${userId}`)

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

  // Notify vendor that payout was processed
  const { data: orderItem } = await supabase
    .from('order_items')
    .select('vendor_profiles!vendor_profile_id(user_id)')
    .eq('id', orderItemId)
    .single()

  const vendorProfile = (orderItem as unknown as { vendor_profiles: { user_id: string } | null })?.vendor_profiles
  if (vendorProfile?.user_id) {
    await sendNotification(vendorProfile.user_id, 'payout_processed', {
      amountCents: transfer.amount,
    })
  }
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
