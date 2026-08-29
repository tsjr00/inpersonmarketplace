import { stripe } from './config'
import { createRefund } from './payments'
import { refundEventFeePayment } from './event-fee-payments'
import { processMarketBoxPayout } from './market-box-payout'
import { selectBasePriceForTermWeeks } from './webhook-utils'
import { retrieveStripeFeeCents } from './fee-capture'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { sendNotification } from '@/lib/notifications'
import { TracedError } from '@/lib/errors/traced-error'
import { logError } from '@/lib/errors/logger'
import { crumb } from '@/lib/errors/breadcrumbs'
import { calculateBoothRentalFees, FEES } from '@/lib/pricing'
import { sendSeasonPaidNotifications } from '@/lib/markets/season-notifications'
import { observed } from '@/lib/errors'

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
  // CHK-13 FIX: match the specific reference (stored as data.dedupRef by every
  // caller's paired sendNotification) — user+type alone suppressed a vendor's
  // 2nd legitimate same-type notification within the window (2 payouts in a day).
  const { data } = await observed(supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .contains('data', { dedupRef: referenceId })
    .gte('created_at', cutoff)
    .limit(1), { table: 'notifications' })

  return !!data && data.length > 0
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

    case 'charge.dispute.created':
      await handleChargeDisputeCreated(event.data.object as Stripe.Dispute)
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

  // Phase C Stage 3 (2026-05-17): booth rental checkout.
  // Dispatched here before the regular-product fall-through so a
  // booth_rental session doesn't accidentally route to the order
  // handler (which would silently exit on missing order_id).
  if (session.metadata?.type === 'booth_rental') {
    await handleBoothRentalCheckoutComplete(session)
    return
  }

  // Phase E: season/partial booth purchase (one payment, N weeks). Flips the
  // whole booth_booking_groups row + its child weekly_booth_rentals to paid.
  if (session.metadata?.type === 'booth_rental_season') {
    await handleSeasonBoothCheckoutComplete(session)
    return
  }

  // FT park-manager P2: park spot booking (one payment, one spot, N dates).
  // Flips park_spot_bookings by booking_group_id to paid.
  if (session.metadata?.type === 'park_spot') {
    await handleParkSpotCheckoutComplete(session)
    return
  }

  // Event Vendor Fees (V1 2026-08-14): capacity-checked flip in SQL (mig 229)
  // — first PAYMENT wins; the rare over-capacity loser is auto-refunded here.
  if (session.metadata?.type === 'event_vendor_fee') {
    await handleEventVendorFeeCheckoutComplete(session)
    return
  }

  // Handle regular product checkout (may include market box items)
  const orderId = session.metadata?.order_id
  if (!orderId) return

  const paymentIntentId = session.payment_intent as string

  // CHK-1: read the order FIRST — its status drives the 3-way branch below,
  // and the row feeds the payment insert AND market box processing.
  const { data: order } = await observed(supabase
    .from('orders')
    .select('status, platform_fee_cents, buyer_user_id, order_number, vertical_id, chipin_amount_cents, chipin_beneficiary_id')
    .eq('id', orderId)
    .single(), { table: 'orders' })

  if (!order) {
    await logError(new TracedError('ERR_WEBHOOK_017', `checkout.session.completed for unknown order ${orderId} (PI ${paymentIntentId}) — no order row; manual review needed`, {
      route: '/webhooks/stripe', method: 'POST',
    }))
    return
  }

  // CHK-1: a payment landed on an order that already died (cancelled by
  // cleanup/cron/reject before the flip). The payment row is recorded before
  // this runs; refund the FULL charge with a deterministic key shared with
  // checkout/success so the two paths can never double-refund.
  const refundDeadOrder = async (deadStatus: string) => {
    try {
      await createRefund(paymentIntentId, `${orderId}-dead-order`, session.amount_total!)
      await logError(new TracedError('ERR_WEBHOOK_017', `Payment landed on dead order ${orderId} (status ${deadStatus}) — full auto-refund of ${session.amount_total}¢ initiated`, {
        route: '/webhooks/stripe', method: 'POST',
      }))
      await sendNotification(order.buyer_user_id, 'order_refunded', {
        orderNumber: order.order_number,
        orderId,
        amountCents: session.amount_total!,
      }, { vertical: order.vertical_id })
    } catch (refundErr) {
      await logError(new TracedError('ERR_WEBHOOK_017', `CRITICAL: payment landed on dead order ${orderId} AND auto-refund failed — manual refund of ${session.amount_total}¢ needed: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
        route: '/webhooks/stripe', method: 'POST',
      }))
    }
  }

  // Idempotent insert - skip if success route already created the record
  const { data: existingPayment } = await observed(supabase
    .from('payments')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single(), { table: 'payments' })

  if (!existingPayment) {
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
        // Fall through to market box processing — helpers below are idempotent
        // and ensure the vendor_payouts row exists even if success route ran
        // the subscribe RPC but didn't reach the payout call.
      } else {
        await logError(new TracedError('ERR_WEBHOOK_010', `Payment insert failed: ${insertError.message}`, { route: '/webhooks/stripe', method: 'POST' }))
        return
      }
    }
  }

  // ADM-2 (2026-07-17): capture the ACTUAL Stripe fee the platform bears on this
  // destination charge, from the charge's balance_transaction, onto the payment
  // row. Non-blocking + idempotent (only fills a NULL) — runs after the payment
  // is already recorded succeeded, so any failure here can't affect the payment
  // or order flow; it just leaves the fee NULL and reports fall back to the
  // 2.9%+$0.30 estimate.
  try {
    const feeCents = await retrieveStripeFeeCents(paymentIntentId)
    if (feeCents !== null) {
      await supabase
        .from('payments')
        .update({ stripe_fee_cents: feeCents })
        .eq('stripe_payment_intent_id', paymentIntentId)
        .is('stripe_fee_cents', null)
    }
  } catch (feeErr) {
    await logError(new TracedError('ERR_WEBHOOK_016',
      `Stripe fee capture failed for PI ${paymentIntentId}: ${feeErr instanceof Error ? feeErr.message : String(feeErr)}`,
      { route: '/webhooks/stripe', method: 'POST' }))
  }

  // CHK-1 (3-way status branch): only a PENDING order flips to paid. A resend
  // or backfill delivery (order already paid/completed) skips the flip but
  // keeps the idempotent backfill — that path is load-bearing and unchanged.
  // A payment landing on a cancelled/refunded order is recorded above,
  // auto-refunded in full, and never reaches market-box processing.
  if (order.status === 'pending') {
    const { data: flippedRows } = await observed(supabase
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', orderId)
      .eq('status', 'pending')
      .select('id'), { table: 'orders', operation: 'update' })

    if (!flippedRows || flippedRows.length === 0) {
      // Lost the race between our status read and the flip — THE CHK-1 race
      // (cleanup/cron cancelled the order mid-handler). Re-read and route.
      const { data: raceOrder } = await observed(supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single(), { table: 'orders' })
      if (raceOrder && ['cancelled', 'refunded'].includes(raceOrder.status)) {
        await refundDeadOrder(raceOrder.status)
        return
      }
      // Otherwise a concurrent success-route flip won (order is paid) — continue.
    }
  } else if (['cancelled', 'refunded'].includes(order.status)) {
    await refundDeadOrder(order.status)
    return
  }
  // paid/completed: no flip — idempotent backfill continues below.

  // Community Chip In (mig 213): record the collected contribution now that the
  // order is confirmed paid. Idempotent via uq_cause_ledger_collected_order (a
  // resend is a 23505 no-op). Best-effort — a failure never fails the webhook
  // (money is already in the platform balance + reconcilable from the order).
  if (order.chipin_amount_cents && order.chipin_amount_cents > 0 && order.chipin_beneficiary_id) {
    const { error: chipinErr } = await supabase.from('cause_ledger').insert({
      beneficiary_id: order.chipin_beneficiary_id,
      order_id: orderId,
      amount_cents: order.chipin_amount_cents,
      type: 'collected',
      note: `Chip-in on order ${order.order_number}`,
    })
    if (chipinErr && chipinErr.code !== '23505') {
      await logError(new TracedError('ERR_WEBHOOK_019', `Community Chip In ledger write failed for order ${orderId}: ${chipinErr.message}`, {
        route: '/webhooks/stripe', method: 'POST',
      }))
    }
  }

  // Market box processing runs on EVERY webhook delivery for idempotent backfill.
  // Both the subscribe RPC and processMarketBoxPayout are idempotent — safe on
  // resends/retries. This ensures the helper fires when only the webhook delivers
  // (success route never reached) AND on Stripe event resends.
  if (session.metadata?.has_market_boxes === 'true' && session.metadata?.market_box_items && order?.buyer_user_id) {
    try {
      const marketBoxItems = JSON.parse(session.metadata.market_box_items) as Array<{
        offeringId: string
        termWeeks: number
        startDate?: string
        priceCents: number
        pickupFrequency?: string
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
            p_pickup_frequency: mbItem.pickupFrequency || 'weekly',
          })

        if (rpcError) {
          crumb.stripe(`Market box RPC error for offering ${mbItem.offeringId}: ${rpcError.message}`)
          // C-3 FIX: Auto-refund on RPC failure — buyer paid but subscription wasn't created
          await logError(new TracedError('ERR_WEBHOOK_010', `Market box subscription RPC failed in webhook: ${rpcError.message}`, {
            route: '/webhooks/stripe', method: 'POST',
            offeringId: mbItem.offeringId, orderId, paymentIntentId,
          }))
          try {
            // CHK-6 FIX: refund the fee-inclusive amount the buyer was charged
            // (line item = round(price × (1+buyerFeePercent)), session:682) —
            // refunding the pre-fee priceCents shorted the buyer ~6.5%.
            await createRefund(paymentIntentId, mbItem.offeringId, Math.round(mbItem.priceCents * (1 + FEES.buyerFeePercent / 100)))
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
          // CHK-6 FIX: fee-inclusive refund (see failed-RPC branch above)
          try {
            await createRefund(paymentIntentId, mbItem.offeringId, Math.round(mbItem.priceCents * (1 + FEES.buyerFeePercent / 100)))
            crumb.stripe(`Refund issued for at-capacity market box: ${mbItem.offeringId}`)
          } catch (refundErr) {
            await logError(new TracedError('ERR_WEBHOOK_008', `Failed to refund at-capacity market box ${mbItem.offeringId}`, {
              route: '/webhooks/stripe', method: 'POST', amount: mbItem.priceCents,
            }))
          }
        } else if (result?.id) {
          // Subscription created (new or already_existed) — ensure vendor payout exists.
          // Mirrors checkout/success/route.ts so the webhook backup path doesn't leave
          // vendor unpaid when success route doesn't run. Helper is idempotent —
          // safe if success route already created the payout.
          await processMarketBoxPayout({
            serviceClient: supabase,
            subscriptionId: result.id,
            offeringId: mbItem.offeringId,
            actualPaidCents: mbItem.priceCents,
            paymentIntentId,
            source: 'stripe-webhook',
          })
        }
      }
      crumb.stripe(`Created ${marketBoxItems.length} market box subscription(s) for order ${orderId}`)
    } catch {
      await logError(new TracedError('ERR_WEBHOOK_007', 'Failed to parse market box items metadata', { route: '/webhooks/stripe', method: 'POST' }))
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

    // A3 FIX: Vertical MUST be present to safely scope the update to one
    // vendor_profiles row. Without it, a multi-vertical vendor's other
    // vertical(s) would have their tier overwritten. Refuse the update and
    // log loudly so admin can investigate why session metadata was missing
    // vertical (subscriptions/checkout/route.ts now rejects vendor sessions
    // without vertical, so this should never fire — but guard just in case).
    if (!vertical) {
      await logError(new TracedError('ERR_WEBHOOK_VERTICAL_MISSING',
        `Subscription checkout missing vertical metadata for user ${userId}, sub ${subscriptionId}. Refusing tier update.`,
        { route: '/webhooks/stripe', method: 'POST', userId, subscriptionId }
      ))
      return
    }

    // Update vendor profile (clear trial fields if upgrading from trial)
    const { error } = await supabase
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
      .eq('vertical_id', vertical)

    if (error) {
      await logError(new TracedError('ERR_WEBHOOK_002', 'Failed to update vendor tier', { route: '/webhooks/stripe', method: 'POST', userId }))
    } else {
      crumb.stripe(`Vendor ${userId} upgraded to ${targetTier}`)
      // S8-1: NEW sub is now active — cancel the OLD one the vendor switched
      // away from. Deferred to here (not before checkout) so an abandoned
      // checkout can't downgrade a paid vendor mid-period. Best-effort; a
      // failure just leaves the old sub to expire on its own — never blocks.
      const oldSubscriptionId = session.metadata?.old_subscription_id
      if (oldSubscriptionId && oldSubscriptionId !== subscriptionId) {
        try {
          await stripe.subscriptions.cancel(oldSubscriptionId)
        } catch {
          await logError(new TracedError('ERR_WEBHOOK_018', `S8-1: failed to cancel superseded subscription ${oldSubscriptionId} after upgrading vendor ${userId} to ${targetTier}`, { route: '/webhooks/stripe', method: 'POST', userId, subscriptionId }))
        }
      }
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

  // MBX-1 FIX: on this standalone path, metadata.price_cents is the buyer's
  // FEE-INCLUSIVE total (buyer/market-boxes POST passes buyerTotalCents), so
  // paying out on it overpaid the vendor and under-collected the platform fee.
  // Vendor payout + total_paid must use the PRE-FEE base price:
  // base_price_cents metadata → term-appropriate offering price (MBX-6:
  // selectBasePriceForTermWeeks was written for exactly this, never wired in).
  // Refunds below intentionally keep priceCents — buyers get back the
  // fee-inclusive amount they actually paid.
  const basePriceCentsFromMeta = parseInt(session.metadata?.base_price_cents || '0', 10)

  // One offering lookup: term prices (MBX-1 fallback) + vendor frequency (LOW-2).
  // On lookup failure, frequency falls back to 'weekly' (preserves prior behavior).
  const { data: offeringRow } = await observed(supabase
    .from('market_box_offerings')
    .select('price_cents, price_4week_cents, price_8week_cents, vendor_profiles!inner(market_box_frequency)')
    .eq('id', offeringId)
    .single(), { table: 'market_box_offerings' })

  const baseActualPaidCents = offeringRow
    ? selectBasePriceForTermWeeks(
        { basePriceCentsFromMeta },
        offeringRow as { price_cents: number; price_4week_cents?: number | null; price_8week_cents?: number | null },
        termWeeks,
      )
    : (basePriceCentsFromMeta > 0 ? basePriceCentsFromMeta : priceCents)

  if (!(basePriceCentsFromMeta > 0)) {
    // Observable fallback — missing base metadata means a checkout-path bug
    await logError(new TracedError('ERR_WEBHOOK_004', `market box checkout missing base_price_cents metadata — payout base fell back to ${offeringRow ? `offering ${termWeeks}-week price` : 'fee-inclusive price_cents'} (offering ${offeringId})`, {
      route: '/webhooks/stripe', method: 'POST',
    }))
  }

  // Check if subscription already exists (idempotency)
  const { data: existing } = await observed(supabase
    .from('market_box_subscriptions')
    .select('id')
    .eq('offering_id', offeringId)
    .eq('buyer_user_id', userId)
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single(), { table: 'market_box_subscriptions' })

  if (existing) {
    crumb.stripe(`Market box subscription already exists: ${existing.id}`)
    // Still process payout if it hasn't been created yet (idempotent)
    await processMarketBoxPayout({
      serviceClient: supabase,
      subscriptionId: existing.id,
      offeringId,
      actualPaidCents: baseActualPaidCents,
      paymentIntentId,
      source: 'stripe-webhook',
    })
    return
  }

  // LOW-2 FIX: vendor frequency for biweekly support (from the lookup above)
  let standalonePickupFrequency: 'weekly' | 'biweekly' = 'weekly'
  const vp = offeringRow?.vendor_profiles as { market_box_frequency?: string } | { market_box_frequency?: string }[] | undefined
  const vpRow = Array.isArray(vp) ? vp[0] : vp
  if (vpRow?.market_box_frequency === 'biweekly') {
    standalonePickupFrequency = 'biweekly'
  }

  // H5 FIX: Use RPC with capacity check instead of direct INSERT
  const { data: result, error: rpcError } = await supabase
    .rpc('subscribe_to_market_box_if_capacity', {
      p_offering_id: offeringId,
      p_buyer_user_id: userId,
      p_order_id: null,
      p_total_paid_cents: baseActualPaidCents,
      p_start_date: startDate,
      p_term_weeks: termWeeks,
      p_stripe_payment_intent_id: paymentIntentId,
      p_pickup_frequency: standalonePickupFrequency,
    })

  if (rpcError) {
    // C-3 FIX: Auto-refund on RPC failure — buyer paid but subscription wasn't created
    await logError(new TracedError('ERR_WEBHOOK_005', 'Failed to create market box subscription via RPC', { route: '/webhooks/stripe', method: 'POST', userId, error: rpcError.message }))
    try {
      await createRefund(paymentIntentId, offeringId, priceCents)
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
      await createRefund(paymentIntentId, offeringId, priceCents)
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

  // Pay vendor on the pre-fee base of what the buyer paid (MBX-1)
  const subscriptionId = result?.id as string | undefined
  if (subscriptionId) {
    await processMarketBoxPayout({
      serviceClient: supabase,
      subscriptionId,
      offeringId,
      actualPaidCents: baseActualPaidCents,
      paymentIntentId,
      source: 'stripe-webhook',
    })
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

    // A3 FIX: Vertical required to scope the update — see handleSubscriptionCheckoutComplete.
    if (!vertical) {
      await logError(new TracedError('ERR_WEBHOOK_VERTICAL_MISSING',
        `Subscription updated missing vertical metadata for user ${userId}, sub ${subscription.id}. Refusing update.`,
        { route: '/webhooks/stripe', method: 'POST', userId, subscriptionId: subscription.id }
      ))
      return
    }

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

    await supabase
      .from('vendor_profiles')
      .update(updateData)
      .eq('user_id', userId)
      .eq('vertical_id', vertical)
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

    // A3 FIX: Vertical required to scope the downgrade — see handleSubscriptionCheckoutComplete.
    if (!vertical) {
      await logError(new TracedError('ERR_WEBHOOK_VERTICAL_MISSING',
        `Subscription deleted missing vertical metadata for user ${userId}, sub ${subscription.id}. Refusing downgrade.`,
        { route: '/webhooks/stripe', method: 'POST', userId, subscriptionId: subscription.id }
      ))
      return
    }

    await supabase
      .from('vendor_profiles')
      .update({
        tier: downgradeTier,
        stripe_subscription_id: null,
        subscription_status: 'canceled',
        tier_expires_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('vertical_id', vertical)

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
          const { data: excessListings } = await observed(supabase
            .from('listings')
            .select('id')
            .eq('vendor_profile_id', vp.id)
            .eq('status', 'published')
            .order('created_at', { ascending: false })
            .limit(excessCount), { table: 'listings' })

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
        const maxActiveBoxes = limits.marketBoxes
        const { count: activeBoxCount } = await supabase
          .from('market_box_offerings')
          .select('id', { count: 'exact', head: true })
          .eq('vendor_profile_id', vp.id)
          .eq('status', 'active')

        if (activeBoxCount && activeBoxCount > maxActiveBoxes) {
          const excessBoxCount = activeBoxCount - maxActiveBoxes
          const { data: excessBoxes } = await observed(supabase
            .from('market_box_offerings')
            .select('id')
            .eq('vendor_profile_id', vp.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(excessBoxCount), { table: 'market_box_offerings' })

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
    // CHK-9: scope the tier update to the subscription's vertical so a
    // multi-vertical vendor's renewal doesn't extend BOTH profiles. Mirrors
    // the A3 checkout-handler pattern (refuse + log if vertical metadata missing).
    const vertical = subData.metadata?.vertical
    if (!vertical) {
      await logError(new TracedError('ERR_WEBHOOK_002', `Invoice renewal missing vertical metadata for vendor ${userId}, sub ${subscriptionId}. Refusing tier update.`, { route: '/webhooks/stripe', method: 'POST', userId, subscriptionId }))
      return
    }
    await supabase
      .from('vendor_profiles')
      .update({
        subscription_status: 'active',
        tier_expires_at: currentPeriodEnd,
      })
      .eq('user_id', userId)
      .eq('vertical_id', vertical)
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
  if (subscriptionType === 'vendor' || subscriptionType === 'food_truck_vendor') {
    // CHK-8: include food_truck_vendor (was 'vendor' only) so FT renewal
    // failures also flag past_due. CHK-9: scope to the subscription's vertical
    // so a multi-vertical vendor's failure doesn't flag BOTH profiles.
    const vertical = subData.metadata?.vertical
    if (!vertical) {
      await logError(new TracedError('ERR_WEBHOOK_002', `Invoice renewal-failure missing vertical metadata for vendor ${userId}, sub ${subscriptionId}. Refusing status update.`, { route: '/webhooks/stripe', method: 'POST', userId, subscriptionId }))
      return
    }
    await supabase
      .from('vendor_profiles')
      .update({ subscription_status: 'past_due' })
      .eq('user_id', userId)
      .eq('vertical_id', vertical)
  } else if (subscriptionType === 'buyer') {
    await supabase
      .from('user_profiles')
      .update({ subscription_status: 'past_due' })
      .eq('user_id', userId)
  }
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const supabase = createServiceClient()

  // H6 FIX: payment_intent.succeeded can arrive BEFORE checkout.session.completed,
  // which is the handler that creates the order and payment record. If the payment
  // record doesn't exist yet, this update matches zero rows — that's fine.
  // We return 200 regardless so Stripe doesn't retry needlessly.
  // checkout.session.completed is the authoritative handler that creates the order,
  // inserts the payment record, and sends notifications. This handler is a
  // secondary confirmation that simply marks an existing payment as succeeded.
  const { data } = await observed(supabase
    .from('payments')
    .update({
      status: 'succeeded',
      paid_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .select('id'), { table: 'payments', operation: 'update' })

  if (!data || data.length === 0) {
    crumb.stripe(`payment_intent.succeeded: no payment record found for PI ${paymentIntent.id} — checkout.session.completed will handle this`)
  }
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

  // MGR-5 (PRK-7 analog): manager/operator Connect accounts live on `markets`,
  // and the booking gates read markets.stripe_charges_enabled directly (book:148,
  // book-season:76). Without this sync the column only updates when the manager
  // opens their dashboard (stripe/status poll) — a disabled account kept
  // attracting bookings that all 502, and a completed onboarding stayed hidden.
  // Same column trio as the stripe/status sync; no-op for vendor accounts
  // (no markets row carries their account id).
  await supabase
    .from('markets')
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
    // Market box subscription payout.
    // MBX-3 FIX: scope to LIVE rows — unscoped, this flipped historical
    // 'failed' rows for the same subscription to 'completed'. (Not scoped by
    // stripe_transfer_id: this webhook can arrive before our own post-transfer
    // update persists the id.)
    await supabase
      .from('vendor_payouts')
      .update({
        status: 'completed',
        transferred_at: new Date().toISOString(),
      })
      .eq('market_box_subscription_id', mbSubscriptionId)
      .in('status', ['pending', 'processing'])

    // Notify vendor
    const { data: payout } = await observed(supabase
      .from('vendor_payouts')
      .select('vendor_profiles!inner(user_id, vertical_id)')
      .eq('market_box_subscription_id', mbSubscriptionId)
      .single(), { table: 'vendor_payouts' })

    const vp = (payout as unknown as { vendor_profiles: { user_id: string; vertical_id: string } })?.vendor_profiles
    if (vp?.user_id) {
      // H-6: Dedup — skip if already notified for this payout
      const alreadySent = await wasNotificationSent(supabase, vp.user_id, 'payout_processed', mbSubscriptionId)
      if (!alreadySent) {
        await sendNotification(vp.user_id, 'payout_processed', {
          amountCents: transfer.amount,
          dedupRef: mbSubscriptionId,
        }, { vertical: vp.vertical_id })
      }
    }
    return
  }

  if (!orderItemId) return

  // MBX-7 FIX: scope to LIVE rows — unscoped, this flipped historical 'failed'
  // retry rows for the same item to 'completed'. (Same rationale as the MB
  // branch: not transfer-id-scoped because this webhook can arrive before our
  // own post-transfer id write persists.)
  await supabase
    .from('vendor_payouts')
    .update({
      status: 'completed',
      transferred_at: new Date().toISOString(),
    })
    .eq('order_item_id', orderItemId)
    .in('status', ['pending', 'processing'])

  // Notify vendor that payout was processed
  const { data: orderItem } = await observed(supabase
    .from('order_items')
    .select('vendor_profiles!vendor_profile_id(user_id, vertical_id)')
    .eq('id', orderItemId)
    .single(), { table: 'order_items' })

  const vendorProfile = (orderItem as unknown as { vendor_profiles: { user_id: string; vertical_id: string } | null })?.vendor_profiles
  if (vendorProfile?.user_id) {
    // H-6: Dedup
    const alreadySent = await wasNotificationSent(supabase, vendorProfile.user_id, 'payout_processed', orderItemId)
    if (!alreadySent) {
      await sendNotification(vendorProfile.user_id, 'payout_processed', {
        amountCents: transfer.amount,
        dedupRef: orderItemId,
      }, { vertical: vendorProfile.vertical_id })
    }
  }
}

async function handleTransferFailed(transfer: Stripe.Transfer) {
  const supabase = createServiceClient()
  const orderItemId = transfer.metadata?.order_item_id
  const mbSubscriptionId = transfer.metadata?.market_box_subscription_id

  if (mbSubscriptionId) {
    // Market box subscription payout reversal.
    // MBX-3 FIX: scope to THIS transfer's row — unscoped, a reversal flipped
    // every historical payout row for the subscription to 'failed'. By reversal
    // time the row has long held stripe_transfer_id (set right after transfer).
    await supabase
      .from('vendor_payouts')
      .update({ status: 'failed' })
      .eq('market_box_subscription_id', mbSubscriptionId)
      .eq('stripe_transfer_id', transfer.id)

    // Notify vendor
    const { data: payout } = await observed(supabase
      .from('vendor_payouts')
      .select('vendor_profiles!inner(user_id, vertical_id)')
      .eq('market_box_subscription_id', mbSubscriptionId)
      .single(), { table: 'vendor_payouts' })

    const vp = (payout as unknown as { vendor_profiles: { user_id: string; vertical_id: string } })?.vendor_profiles
    if (vp?.user_id) {
      // H-6: Dedup
      const alreadySent = await wasNotificationSent(supabase, vp.user_id, 'payout_failed', mbSubscriptionId)
      if (!alreadySent) {
        await sendNotification(vp.user_id, 'payout_failed', {
          amountCents: transfer.amount,
          orderNumber: `MB-${mbSubscriptionId.slice(0, 6).toUpperCase()}`,
          reason: 'Transfer was reversed by Stripe',
          dedupRef: mbSubscriptionId,
        }, { vertical: vp.vertical_id })
      }
    }
    return
  }

  if (!orderItemId) return

  // MBX-7 FIX: scope the reversal to THIS transfer's row (id long-persisted by
  // reversal time) — unscoped, it flipped every historical payout row for the item.
  await supabase
    .from('vendor_payouts')
    .update({ status: 'failed' })
    .eq('order_item_id', orderItemId)
    .eq('stripe_transfer_id', transfer.id)

  // Notify vendor that their payout was reversed
  const { data: orderItem } = await observed(supabase
    .from('order_items')
    .select('vendor_profiles!vendor_profile_id(user_id), order:orders(vertical_id, order_number)')
    .eq('id', orderItemId)
    .single(), { table: 'order_items' })

  const vendorProfile = (orderItem as unknown as { vendor_profiles: { user_id: string } | null })?.vendor_profiles
  const orderData = (orderItem as unknown as { order: { vertical_id: string; order_number: string } | null })?.order
  if (vendorProfile?.user_id) {
    // H-6: Dedup
    const alreadySent = await wasNotificationSent(supabase, vendorProfile.user_id, 'payout_failed', orderItemId)
    if (!alreadySent) {
      await sendNotification(vendorProfile.user_id, 'payout_failed', {
        amountCents: transfer.amount,
        reason: 'Transfer was reversed by Stripe',
        dedupRef: orderItemId,
        ...(orderData?.order_number ? { orderNumber: orderData.order_number } : {}),
      }, orderData?.vertical_id ? { vertical: orderData.vertical_id } : {})
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
  const { data: payment } = await observed(supabase
    .from('payments')
    .select('order_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single(), { table: 'payments' })

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

    // Mark all non-cancelled order items as refunded (status flip only —
    // kept as one guarded bulk update so money-structure Rule A stays satisfied).
    await supabase
      .from('order_items')
      .update({ status: 'refunded' })
      .eq('order_id', payment.order_id)
      .is('cancelled_at', null)

    // S1-11/S5-1: apportion the ACTUAL refund across the non-cancelled items
    // instead of stamping the whole-order total on every one (which made
    // Σ refund_amount_cents = N× the real refund — over-counting refunds in
    // platform-revenue reports and showing the wrong per-item figure to the
    // buyer). Proportional to subtotal, floor + remainder so the parts sum
    // EXACTLY to charge.amount_refunded. (No `status:` key here, so Rule A
    // does not flag these row-keyed updates.)
    const { data: refundItems } = await observed(supabase
      .from('order_items')
      .select('id, subtotal_cents')
      .eq('order_id', payment.order_id)
      .is('cancelled_at', null), { table: 'order_items' })
    if (refundItems && refundItems.length > 0) {
      const totalSubtotal = refundItems.reduce((s, it) => s + (it.subtotal_cents || 0), 0)
      let allocated = 0
      for (let i = 0; i < refundItems.length; i++) {
        const it = refundItems[i]
        const share = i === refundItems.length - 1
          ? charge.amount_refunded - allocated
          : totalSubtotal > 0
            ? Math.floor(charge.amount_refunded * (it.subtotal_cents || 0) / totalSubtotal)
            : Math.floor(charge.amount_refunded / refundItems.length)
        allocated += share
        await supabase
          .from('order_items')
          .update({ refund_amount_cents: share })
          .eq('id', it.id)
      }
    }
  }

  // Update payment status
  await supabase
    .from('payments')
    .update({ status: isFullRefund ? 'refunded' : 'partially_refunded' })
    .eq('stripe_payment_intent_id', paymentIntentId)

  // Get order details for notifications
  const { data: order } = await observed(supabase
    .from('orders')
    .select(`
      order_number, buyer_user_id, vertical_id,
      order_items(vendor_profile_id, vendor_profiles!vendor_profile_id(user_id))
    `)
    .eq('id', payment.order_id)
    .single(), { table: 'orders' })

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
        dedupRef: payment.order_id,
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
        dedupRef: payment.order_id,
      }, { vertical: order.vertical_id })
    }
  }

  crumb.stripe(`charge.refunded processed: order ${payment.order_id}, ${isFullRefund ? 'full' : 'partial'} refund of $${(refundAmountCents / 100).toFixed(2)}`)
}

/**
 * H5: Handle chargeback (dispute) — notify admins, do NOT auto-pause vendors.
 * Chargebacks require human review; automated punitive action could harm innocent vendors.
 */
async function handleChargeDisputeCreated(dispute: Stripe.Dispute) {
  const supabase = createServiceClient()

  const disputeAmount = dispute.amount
  const disputeReason = dispute.reason || 'unknown'
  const paymentIntentId = typeof dispute.payment_intent === 'string'
    ? dispute.payment_intent
    : dispute.payment_intent?.id

  crumb.stripe(`charge.dispute.created: ${dispute.id}, amount=${disputeAmount}, reason=${disputeReason}, PI=${paymentIntentId || 'none'}`)

  // Try to find the related order via payment_intent
  let orderNumber: string | undefined
  let vertical: string | undefined

  if (paymentIntentId) {
    const { data: payment } = await observed(supabase
      .from('payments')
      .select('order_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single(), { table: 'payments' })

    if (payment?.order_id) {
      const { data: order } = await observed(supabase
        .from('orders')
        .select('order_number, vertical_id')
        .eq('id', payment.order_id)
        .single(), { table: 'orders' })

      orderNumber = order?.order_number
      vertical = order?.vertical_id
    }
  }

  // Notify all admin users about the chargeback
  const { data: admins } = await observed(supabase
    .from('user_profiles')
    .select('user_id')
    .or('role.eq.admin,role.eq.platform_admin'), { table: 'user_profiles' })

  if (admins && admins.length > 0) {
    await Promise.all(
      admins.map(async (admin) => {
        // P1-2 dedup: Stripe retries webhooks; without this gate, admins are
        // re-notified of the same dispute on every retry. Mirrors the pattern
        // already used in handleChargeRefunded (line 1022).
        const alreadySent = await wasNotificationSent(supabase, admin.user_id, 'charge_dispute_created', dispute.id)
        if (alreadySent) return
        await sendNotification(admin.user_id, 'charge_dispute_created', {
          disputeAmountCents: disputeAmount,
          disputeReason,
          dedupRef: dispute.id,
          ...(orderNumber ? { orderNumber } : {}),
        }, vertical ? { vertical } : {})
      })
    )
  }

  crumb.stripe(`charge.dispute.created processed: dispute ${dispute.id}${orderNumber ? `, order #${orderNumber}` : ''}, $${(disputeAmount / 100).toFixed(2)} — admins notified`)
}

/**
 * Event Vendor Fees (V1 2026-08-14, decisions.md). Handle a successful
 * fee Checkout session. The flip is delegated to
 * `mark_event_fee_paid_if_capacity` (mig 229) which decides FIRST PAYMENT
 * WINS under the per-event advisory lock and is idempotent on Stripe
 * retries. Outcomes:
 *   paid          → notify vendor (spot secured) + organizer (portion en route)
 *   needs_refund  → the event filled between checkout-open and payment
 *                   completion (pending rows never hold capacity, by design):
 *                   full auto-refund with a deterministic key + vendor notice.
 * Notification keys match the three event_fee_* templates in
 * notifications/types.ts — sole caller, keys named there.
 */
async function handleEventVendorFeeCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceClient()
  const paymentId = session.metadata?.payment_id
  if (!paymentId) {
    await logError(new TracedError('ERR_WEBHOOK_001', `event_vendor_fee session missing payment_id (session ${session.id})`, {
      route: '/webhooks/stripe', method: 'POST',
    }))
    return
  }
  const paymentIntentId = session.payment_intent as string

  const { data: flip, error: flipErr } = await supabase.rpc('mark_event_fee_paid_if_capacity', {
    p_payment_id: paymentId,
    p_session_id: session.id,
    p_payment_intent_id: paymentIntentId,
  })
  if (flipErr) {
    await logError(new TracedError('ERR_WEBHOOK_001', `event fee flip failed for payment ${paymentId}: ${flipErr.message}`, {
      route: '/webhooks/stripe', method: 'POST',
    }))
    return
  }
  const result = flip as { paid: boolean; reason?: string; needs_refund?: boolean }

  // Context for notifications (best-effort — a lookup failure must not
  // unpaid a paid row, so everything below is non-fatal).
  const { data: row } = await observed(supabase
    .from('event_vendor_fee_payments')
    .select('market_id, catering_request_id, vendor_profile_id, vendor_pays_cents, organizer_receives_cents')
    .eq('id', paymentId)
    .maybeSingle(), { table: 'event_vendor_fee_payments' })
  if (!row) return

  const [{ data: vp }, { data: cr }] = await Promise.all([
    supabase.from('vendor_profiles').select('user_id, profile_data').eq('id', row.vendor_profile_id).maybeSingle(),
    supabase.from('catering_requests').select('id, company_name, organizer_user_id, vertical_id').eq('id', row.catering_request_id).maybeSingle(),
  ])
  const vendorUserId = vp?.user_id as string | null
  const vendorName = ((vp?.profile_data as Record<string, unknown>)?.business_name as string)
    || ((vp?.profile_data as Record<string, unknown>)?.farm_name as string) || 'A vendor'
  const marketName = (cr?.company_name as string) || 'the event'
  const vertical = (cr?.vertical_id as string) || 'food_trucks'

  if (result.paid) {
    if (vendorUserId) {
      await sendNotification(vendorUserId, 'event_fee_paid_vendor', {
        marketName,
        marketId: row.market_id as string,
        amountCents: row.vendor_pays_cents as number,
        dedupRef: paymentId,
      }, { vertical })
    }
    if (cr?.organizer_user_id) {
      await sendNotification(cr.organizer_user_id as string, 'event_fee_received_organizer', {
        vendorName,
        marketName,
        eventId: cr.id as string,
        amountCents: row.organizer_receives_cents as number,
        dedupRef: paymentId,
      }, { vertical })
    }
    crumb.stripe(`event_vendor_fee paid: payment ${paymentId}, vendor ${row.vendor_profile_id}`)
    return
  }

  if (result.needs_refund && paymentIntentId) {
    try {
      // Phase 3 (2026-08-16): event fees are DESTINATION charges — the plain
      // createRefund left the organizer's ~93.5% transfer in place and the
      // platform ate it. refundEventFeePayment passes reverse_transfer.
      await refundEventFeePayment({ paymentIntentId, paymentId, reason: 'event_full_race' })
      await supabase
        .from('event_vendor_fee_payments')
        .update({ status: 'refunded', refunded_at: new Date().toISOString(), refund_reason: 'event_full_race' })
        .eq('id', paymentId)
        .eq('status', 'released')
      if (vendorUserId) {
        await sendNotification(vendorUserId, 'event_fee_refunded_vendor', {
          marketName,
          marketId: row.market_id as string,
          amountCents: row.vendor_pays_cents as number,
          dedupRef: paymentId,
        }, { vertical })
      }
    } catch (refundErr) {
      await logError(new TracedError('ERR_REFUND_001', `event fee race-loser refund FAILED for payment ${paymentId} — manual refund of ${row.vendor_pays_cents}¢ needed: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
        route: '/webhooks/stripe', method: 'POST',
      }))
    }
  }
}

/**
 * Phase C Stage 3 (2026-05-17). Handle a successful booth-rental
 * Stripe Checkout session — flip the corresponding weekly_booth_rentals
 * row from 'pending_payment' to 'paid' and persist the payment intent.
 *
 * Idempotency: this handler can run multiple times for the same event
 * (Stripe retries any non-2xx). Guarded two ways:
 *   1. Early return if existing.status === 'paid'.
 *   2. .neq('status', 'paid') on the UPDATE — defense-in-depth at the
 *      DB level in case two webhook deliveries race past the early
 *      return check.
 *
 * No notifications wired here yet — vendor + manager notifications
 * ship as a follow-up so this critical-path change stays focused on
 * data integrity.
 */
async function handleBoothRentalCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceClient()

  // Resolve rental_id from metadata (primary) or client_reference_id
  // (fallback). Both are set by createBoothRentalCheckoutSession; we
  // check both for defense-in-depth against metadata being stripped
  // by Stripe edge cases (size limits, etc.).
  const rentalId = session.metadata?.rental_id ||
    (session.client_reference_id?.startsWith('booth_rental_')
      ? session.client_reference_id.slice('booth_rental_'.length)
      : null)

  if (!rentalId) {
    await logError(new TracedError(
      'ERR_WEBHOOK_011',
      `booth_rental session missing rental_id (session ${session.id})`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
    return
  }

  // Look up the rental row. If absent (e.g., DB rollback after Stripe
  // session created), surface to admin — money may have been charged
  // with no row to record it.
  const { data: existing } = await observed(supabase
    .from('weekly_booth_rentals')
    .select('id, status')
    .eq('id', rentalId)
    .maybeSingle(), { table: 'weekly_booth_rentals' })

  if (!existing) {
    await logError(new TracedError(
      'ERR_WEBHOOK_012',
      `booth_rental row not found for rental_id ${rentalId} (charged but unmatched)`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
    return
  }

  // Idempotency guard. Stripe retries webhooks on any non-2xx; this
  // makes the second+ delivery a no-op.
  if (existing.status === 'paid') {
    crumb.stripe(`Booth rental ${rentalId} already paid — idempotent skip`)
    return
  }

  // MGR-4: paid in Stripe but the rental is already CANCELLED in our DB
  // (Phase 16 swept it, or the vendor cancelled) — never silently re-activate
  // and never send "booth paid" confirmations for a booking that no longer
  // exists. Mirror the season handler's cancelled_conflict path: flag for a
  // human (charge kept + booth resellable = manual reconciliation).
  if (existing.status === 'cancelled') {
    await logError(new TracedError(
      'ERR_WEBHOOK_014',
      `booth_rental ${rentalId} paid in Stripe but CANCELLED in DB — manual reconciliation needed (session ${session.id})`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
    return
  }

  const paymentIntentId = (session.payment_intent as string) || null

  const { data: flippedRows, error: updateErr } = await supabase
    .from('weekly_booth_rentals')
    .update({
      status: 'paid',
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
    })
    .eq('id', rentalId)
    .eq('status', 'pending_payment')
    .select('id')

  if (updateErr) {
    await logError(new TracedError(
      'ERR_WEBHOOK_013',
      `booth_rental status update failed for ${rentalId}: ${updateErr.message}`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
    return
  }

  // MGR-4: rowcount check closes the race the pre-check above can't (Phase 16
  // sweeping between our read and this guarded update). 0 rows = the rental
  // left 'pending_payment' after we read it — same manual-reconciliation flag,
  // and the paid notifications below must not fire.
  if (!flippedRows || flippedRows.length === 0) {
    await logError(new TracedError(
      'ERR_WEBHOOK_014',
      `booth_rental ${rentalId} paid in Stripe but no longer pending at flip time (was '${existing.status}' at read) — manual reconciliation needed (session ${session.id})`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
    return
  }

  crumb.stripe(`booth_rental ${rentalId} flipped to paid (payment_intent ${paymentIntentId ?? 'unknown'})`)

  // PRK-10 (mig 203): stamp the charge-time NET manager take from the
  // session's own metadata (exact truth — no recompute). Separate
  // non-blocking update so a pre-migration deploy can't break the paid flip.
  const mrGross = parseInt(session.metadata?.manager_receives_cents || '', 10)
  const mrCredit = parseInt(session.metadata?.applied_credit_cents || '0', 10) || 0
  if (Number.isFinite(mrGross)) {
    const { error: stampErr } = await supabase
      .from('weekly_booth_rentals')
      .update({ manager_receives_cents: Math.max(0, mrGross - mrCredit) })
      .eq('id', rentalId)
    if (stampErr) crumb.stripe(`manager_receives stamp skipped (mig 203 pending?): ${stampErr.message}`)
  }

  // Phase C Stage 3 follow-up (2026-05-19): fire vendor + manager
  // payment-complete notifications. Sits AFTER the status flip so payment
  // data integrity is unaffected by any failure here. Wrapped in try/catch
  // as belt-and-suspender — sendNotification is non-throwing by contract,
  // but a notification failure must never cause this handler to return
  // non-2xx (Stripe would retry against an already-paid row).
  try {
    // Pull full rental row for notification payload — initial SELECT
    // only got id, status. booth_number added in mig 144 (auto-assigned
    // at booking time inside the book_weekly_booth_atomic RPC); surfaced
    // in both vendor + manager confirmation notifications.
    const { data: rental } = await observed(supabase
      .from('weekly_booth_rentals')
      .select('vendor_profile_id, market_id, week_start_date, price_cents, booth_number')
      .eq('id', rentalId)
      .maybeSingle(), { table: 'weekly_booth_rentals' })

    if (rental) {
      const fees = calculateBoothRentalFees(rental.price_cents as number)

      // MGR-8: any booth credit applied at checkout reduced BOTH the vendor
      // charge and the manager transfer (payments.ts — chargedVendorCents /
      // transferCents), so the confirmations must state the NET amounts, not
      // the gross fee recompute. Metadata written by createBoothRentalCheckoutSession.
      const appliedCreditCents = Number(session.metadata?.applied_credit_cents || 0) || 0
      const vendorPaidNetCents = Math.max(0, fees.vendorPaysCents - appliedCreditCents)
      const managerReceivesNetCents = Math.max(0, fees.managerReceivesCents - appliedCreditCents)

      // Format week_start_date — DATE column is timezone-naive; parse
      // as local to avoid one-day-off display.
      const [y, m, d] = (rental.week_start_date as string).split('-').map(Number)
      const weekDate = new Date(y, m - 1, d).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })

      const [vpResult, marketResult] = await Promise.all([
        supabase
          .from('vendor_profiles')
          .select('user_id, profile_data, vertical_id')
          .eq('id', rental.vendor_profile_id as string)
          .maybeSingle(),
        supabase
          .from('markets')
          .select('name, manager_user_id, manager_email, vertical_id')
          .eq('id', rental.market_id as string)
          .maybeSingle(),
      ])

      const vp = vpResult.data
      const market = marketResult.data

      const profileData = (vp?.profile_data || {}) as Record<string, unknown>
      const vendorName =
        (profileData.business_name as string | undefined) ||
        (profileData.farm_name as string | undefined) ||
        undefined
      const marketName = (market?.name as string | undefined) || 'the market'
      const vertical =
        (market?.vertical_id as string | undefined) ||
        (vp?.vertical_id as string | undefined) ||
        'farmers_market'

      // Vendor's auth email for the email channel of the notification.
      let vendorEmail: string | null = null
      if (vp?.user_id) {
        const { data: authUser } = await supabase.auth.admin.getUserById(vp.user_id as string)
        vendorEmail = authUser?.user?.email ?? null
      }
      // Manager's email — try the markets.manager_email column first
      // (admin can pre-assign by email before user signs up); fall back to
      // auth.users lookup if manager_user_id is linked.
      let managerEmail: string | null = (market?.manager_email as string | null) ?? null
      if (!managerEmail && market?.manager_user_id) {
        const { data: managerAuth } = await supabase.auth.admin.getUserById(
          market.manager_user_id as string
        )
        managerEmail = managerAuth?.user?.email ?? null
      }

      // Mig 144: pass the auto-assigned booth label into both
      // notifications. Falls through to the template's legacy copy
      // ("manager will reach out") when null (pre-mig-144 legacy rows).
      const boothNumber = (rental.booth_number as string | null) ?? null

      // Vendor-paid notification.
      if (vp?.user_id) {
        await sendNotification(
          vp.user_id as string,
          'booth_rental_paid_vendor',
          {
            marketName,
            weekStartDate: weekDate,
            amountCents: vendorPaidNetCents,
            marketId: rental.market_id as string,
            ...(boothNumber ? { boothNumber } : {}),
          },
          {
            vertical,
            ...(vendorEmail ? { userEmail: vendorEmail } : {}),
          }
        )
      }

      // Manager-paid notification — only if manager_user_id is known.
      // (manager_email alone isn't enough — sendNotification needs a user_id
      // for the in-app channel; email-only delivery isn't supported here.)
      if (market?.manager_user_id) {
        await sendNotification(
          market.manager_user_id as string,
          'booth_rental_paid_manager',
          {
            marketName,
            weekStartDate: weekDate,
            managerReceivesAmountCents: managerReceivesNetCents,
            marketId: rental.market_id as string,
            ...(vendorName ? { vendorName } : {}),
            ...(boothNumber ? { boothNumber } : {}),
          },
          {
            vertical,
            ...(managerEmail ? { userEmail: managerEmail } : {}),
          }
        )
      }
    }
  } catch (notifErr) {
    // Logged but never re-thrown. Status flip already succeeded — Stripe
    // sees 2xx, no retry. Must reach error_logs (MGR-10): a silent failure
    // here means vendor + manager never learn a booth was paid.
    await logError(new TracedError(
      'ERR_WEBHOOK_015',
      `[handleBoothRentalCheckoutComplete] notification block failed for rental ${rentalId}: ${notifErr instanceof Error ? notifErr.message : 'Unknown'}`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
  }
}

/**
 * Phase E — handle a successful SEASON/PARTIAL booth checkout (type=
 * 'booth_rental_season'). Flips the booth_booking_groups row AND all its child
 * weekly_booth_rentals from 'pending_payment' to 'paid' by group_id, then fires
 * ONE summary notification to vendor + manager. Idempotent: group already paid
 * -> skip; .eq('status','pending_payment') on both updates guards races.
 */
async function handleSeasonBoothCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceClient()

  const groupId = session.metadata?.group_id ||
    (session.client_reference_id?.startsWith('booth_season_')
      ? session.client_reference_id.slice('booth_season_'.length)
      : null)

  if (!groupId) {
    await logError(new TracedError(
      'ERR_WEBHOOK_011',
      `booth_rental_season session missing group_id (session ${session.id})`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
    return
  }

  const { data: group } = await observed(supabase
    .from('booth_booking_groups')
    .select('id, status, vendor_profile_id, market_id, week_count, total_vendor_cents, total_manager_cents')
    .eq('id', groupId)
    .maybeSingle(), { table: 'booth_booking_groups' })

  if (!group) {
    await logError(new TracedError(
      'ERR_WEBHOOK_012',
      `booth_booking_groups row not found for group_id ${groupId} (charged but unmatched)`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
    return
  }

  // Idempotency: Stripe retries any non-2xx; second+ delivery is a no-op.
  if (group.status === 'paid') {
    crumb.stripe(`booth season ${groupId} already paid — idempotent skip`)
    return
  }

  const paymentIntentId = (session.payment_intent as string) || null

  // Atomically flip the group + all its pending children to paid (mig 167).
  // FOR UPDATE inside the RPC serializes concurrent deliveries; a real DB error
  // throws → route returns 500 → Stripe retries (the RPC is idempotent).
  const { data: confirmResult, error: confirmErr } = await supabase
    .rpc('confirm_season_paid', { p_group_id: groupId, p_payment_intent: paymentIntentId })

  if (confirmErr) {
    throw new TracedError(
      'ERR_WEBHOOK_013',
      `confirm_season_paid failed for group ${groupId}: ${confirmErr.message}`,
      { route: '/webhooks/stripe', method: 'POST' }
    )
  }

  if (confirmResult === 'cancelled_conflict') {
    // Paid in Stripe but the group is cancelled in our DB — never silently
    // re-activate (children may have been freed/re-booked). Flag for a human.
    await logError(new TracedError(
      'ERR_WEBHOOK_014',
      `booth_season group ${groupId} paid in Stripe but CANCELLED in DB — manual reconciliation needed (payment_intent ${paymentIntentId ?? 'unknown'})`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
    return
  }

  if (confirmResult === 'already_paid') {
    crumb.stripe(`booth season ${groupId} already paid — idempotent skip`)
    return
  }

  crumb.stripe(`booth season ${groupId} flipped to paid (payment_intent ${paymentIntentId ?? 'unknown'})`)

  // Vendor + manager "season paid" notifications (best-effort; never throws).
  await sendSeasonPaidNotifications(supabase, groupId)
}

/**
 * FT park-manager P2 — handle a successful park-spot checkout (type='park_spot').
 * Flips every park_spot_bookings row in the booking_group_id bundle from
 * 'pending_payment' to 'paid'. Idempotent (already-paid → skip; no-pending →
 * flag for reconciliation). Notifications deferred (mirrors the original
 * booth_rental handler — data integrity first).
 */
async function handleParkSpotCheckoutComplete(session: Stripe.Checkout.Session) {
  const supabase = createServiceClient()

  const groupId = session.metadata?.group_id ||
    (session.client_reference_id?.startsWith('park_spot_')
      ? session.client_reference_id.slice('park_spot_'.length)
      : null)

  if (!groupId) {
    await logError(new TracedError(
      'ERR_WEBHOOK_011',
      `park_spot session missing group_id (session ${session.id})`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
    return
  }

  const { data: bookings } = await observed(supabase
    .from('park_spot_bookings')
    .select('id, status, market_id, vendor_profile_id, spot_id, booking_date')
    .eq('booking_group_id', groupId), { table: 'park_spot_bookings' })

  if (!bookings || bookings.length === 0) {
    await logError(new TracedError(
      'ERR_WEBHOOK_012',
      `park_spot bookings not found for group_id ${groupId} (charged but unmatched)`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
    return
  }

  // Idempotency: Stripe retries any non-2xx; second+ delivery is a no-op.
  if (bookings.some((b) => b.status === 'paid')) {
    crumb.stripe(`park_spot group ${groupId} already paid — idempotent skip`)
    return
  }

  // Paid in Stripe but no pending rows (all cancelled) — never silently
  // re-activate; flag for a human.
  if (!bookings.some((b) => b.status === 'pending_payment')) {
    await logError(new TracedError(
      'ERR_WEBHOOK_014',
      `park_spot group ${groupId} paid in Stripe but no pending rows (cancelled?) — manual reconciliation`,
      { route: '/webhooks/stripe', method: 'POST' }
    ))
    return
  }

  const paymentIntentId = (session.payment_intent as string) || null

  const { error: updateErr } = await supabase
    .from('park_spot_bookings')
    .update({
      status: 'paid',
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
    })
    .eq('booking_group_id', groupId)
    .eq('status', 'pending_payment')

  if (updateErr) {
    throw new TracedError(
      'ERR_WEBHOOK_013',
      `park_spot status update failed for group ${groupId}: ${updateErr.message}`,
      { route: '/webhooks/stripe', method: 'POST' }
    )
  }

  crumb.stripe(`park_spot group ${groupId} flipped to paid (payment_intent ${paymentIntentId ?? 'unknown'})`)

  // PRK-10 (mig 203): stamp per-row charge-time NET manager take from session
  // metadata — (manager_receives_total − applied_credit) prorated floor+
  // remainder across the group's just-flipped rows, so the stamps sum EXACTLY
  // to the Stripe transfer. Separate non-blocking updates: a pre-migration
  // deploy (unknown column) logs a crumb and can't affect the flip.
  const prkGrossTotal = parseInt(session.metadata?.manager_receives_total_cents || '', 10)
  const prkCredit = parseInt(session.metadata?.applied_credit_cents || '0', 10) || 0
  if (Number.isFinite(prkGrossTotal)) {
    const netTotal = Math.max(0, prkGrossTotal - prkCredit)
    const flippedBookings = bookings.filter((b) => b.status === 'pending_payment')
    const n = flippedBookings.length
    if (n > 0) {
      const base = Math.floor(netTotal / n)
      let remainder = netTotal - base * n
      for (const b of flippedBookings) {
        const share = base + (remainder > 0 ? 1 : 0)
        if (remainder > 0) remainder--
        const { error: stampErr } = await supabase
          .from('park_spot_bookings')
          .update({ manager_receives_cents: share })
          .eq('id', b.id)
        if (stampErr) {
          crumb.stripe(`manager_receives stamp skipped (mig 203 pending?): ${stampErr.message}`)
          break
        }
      }
    }
  }

  // Paid confirmations (non-throwing — the status flip already succeeded, so a
  // notification failure must NOT fail the webhook; Stripe would otherwise
  // retry a completed booking). Mirrors handleBoothRentalCheckoutComplete.
  try {
    const first = bookings[0]
    const marketId = first.market_id as string
    const vendorProfileId = first.vendor_profile_id as string
    const spotId = first.spot_id as string
    const dayCount = bookings.length

    // P10 Layer 2 (2026-07-15): a paid booking means the truck is SELLING here —
    // auto-create/activate their vendor_market_schedules rows for the booked
    // days so buyers can order pickup (mig 131: no schedule row = no pickup
    // dates = an invisible truck). The booking route's date-aware pre-check
    // (Layer 1) already guaranteed these rows are conflict-free; multiple_trucks
    // vendors skipped that check by their own election. Non-throwing zone.
    let scheduleAutoSet = false
    const bookedDows = new Set(
      bookings
        .map((b) => b.booking_date as string | null)
        .filter((d): d is string => !!d)
        .map((d) => {
          const [y, m, dd] = d.split('-').map(Number)
          return new Date(Date.UTC(y, m - 1, dd)).getUTCDay()
        })
    )
    if (bookedDows.size > 0) {
      const { data: parkSchedules } = await observed(supabase
        .from('market_schedules')
        .select('id, day_of_week')
        .eq('market_id', marketId)
        .eq('active', true), { table: 'market_schedules' })
      const targetScheduleIds = (parkSchedules ?? [])
        .filter((s) => bookedDows.has(s.day_of_week as number))
        .map((s) => s.id as string)
      if (targetScheduleIds.length > 0) {
        const { data: existingVms } = await observed(supabase
          .from('vendor_market_schedules')
          .select('schedule_id, is_active')
          .eq('vendor_profile_id', vendorProfileId)
          .eq('market_id', marketId)
          .in('schedule_id', targetScheduleIds), { table: 'vendor_market_schedules' })
        const existingBySchedule = new Map((existingVms ?? []).map((e) => [e.schedule_id as string, e.is_active as boolean | null]))

        const toInsert = targetScheduleIds.filter((sid) => !existingBySchedule.has(sid))
        const toReactivate = targetScheduleIds.filter((sid) => existingBySchedule.get(sid) === false)
        if (toInsert.length > 0) {
          const { error: vmsInsertErr } = await supabase
            .from('vendor_market_schedules')
            .insert(toInsert.map((sid) => ({
              vendor_profile_id: vendorProfileId,
              market_id: marketId,
              schedule_id: sid,
              is_active: true,
            })))
          if (!vmsInsertErr) scheduleAutoSet = true
          else {
            await logError(new TracedError('ERR_DB_UNKNOWN', `[park paid] auto-create vendor schedule failed for vendor ${vendorProfileId} at market ${marketId}: ${vmsInsertErr.message}`, {
              route: '/webhooks/stripe', method: 'POST',
            }))
          }
        }
        if (toReactivate.length > 0) {
          const { error: vmsUpdateErr } = await supabase
            .from('vendor_market_schedules')
            .update({ is_active: true })
            .eq('vendor_profile_id', vendorProfileId)
            .eq('market_id', marketId)
            .in('schedule_id', toReactivate)
          if (!vmsUpdateErr) scheduleAutoSet = true
        }
      }
    }

    // Tester finding P8 (2026-07-15): confirmations said "for 2 days" with no
    // dates. booking_date is a market-local calendar date ('YYYY-MM-DD') — format
    // via UTC so the label can't shift a day on the UTC-clocked server.
    const fmtBookingDate = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number)
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
      })
    }
    const sortedDates = bookings
      .map(b => b.booking_date as string)
      .filter(Boolean)
      .sort()
    const datesText =
      sortedDates.length === 0
        ? undefined
        : sortedDates.length <= 3
          ? sortedDates.map(fmtBookingDate).join(' & ')
          : `${fmtBookingDate(sortedDates[0])} – ${fmtBookingDate(sortedDates[sortedDates.length - 1])} (${sortedDates.length} days)`

    const [vpResult, marketResult, spotResult] = await Promise.all([
      supabase.from('vendor_profiles').select('user_id, profile_data, vertical_id').eq('id', vendorProfileId).maybeSingle(),
      supabase.from('markets').select('name, manager_user_id, manager_email, vertical_id').eq('id', marketId).maybeSingle(),
      supabase.from('park_spots').select('label').eq('id', spotId).maybeSingle(),
    ])
    const vp = vpResult.data
    const market = marketResult.data
    const spotLabel = (spotResult.data?.label as string | undefined) || undefined
    const profileData = (vp?.profile_data || {}) as Record<string, unknown>
    const vendorName =
      (profileData.business_name as string | undefined) ||
      (profileData.farm_name as string | undefined) ||
      undefined
    const marketName = (market?.name as string | undefined) || 'the park'
    const vertical =
      (market?.vertical_id as string | undefined) ||
      (vp?.vertical_id as string | undefined) ||
      'food_trucks'

    let vendorEmail: string | null = null
    if (vp?.user_id) {
      const { data: authUser } = await supabase.auth.admin.getUserById(vp.user_id as string)
      vendorEmail = authUser?.user?.email ?? null
    }
    let managerEmail: string | null = (market?.manager_email as string | null) ?? null
    if (!managerEmail && market?.manager_user_id) {
      const { data: managerAuth } = await supabase.auth.admin.getUserById(market.manager_user_id as string)
      managerEmail = managerAuth?.user?.email ?? null
    }

    if (vp?.user_id) {
      await sendNotification(
        vp.user_id as string,
        'park_spot_paid_vendor',
        {
          marketName,
          marketId,
          dayCount,
          ...(spotLabel ? { spotLabel } : {}),
          ...(datesText ? { datesText } : {}),
          ...(scheduleAutoSet ? { scheduleAutoSet: true } : {}),
          // Tester finding 2026-07-23: put the amount the truck paid on the
          // receipt. session.amount_total is the fee-inclusive Stripe charge.
          // Additive to the notification payload only — no booking/Stripe change.
          ...(session.amount_total ? { amountCents: session.amount_total } : {}),
        },
        { vertical, ...(vendorEmail ? { userEmail: vendorEmail } : {}) }
      )
    }
    if (market?.manager_user_id) {
      await sendNotification(
        market.manager_user_id as string,
        'park_spot_paid_manager',
        {
          marketName,
          marketId,
          dayCount,
          ...(vendorName ? { vendorName } : {}),
          ...(spotLabel ? { spotLabel } : {}),
          ...(datesText ? { datesText } : {}),
        },
        { vertical, ...(managerEmail ? { userEmail: managerEmail } : {}) }
      )
    }
  } catch (notifErr) {
    // PRK-11: must reach error_logs — the paid flip already succeeded, but a
    // silently-skipped paid confirmation means truck+operator never learn of it.
    await logError(new TracedError('ERR_WEBHOOK_015', `park_spot paid-confirmation notification block failed for group ${groupId}: ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, {
      route: '/webhooks/stripe', method: 'POST',
    }))
  }
}
