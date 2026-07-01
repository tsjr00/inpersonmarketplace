import { stripe } from './config'

// NOTE: Fee calculations have moved to src/lib/pricing.ts
// Use calculateOrderPricing() from there instead

/**
 * Get Stripe statement descriptor suffix for a vertical.
 * Appears on buyer bank statements after the platform name (815ENTERPRISES).
 * Max 22 chars. Stripe auto-uppercases and strips invalid chars.
 */
export function getStatementSuffix(vertical?: string | null): string {
  switch (vertical) {
    case 'food_trucks': return 'FOOD TRUCKN'
    case 'fire_works': return 'FIREWORKS'
    case 'farmers_market': return 'FARMERS MARKETING'
    default: return 'MARKETPLACE'
  }
}

/**
 * Create checkout session
 */
export async function createCheckoutSession({
  orderId,
  orderNumber,
  items,
  successUrl,
  cancelUrl,
  metadata,
  vertical,
}: {
  orderId: string
  orderNumber: string
  items: Array<{
    name: string
    description: string
    amount: number // cents
    quantity: number
  }>
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
  vertical?: string
}) {
  const lineItems = items.map((item) => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: item.name,
        description: item.description,
      },
      unit_amount: item.amount,
    },
    quantity: item.quantity,
  }))

  const session = await stripe.checkout.sessions.create(
    {
      // Explicitly list all payment methods so buyers see every option.
      // Apple Pay + Google Pay are wallet options within 'card' (not separate types).
      payment_method_types: ['card', 'cashapp', 'amazon_pay', 'link'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: orderId,
      payment_intent_data: {
        statement_descriptor_suffix: getStatementSuffix(vertical),
      },
      metadata: {
        order_id: orderId,
        order_number: orderNumber,
        ...(metadata || {}),
      },
    },
    {
      idempotencyKey: `checkout-${orderId}`,
    }
  )

  return session
}

/**
 * Create transfer to vendor
 * Uses idempotency key to prevent duplicate transfers on retry
 */
export async function transferToVendor({
  amount,
  destination,
  orderId,
  orderItemId,
  sourceTransaction,
}: {
  amount: number // cents
  destination: string // Stripe account ID
  orderId: string
  orderItemId: string
  sourceTransaction?: string // Charge ID — ties transfer to specific payment, avoids balance_insufficient
}) {
  const transfer = await stripe.transfers.create(
    {
      amount,
      currency: 'usd',
      destination,
      ...(sourceTransaction ? { source_transaction: sourceTransaction } : {}),
      metadata: {
        order_id: orderId,
        order_item_id: orderItemId,
      },
    },
    {
      idempotencyKey: `transfer-${orderId}-${orderItemId}`,
    }
  )

  return transfer
}

/**
 * Get the charge ID from a payment intent.
 * Used to pass source_transaction to vendor transfers.
 */
export async function getChargeIdFromPaymentIntent(paymentIntentId: string): Promise<string | null> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    return (pi.latest_charge as string) || null
  } catch {
    return null
  }
}

/**
 * Create market box checkout session
 * One-time payment for prepaid weekly pickup subscription
 */
export async function createMarketBoxCheckoutSession({
  offeringId,
  offeringName,
  userId,
  termWeeks,
  priceCents,
  basePriceCents,
  startDate,
  successUrl,
  cancelUrl,
  vertical,
}: {
  offeringId: string
  offeringName: string
  userId: string
  termWeeks: number
  priceCents: number
  basePriceCents?: number
  startDate: string
  successUrl: string
  cancelUrl: string
  vertical?: string
}) {
  // Deterministic idempotency key — retries hit the same Stripe session instead of creating duplicates
  const idempotencyKey = `market-box-${offeringId}-${userId}-${startDate}`

  const session = await stripe.checkout.sessions.create(
    {
      // Explicitly list all payment methods so buyers see every option.
      // Apple Pay + Google Pay are wallet options within 'card' (not separate types).
      payment_method_types: ['card', 'cashapp', 'amazon_pay', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${offeringName} - ${termWeeks} Week Market Box`,
              description: `Prepaid ${termWeeks}-week market box subscription starting ${startDate}`,
            },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: `market_box_${offeringId}_${userId}`,
      payment_intent_data: {
        statement_descriptor_suffix: getStatementSuffix(vertical),
      },
      metadata: {
        type: 'market_box',
        offering_id: offeringId,
        user_id: userId,
        term_weeks: termWeeks.toString(),
        start_date: startDate,
        price_cents: priceCents.toString(),
        ...(basePriceCents !== undefined ? { base_price_cents: basePriceCents.toString() } : {}),
      },
    },
    {
      idempotencyKey,
    }
  )

  return session
}

/**
 * Create transfer to vendor for market box subscription payout
 * Full prepaid amount transferred when buyer pays (not per-pickup)
 * Uses subscription-specific idempotency key to prevent duplicate transfers
 */
export async function transferMarketBoxPayout({
  amount,
  destination,
  subscriptionId,
  sourceTransaction,
}: {
  amount: number // cents
  destination: string // Stripe account ID
  subscriptionId: string // market_box_subscriptions.id
  sourceTransaction?: string // Charge ID — ties transfer to specific payment, avoids balance_insufficient
}) {
  const transfer = await stripe.transfers.create(
    {
      amount,
      currency: 'usd',
      destination,
      ...(sourceTransaction ? { source_transaction: sourceTransaction } : {}),
      metadata: {
        market_box_subscription_id: subscriptionId,
      },
    },
    {
      idempotencyKey: `transfer-mb-sub-${subscriptionId}`,
    }
  )

  return transfer
}

/**
 * Create refund
 * Uses idempotency key to prevent duplicate refunds on retry.
 * idempotencySuffix MUST be unique per refund within the payment intent
 * (order item id, offering id). Without it, two same-priced items on one
 * order produced identical keys and Stripe silently returned the first
 * refund's cached response — the second refund was never created.
 */
export async function createRefund(paymentIntentId: string, idempotencySuffix: string, amount?: number) {
  const idempotencyKey = `refund-${paymentIntentId}-${idempotencySuffix}-${amount ?? 'full'}`

  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      ...(amount !== undefined ? { amount } : {}),
    },
    {
      idempotencyKey,
    }
  )

  return refund
}

/**
 * Create Stripe Checkout session for a weekly booth rental.
 *
 * Phase C Stage 3 (2026-05-17). Uses Stripe's destination-charge model
 * (`transfer_data.destination`) so the manager's portion auto-routes to
 * their Connect account at payment time — single API call, no later
 * transfer needed. Different from product orders (which use the
 * separate-transfer pattern via transferToVendor) because booth rental
 * is 1:1 with no fulfillment delay.
 *
 * Math (vendorPaysCents, managerReceivesCents) comes from
 * calculateBoothRentalFees() in pricing.ts — this function does no math
 * of its own. Caller is responsible for passing pre-computed amounts.
 *
 * Idempotency key `booth-rental-${rentalId}` is deterministic; retries
 * resolve to the same session. Distinct from `checkout-${orderId}` and
 * `market-box-${...}` namespaces — no collisions across transaction types.
 *
 * metadata.type='booth_rental' is the webhook routing signal (Step 4).
 * The webhook handler in stripe/webhooks.ts will inspect this field to
 * dispatch the `checkout.session.completed` event to the booth-rental
 * status-flip path.
 */
export async function createBoothRentalCheckoutSession({
  rentalId,
  marketId,
  marketName,
  managerStripeAccountId,
  weekStartDate,
  basePriceCents,
  vendorPaysCents,
  managerReceivesCents,
  appliedCreditCents = 0,
  successUrl,
  cancelUrl,
  vertical,
}: {
  rentalId: string
  marketId: string
  marketName: string
  managerStripeAccountId: string  // markets.stripe_account_id
  weekStartDate: string            // YYYY-MM-DD
  basePriceCents: number           // for audit metadata only
  vendorPaysCents: number          // unit_amount on the line item
  managerReceivesCents: number     // transfer_data.amount
  appliedCreditCents?: number      // booth credit applied (reduces BOTH sides)
  successUrl: string
  cancelUrl: string
  vertical?: string
}) {
  const idempotencyKey = `booth-rental-${rentalId}`

  // Item 4b: apply booth credit equally to both sides → platform fee invariant.
  // Caller caps appliedCreditCents <= managerReceivesCents, so neither goes negative.
  const chargedVendorCents = vendorPaysCents - appliedCreditCents
  const transferCents = managerReceivesCents - appliedCreditCents

  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ['card', 'cashapp', 'amazon_pay', 'link'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Booth rental — ${marketName}`,
            description: `Week of ${weekStartDate}`,
          },
          unit_amount: chargedVendorCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: `booth_rental_${rentalId}`,
      payment_intent_data: {
        statement_descriptor_suffix: getStatementSuffix(vertical),
        transfer_data: {
          destination: managerStripeAccountId,
          amount: transferCents,
        },
      },
      metadata: {
        type: 'booth_rental',
        rental_id: rentalId,
        market_id: marketId,
        week_start_date: weekStartDate,
        base_price_cents: basePriceCents.toString(),
        vendor_pays_cents: vendorPaysCents.toString(),
        manager_receives_cents: managerReceivesCents.toString(),
        applied_credit_cents: appliedCreditCents.toString(),
      },
    },
    { idempotencyKey }
  )

  return session
}

/**
 * Phase E — Stripe Checkout for a SEASON/PARTIAL booth purchase (one payment,
 * N weeks). Sibling to createBoothRentalCheckoutSession; same destination-charge
 * model, generalized to one line item per week with a single summed transfer to
 * the manager. The webhook (type='booth_rental_season') flips the whole group +
 * its child rentals to paid by group_id.
 *
 * Per-week vendorPaysCents come from calculateBoothRentalFees per week (per-week
 * rounding, matching the one-off line items); managerReceivesTotalCents is the
 * sum of the per-week manager shares. Idempotency key is deterministic.
 */
export async function createSeasonBoothCheckoutSession({
  groupId,
  marketId,
  marketName,
  managerStripeAccountId,
  weeks,
  managerReceivesTotalCents,
  appliedCreditCents = 0,
  successUrl,
  cancelUrl,
  vertical,
}: {
  groupId: string
  marketId: string
  marketName: string
  managerStripeAccountId: string                       // markets.stripe_account_id
  weeks: Array<{ weekStartDate: string; vendorPaysCents: number }>
  managerReceivesTotalCents: number                    // transfer_data.amount (sum)
  appliedCreditCents?: number                          // booth credit applied (reduces BOTH sides)
  successUrl: string
  cancelUrl: string
  vertical?: string
}) {
  const idempotencyKey = `booth-season-${groupId}`

  // One consolidated line item for the whole season (the vendor pays once).
  // Total = sum of the per-week vendor amounts — identical charge to itemizing
  // each week; only the checkout/receipt display collapses to a single line.
  const totalVendorPaysCents = weeks.reduce((sum, w) => sum + w.vendorPaysCents, 0)
  // Item 4: apply booth credit equally to both sides so the platform fee stays
  // invariant. Caller guarantees appliedCreditCents <= managerReceivesTotalCents
  // (redeem RPC caps to balance; route caps requested to the manager total), so
  // neither amount goes negative.
  const chargedVendorCents = totalVendorPaysCents - appliedCreditCents
  const transferCents = managerReceivesTotalCents - appliedCreditCents
  const firstWeek = weeks[0]?.weekStartDate
  const lastWeek = weeks[weeks.length - 1]?.weekStartDate
  const rangeLabel =
    firstWeek && lastWeek && firstWeek !== lastWeek
      ? ` (${firstWeek} – ${lastWeek})`
      : firstWeek ? ` (${firstWeek})` : ''

  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ['card', 'cashapp', 'amazon_pay', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Booth season — ${marketName}`,
              description: `${weeks.length} week${weeks.length === 1 ? '' : 's'}${rangeLabel}`,
            },
            unit_amount: chargedVendorCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: `booth_season_${groupId}`,
      payment_intent_data: {
        statement_descriptor_suffix: getStatementSuffix(vertical),
        transfer_data: {
          destination: managerStripeAccountId,
          amount: transferCents,
        },
      },
      metadata: {
        type: 'booth_rental_season',
        group_id: groupId,
        market_id: marketId,
        week_count: weeks.length.toString(),
        manager_receives_total_cents: managerReceivesTotalCents.toString(),
        applied_credit_cents: appliedCreditCents.toString(),
      },
    },
    { idempotencyKey }
  )

  return session
}

/**
 * FT park-manager P2 — Stripe Checkout for a park SPOT booking (one payment,
 * one spot, N dates). Sibling to createSeasonBoothCheckoutSession: a
 * consolidated single-line destination charge with a summed transfer to the
 * operator. The webhook (type='park_spot') flips park_spot_bookings by
 * booking_group_id to paid. No booth-credit path (FT has none).
 *
 * Does NO math of its own — per-date vendorPaysCents + managerReceivesTotalCents
 * are pre-computed by the caller via pricing.ts calculateBoothRentalFees (same
 * contract as the booth functions). Idempotency key `park-spot-${groupId}` is
 * deterministic (single-date bookings get a group-of-one id from the route).
 */
export async function createParkSpotCheckoutSession({
  groupId,
  marketId,
  marketName,
  spotLabel,
  managerStripeAccountId,
  dates,
  managerReceivesTotalCents,
  successUrl,
  cancelUrl,
  vertical,
}: {
  groupId: string
  marketId: string
  marketName: string
  spotLabel: string
  managerStripeAccountId: string                      // markets.stripe_account_id
  dates: Array<{ bookingDate: string; vendorPaysCents: number }>
  managerReceivesTotalCents: number                   // transfer_data.amount (sum)
  successUrl: string
  cancelUrl: string
  vertical?: string
}) {
  const idempotencyKey = `park-spot-${groupId}`

  // One consolidated line for the whole booking (single day or prepay-week).
  // Total = sum of the per-day vendor amounts — identical charge to itemizing.
  const totalVendorPaysCents = dates.reduce((sum, d) => sum + d.vendorPaysCents, 0)
  const firstDate = dates[0]?.bookingDate
  const lastDate = dates[dates.length - 1]?.bookingDate
  const rangeLabel =
    firstDate && lastDate && firstDate !== lastDate
      ? ` (${firstDate} – ${lastDate})`
      : firstDate ? ` (${firstDate})` : ''

  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ['card', 'cashapp', 'amazon_pay', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Spot rental — ${marketName}`,
              description: `${spotLabel} · ${dates.length} day${dates.length === 1 ? '' : 's'}${rangeLabel}`,
            },
            unit_amount: totalVendorPaysCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: `park_spot_${groupId}`,
      payment_intent_data: {
        statement_descriptor_suffix: getStatementSuffix(vertical),
        transfer_data: {
          destination: managerStripeAccountId,
          amount: managerReceivesTotalCents,
        },
      },
      metadata: {
        type: 'park_spot',
        group_id: groupId,
        market_id: marketId,
        day_count: dates.length.toString(),
        manager_receives_total_cents: managerReceivesTotalCents.toString(),
      },
    },
    { idempotencyKey }
  )

  return session
}
