import { stripe } from './config'

// NOTE: Fee calculations have moved to src/lib/pricing.ts
// Use calculateOrderPricing() from there instead

/**
 * Create checkout session
 */
export async function createCheckoutSession({
  orderId,
  orderNumber,
  items,
  successUrl,
  cancelUrl,
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
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: orderId,
      metadata: {
        order_id: orderId,
        order_number: orderNumber,
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
}: {
  amount: number // cents
  destination: string // Stripe account ID
  orderId: string
  orderItemId: string
}) {
  const transfer = await stripe.transfers.create(
    {
      amount,
      currency: 'usd',
      destination,
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
 * Create market box checkout session
 * One-time payment for prepaid weekly pickup subscription
 */
export async function createMarketBoxCheckoutSession({
  offeringId,
  offeringName,
  userId,
  termWeeks,
  priceCents,
  startDate,
  successUrl,
  cancelUrl,
}: {
  offeringId: string
  offeringName: string
  userId: string
  termWeeks: number
  priceCents: number
  startDate: string
  successUrl: string
  cancelUrl: string
}) {
  // Deterministic idempotency key — retries hit the same Stripe session instead of creating duplicates
  const idempotencyKey = `market-box-${offeringId}-${userId}-${startDate}`

  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ['card'],
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
      metadata: {
        type: 'market_box',
        offering_id: offeringId,
        user_id: userId,
        term_weeks: termWeeks.toString(),
        start_date: startDate,
        price_cents: priceCents.toString(),
      },
    },
    {
      idempotencyKey,
    }
  )

  return session
}

/**
 * Create refund
 * Uses idempotency key to prevent duplicate refunds on retry
 */
export async function createRefund(paymentIntentId: string, amount?: number) {
  const idempotencyKey = `refund-${paymentIntentId}-${amount ?? 'full'}`

  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      amount,
    },
    {
      idempotencyKey,
    }
  )

  return refund
}
