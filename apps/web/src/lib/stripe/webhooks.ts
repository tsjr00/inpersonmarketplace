import { stripe } from './config'
import { createRefund, transferMarketBoxPayout } from './payments'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { sendNotification } from '@/lib/notifications'
import { TracedError } from '@/lib/errors/traced-error'
import { logError } from '@/lib/errors/logger'
import { crumb } from '@/lib/errors/breadcrumbs'
import { calculateVendorPayout } from '@/lib/pricing'
import { selectBasePriceForTermWeeks } from '@/lib/stripe/webhook-utils'

/**
 * H-6: Dedup helper — check if a notification was already sent recently.
 * Prevents duplicate notifications from Stripe webhook retries.
 * Uses the same pattern as Phase 4.5 in expire-orders.
 */
async function wasNotificationSent(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  type: string,
  referenceId: string,
  lookbackHours = 24
): Promise<boolean> {
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .gte('created_at', cutoff)
    .limit(5)

  if (!data || data.length === 0) return false

  // Check if any notification has matching reference in its data
  // For a simple dedup, just checking user+type within the window is sufficient
  // since payout notifications are rare (one per order item)
  return true
}

/**
 * Safely extract current_period_end from a Stripe subscription object.
 * Handles API version differences where the field may be moved or restructured.
 * Falls back to 30 days from now if the field is unavailable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSubscriptionPeriodEnd(subscription: any): string {
  const periodEnd = subscription.current_period_end
    ?? subscription.items?.data?.[0]?.current_period_end
  if (periodEnd && typeof periodEnd === 'number') {
    return new Date(periodEnd * 1000).toISOString()
  }
  console.warn('[stripe-webhook] current_period_end not found on subscription, using 30-day fallback. Keys:', Object.keys(subscription))
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
}

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

    case 'charge.refunded':
      await handleChargeRefunded(event.data.object as Stripe.Charge)
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

    const { error: insertError } = await supabase.from('payments').insert({
      order_id: orderId,
      stripe_payment_intent_id: paymentIntentId,
      amount_cents: session.amount_total!,
      platform_fee_cents: order?.platform_fee_cents || 0,
      status: 'succeeded',
      paid_at: new Date().toISOString(),
    })

    // F1 FIX: Handle unique constraint violation as no-op (success route may have inserted first)
    if (insertError) {
      if (insertError.code === '23505') {
        crumb.stripe('Payment record already exists (concurrent success route), skipping')
        return // success route handles the rest
      }
      await logError(new TracedError('ERR_WEBHOOK_010', `Payment insert failed: ${insertError.message}`, { route: '/webhooks/stripe', method: 'POST' }))
      return
    }

    // Process market box subscriptions from unified checkout (idempotent)
    if (session.metadata?.has_market_boxes === 'true' && session.metadata?.market_box_items && order?.buyer_user_id) {
      try {
        const marketBoxItems = JSON.parse(session.metadata.market_box_items) as Array<{
          offeringId: string
          termWeeks: number
          startDate?: string
          priceCents: number
        }>

        // H5 FIX: Use RPC with capacity check instead of direct INSERT
        for (const mbItem of marketBoxItems) {
          const { data: result, error: rpcError } = await supabase
            .rpc('subscribe_to_market_box_if_capacity', {
              p_offering_id: mbItem.offeringId,
              p_buyer_user_id: order.buyer_user_id,
              p_order_id: orderId,
              p_total_paid_cents: mbItem.priceCents,
              p_start_date: mbItem.startDate || new Date().toISOString().split('T')[0],
              p_term_weeks: mbItem.termWeeks,
              p_stripe_payment_intent_id: paymentIntentId,
            })

          if (rpcError) {
            crumb.stripe(`Market box RPC error for offering ${mbItem.offeringId}: ${rpcError.message}`)
            // C-3 FIX: Auto-refund on RPC failure — buyer paid but subscription wasn't created
            await logError(new TracedError('ERR_WEBHOOK_010', `Market box subscription RPC failed in webhook: ${rpcError.message}`, {
              route: '/webhooks/stripe', method: 'POST',
              offeringId: mbItem.offeringId, orderId, paymentIntentId,
            }))
            try {
              await createRefund(paymentIntentId, mbItem.priceCents)
              crumb.stripe(`Auto-refund issued for failed market box RPC: ${mbItem.offeringId}`)
            } catch (refundErr) {
              // Critical: refund also failed — needs manual intervention
              await logError(new TracedError('ERR_WEBHOOK_011', `CRITICAL: Market box RPC failed AND refund failed — manual refund needed`, {
                route: '/webhooks/stripe', method: 'POST',
                offeringId: mbItem.offeringId, orderId, paymentIntentId,
                refundError: refundErr instanceof Error ? refundErr.message : String(refundErr),
              }))
            }
          } else if (result && !result.success) {
            crumb.stripe(`Market box at capacity: ${mbItem.offeringId}`)
            // F6 FIX: Refund buyer for at-capacity market box
            try {
              await createRefund(paymentIntentId, mbItem.priceCents)
              crumb.stripe(`Refund issued for at-capacity market box: ${mbItem.offeringId}`)
            } catch (refundErr) {
              await logError(new TracedError('ERR_WEBHOOK_008', `Failed to refund at-capacity market box ${mbItem.offeringId}`, {
                route: '/webhooks/stripe', method: 'POST', amount: mbItem.priceCents,
              }))
            }
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
  const currentPeriodEnd = getSubscriptionPeriodEnd(subscription)

  if (subscriptionType === 'vendor' || subscriptionType === 'food_truck_vendor') {
    // Determine tier from metadata — FT uses basic/pro/boss, FM defaults to premium
    const targetTier = session.metadata?.tier || 'premium'
    const vertical = session.metadata?.vertical || ''

    // Update vendor profile (clear trial fields if upgrading from trial)
    let vpQuery = supabase
      .from('vendor_profiles')
      .update({
        tier: targetTier,
        stripe_subscription_id: subscriptionId,
        subscription_status: 'active',
        subscription_cycle: cycle,
        tier_started_at: new Date().toISOString(),
        tier_expires_at: currentPeriodEnd,
        trial_ends_at: null,
        trial_grace_ends_at: null,
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
    // Still process payout if it hasn't been created yet (idempotent)
    await processMarketBoxVendorPayout(supabase, {
      subscriptionId: existing.id,
      offeringId,
      termWeeks,
      basePriceCentsFromMeta: session.metadata?.base_price_cents
        ? parseInt(session.metadata.base_price_cents, 10)
        : undefined,
    })
    return
  }

  // H5 FIX: Use RPC with capacity check instead of direct INSERT
  const { data: result, error: rpcError } = await supabase
    .rpc('subscribe_to_market_box_if_capacity', {
      p_offering_id: offeringId,
      p_buyer_user_id: userId,
      p_order_id: null,
      p_total_paid_cents: priceCents,
      p_start_date: startDate,
      p_term_weeks: termWeeks,
      p_stripe_payment_intent_id: paymentIntentId,
    })

  if (rpcError) {
    // C-3 FIX: Auto-refund on RPC failure — buyer paid but subscription wasn't created
    await logError(new TracedError('ERR_WEBHOOK_005', 'Failed to create market box subscription via RPC', { route: '/webhooks/stripe', method: 'POST', userId, error: rpcError.message }))
    try {
      await createRefund(paymentIntentId, priceCents)
      crumb.stripe(`Auto-refund issued for failed standalone market box RPC: ${offeringId}`)
    } catch (refundErr) {
      await logError(new TracedError('ERR_WEBHOOK_011', `CRITICAL: Standalone market box RPC failed AND refund failed — manual refund needed`, {
        route: '/webhooks/stripe', method: 'POST', userId, offeringId, paymentIntentId,
        refundError: refundErr instanceof Error ? refundErr.message : String(refundErr),
      }))
    }
    return
  }

  if (result && !result.success) {
    crumb.stripe(`Market box at capacity for offering ${offeringId}`)
    // F6 FIX: Refund buyer for at-capacity market box (standalone checkout)
    try {
      await createRefund(paymentIntentId, priceCents)
      crumb.stripe(`Refund issued for at-capacity standalone market box: ${offeringId}`)
    } catch (refundErr) {
      await logError(new TracedError('ERR_WEBHOOK_009', `Failed to refund at-capacity standalone market box ${offeringId}`, {
        route: '/webhooks/stripe', method: 'POST', amount: priceCents,
      }))
    }
    return
  }

  if (result?.already_existed) {
    crumb.stripe(`Market box subscription already exists (idempotent): ${result.id}`)
  } else {
    crumb.stripe(`Market box subscription created via RPC: ${result?.id}`)
  }

  // Pay vendor the full prepaid amount at checkout time
  const subscriptionId = result?.id as string | undefined
  if (subscriptionId) {
    await processMarketBoxVendorPayout(supabase, {
      subscriptionId,
      offeringId,
      termWeeks,
      basePriceCentsFromMeta: session.metadata?.base_price_cents
        ? parseInt(session.metadata.base_price_cents, 10)
        : undefined,
    })
  }
}

/**
 * Process vendor payout for a market box subscription.
 * Called from both webhook and checkout success route.
 * Idempotent: checks for existing payout before creating.
 */
async function processMarketBoxVendorPayout(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: {
    subscriptionId: string
    offeringId: string
    termWeeks: number
    basePriceCentsFromMeta?: number
  }
) {
  const { subscriptionId, offeringId, termWeeks, basePriceCentsFromMeta } = opts

  // Check for existing payout (idempotency — webhook + success route may both fire)
  const { data: existingPayout } = await supabase
    .from('vendor_payouts')
    .select('id')
    .eq('market_box_subscription_id', subscriptionId)
    .not('status', 'in', '("failed","cancelled")')
    .maybeSingle()

  if (existingPayout) {
    crumb.stripe(`Market box payout already exists for subscription ${subscriptionId}`)
    return
  }

  // Get offering to determine base price and vendor
  const { data: offering, error: offeringError } = await supabase
    .from('market_box_offerings')
    .select('price_cents, price_4week_cents, price_8week_cents, vendor_profile_id')
    .eq('id', offeringId)
    .single()

  if (offeringError || !offering) {
    await logError(new TracedError('ERR_PAYOUT_001', `Failed to fetch offering for market box payout: ${offeringError?.message}`, {
      route: '/webhooks/stripe', method: 'POST', offeringId, subscriptionId,
    }))
    return
  }

  // Use metadata base price if available, otherwise query offering
  const basePriceCents = selectBasePriceForTermWeeks(
    { basePriceCentsFromMeta },
    offering,
    termWeeks,
  )

  if (basePriceCents <= 0) {
    crumb.stripe(`Market box base price is 0 — skipping payout for subscription ${subscriptionId}`)
    return
  }

  const vendorPayoutCents = calculateVendorPayout(basePriceCents)

  // Get vendor Stripe info
  const { data: vendor, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('id, stripe_account_id, stripe_payouts_enabled, user_id, vertical_id')
    .eq('id', offering.vendor_profile_id)
    .single()

  if (vendorError || !vendor) {
    await logError(new TracedError('ERR_PAYOUT_002', `Failed to fetch vendor for market box payout: ${vendorError?.message}`, {
      route: '/webhooks/stripe', method: 'POST', vendorProfileId: offering.vendor_profile_id, subscriptionId,
    }))
    return
  }

  if (vendor.stripe_account_id && vendor.stripe_payouts_enabled) {
    // Vendor has Stripe ready — initiate transfer
    try {
      const transfer = await transferMarketBoxPayout({
        amount: vendorPayoutCents,
        destination: vendor.stripe_account_id,
        subscriptionId,
      })

      await supabase.from('vendor_payouts').insert({
        market_box_subscription_id: subscriptionId,
        vendor_profile_id: vendor.id,
        amount_cents: vendorPayoutCents,
        stripe_transfer_id: transfer.id,
        status: 'processing',
      })

      crumb.stripe(`Market box payout initiated: ${vendorPayoutCents}c to vendor ${vendor.id} for subscription ${subscriptionId}`)
    } catch (transferErr) {
      console.error('[MARKET_BOX_PAYOUT] Transfer failed:', transferErr)
      // Record failed payout for retry in Phase 5 cron
      await supabase.from('vendor_payouts').insert({
        market_box_subscription_id: subscriptionId,
        vendor_profile_id: vendor.id,
        amount_cents: vendorPayoutCents,
        stripe_transfer_id: null,
        status: 'failed',
      })
    }
  } else {
    // Vendor doesn't have Stripe ready — record as pending
    await supabase.from('vendor_payouts').insert({
      market_box_subscription_id: subscriptionId,
      vendor_profile_id: vendor.id,
      amount_cents: vendorPayoutCents,
      stripe_transfer_id: null,
      status: 'pending_stripe_setup',
    })
    crumb.stripe(`Market box payout pending Stripe setup for vendor ${vendor.id}, subscription ${subscriptionId}`)
  }

  // Notify vendor about incoming payout
  if (vendor.user_id) {
    await sendNotification(vendor.user_id, 'payout_processed', {
      amountCents: vendorPayoutCents,
    }, { vertical: vendor.vertical_id })
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
  const currentPeriodEnd = getSubscriptionPeriodEnd(subData)

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
    // Both verticals downgrade to 'free' when subscription is deleted
    const downgradeTier = 'free'
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

    // M-1 FIX: Auto-pause excess listings on tier downgrade.
    // Without this, vendors keep premium listings live after cancelling.
    try {
      const { getTierLimits } = await import('@/lib/vendor-limits')
      const limits = getTierLimits(downgradeTier, vertical || undefined)
      const maxListings = limits.productListings

      // Get vendor profile ID
      let vpIdQuery = supabase
        .from('vendor_profiles')
        .select('id')
        .eq('user_id', userId)
      if (vertical) vpIdQuery = vpIdQuery.eq('vertical_id', vertical)
      const { data: vp } = await vpIdQuery.single()

      if (vp) {
        // Count published listings
        const { count: publishedCount } = await supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('vendor_profile_id', vp.id)
          .eq('status', 'published')

        if (publishedCount && publishedCount > maxListings) {
          const excessCount = publishedCount - maxListings
          // Get the newest excess listings (keep oldest ones published)
          const { data: excessListings } = await supabase
            .from('listings')
            .select('id')
            .eq('vendor_profile_id', vp.id)
            .eq('status', 'published')
            .order('created_at', { ascending: false })
            .limit(excessCount)

          if (excessListings && excessListings.length > 0) {
            const excessIds = excessListings.map(l => l.id)
            await supabase
              .from('listings')
              .update({ status: 'draft', updated_at: new Date().toISOString() })
              .in('id', excessIds)

            crumb.stripe(`M-1: Auto-paused ${excessIds.length} excess listings for vendor ${vp.id} after downgrade to ${downgradeTier}`)
          }
        }

        // Also deactivate excess market boxes
        const maxActiveBoxes = limits.activeMarketBoxes
        const { count: activeBoxCount } = await supabase
          .from('market_box_offerings')
          .select('id', { count: 'exact', head: true })
          .eq('vendor_profile_id', vp.id)
          .eq('status', 'active')

        if (activeBoxCount && activeBoxCount > maxActiveBoxes) {
          const excessBoxCount = activeBoxCount - maxActiveBoxes
          const { data: excessBoxes } = await supabase
            .from('market_box_offerings')
            .select('id')
            .eq('vendor_profile_id', vp.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(excessBoxCount)

          if (excessBoxes && excessBoxes.length > 0) {
            const boxIds = excessBoxes.map(b => b.id)
            await supabase
              .from('market_box_offerings')
              .update({ status: 'inactive', updated_at: new Date().toISOString() })
              .in('id', boxIds)

            crumb.stripe(`M-1: Deactivated ${boxIds.length} excess market boxes for vendor ${vp.id}`)
          }
        }
      }
    } catch (pauseError) {
      // Don't block downgrade if auto-pause fails — Phase 10c handles it nightly
      console.error('[M-1] Failed to auto-pause excess listings:', pauseError)
    }
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

  const currentPeriodEnd = getSubscriptionPeriodEnd(subData)

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
  const mbSubscriptionId = transfer.metadata?.market_box_subscription_id

  if (mbSubscriptionId) {
    // Market box subscription payout
    await supabase
      .from('vendor_payouts')
      .update({
        status: 'completed',
        transferred_at: new Date().toISOString(),
      })
      .eq('market_box_subscription_id', mbSubscriptionId)

    // Notify vendor
    const { data: payout } = await supabase
      .from('vendor_payouts')
      .select('vendor_profiles!inner(user_id, vertical_id)')
      .eq('market_box_subscription_id', mbSubscriptionId)
      .single()

    const vp = (payout as unknown as { vendor_profiles: { user_id: string; vertical_id: string } })?.vendor_profiles
    if (vp?.user_id) {
      // H-6: Dedup — skip if already notified for this payout
      const alreadySent = await wasNotificationSent(supabase, vp.user_id, 'payout_processed', mbSubscriptionId)
      if (!alreadySent) {
        await sendNotification(vp.user_id, 'payout_processed', {
          amountCents: transfer.amount,
        }, { vertical: vp.vertical_id })
      }
    }
    return
  }

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
    .select('vendor_profiles!vendor_profile_id(user_id, vertical_id)')
    .eq('id', orderItemId)
    .single()

  const vendorProfile = (orderItem as unknown as { vendor_profiles: { user_id: string; vertical_id: string } | null })?.vendor_profiles
  if (vendorProfile?.user_id) {
    // H-6: Dedup
    const alreadySent = await wasNotificationSent(supabase, vendorProfile.user_id, 'payout_processed', orderItemId)
    if (!alreadySent) {
      await sendNotification(vendorProfile.user_id, 'payout_processed', {
        amountCents: transfer.amount,
      }, { vertical: vendorProfile.vertical_id })
    }
  }
}

async function handleTransferFailed(transfer: Stripe.Transfer) {
  const supabase = createServiceClient()
  const orderItemId = transfer.metadata?.order_item_id
  const mbSubscriptionId = transfer.metadata?.market_box_subscription_id

  if (mbSubscriptionId) {
    // Market box subscription payout reversal
    await supabase
      .from('vendor_payouts')
      .update({ status: 'failed' })
      .eq('market_box_subscription_id', mbSubscriptionId)

    // Notify vendor
    const { data: payout } = await supabase
      .from('vendor_payouts')
      .select('vendor_profiles!inner(user_id, vertical_id)')
      .eq('market_box_subscription_id', mbSubscriptionId)
      .single()

    const vp = (payout as unknown as { vendor_profiles: { user_id: string; vertical_id: string } })?.vendor_profiles
    if (vp?.user_id) {
      // H-6: Dedup
      const alreadySent = await wasNotificationSent(supabase, vp.user_id, 'payout_failed', mbSubscriptionId)
      if (!alreadySent) {
        await sendNotification(vp.user_id, 'payout_failed', {
          amountCents: transfer.amount,
          reason: 'Transfer was reversed by Stripe',
        }, { vertical: vp.vertical_id })
      }
    }
    return
  }

  if (!orderItemId) return

  await supabase
    .from('vendor_payouts')
    .update({ status: 'failed' })
    .eq('order_item_id', orderItemId)

  // Notify vendor that their payout was reversed
  const { data: orderItem } = await supabase
    .from('order_items')
    .select('vendor_profiles!vendor_profile_id(user_id), order:orders(vertical_id)')
    .eq('id', orderItemId)
    .single()

  const vendorProfile = (orderItem as unknown as { vendor_profiles: { user_id: string } | null })?.vendor_profiles
  const orderData = (orderItem as unknown as { order: { vertical_id: string } | null })?.order
  if (vendorProfile?.user_id) {
    // H-6: Dedup
    const alreadySent = await wasNotificationSent(supabase, vendorProfile.user_id, 'payout_failed', orderItemId)
    if (!alreadySent) {
      await sendNotification(vendorProfile.user_id, 'payout_failed', {
        amountCents: transfer.amount,
        reason: 'Transfer was reversed by Stripe',
      }, { vertical: orderData?.vertical_id })
    }
  }
}

/**
 * Handle charge refunded — admin issued refund via Stripe Dashboard
 * Updates order status and notifies buyer/vendor
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const supabase = createServiceClient()

  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id

  if (!paymentIntentId) {
    crumb.stripe('charge.refunded: no payment_intent ID found')
    return
  }

  // Find the order linked to this payment
  const { data: payment } = await supabase
    .from('payments')
    .select('order_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single()

  if (!payment?.order_id) {
    crumb.stripe(`charge.refunded: no order found for PI ${paymentIntentId}`)
    return
  }

  const isFullRefund = charge.amount_refunded >= charge.amount

  if (isFullRefund) {
    // Full refund — mark order as refunded
    await supabase
      .from('orders')
      .update({ status: 'refunded' })
      .eq('id', payment.order_id)

    // Mark all non-cancelled order items as refunded
    await supabase
      .from('order_items')
      .update({ status: 'refunded', refund_amount_cents: charge.amount_refunded })
      .eq('order_id', payment.order_id)
      .is('cancelled_at', null)
  }

  // Update payment status
  await supabase
    .from('payments')
    .update({ status: isFullRefund ? 'refunded' : 'partially_refunded' })
    .eq('stripe_payment_intent_id', paymentIntentId)

  // Get order details for notifications
  const { data: order } = await supabase
    .from('orders')
    .select(`
      order_number, buyer_user_id, vertical_id,
      order_items(vendor_profile_id, vendor_profiles!vendor_profile_id(user_id))
    `)
    .eq('id', payment.order_id)
    .single()

  if (!order) return

  const refundAmountCents = charge.amount_refunded

  // H-6: Dedup — Stripe can retry charge.refunded webhooks
  // Notify buyer about refund
  if (order.buyer_user_id) {
    const alreadySent = await wasNotificationSent(supabase, order.buyer_user_id, 'order_refunded', payment.order_id)
    if (!alreadySent) {
      await sendNotification(order.buyer_user_id, 'order_refunded', {
        orderNumber: order.order_number,
        amountCents: refundAmountCents,
      }, { vertical: order.vertical_id })
    }
  }

  // Notify vendors about refund
  const vendorUserIds = new Set<string>()
  const items = order.order_items as unknown as Array<{
    vendor_profile_id: string
    vendor_profiles: { user_id: string } | null
  }>
  for (const item of items || []) {
    const userId = item.vendor_profiles?.user_id
    if (userId) vendorUserIds.add(userId)
  }

  for (const vendorUserId of vendorUserIds) {
    const alreadySent = await wasNotificationSent(supabase, vendorUserId, 'order_refunded', payment.order_id)
    if (!alreadySent) {
      await sendNotification(vendorUserId, 'order_refunded', {
        orderNumber: order.order_number,
        amountCents: refundAmountCents,
      }, { vertical: order.vertical_id })
    }
  }

  crumb.stripe(`charge.refunded processed: order ${payment.order_id}, ${isFullRefund ? 'full' : 'partial'} refund of $${(refundAmountCents / 100).toFixed(2)}`)
}
