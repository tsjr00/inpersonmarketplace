import { stripe, STRIPE_CONFIG } from './config'

/**
 * Calculate fees for transaction
 */
export function calculateFees(basePriceCents: number) {
  const buyerFeeCents = Math.round(
    basePriceCents * (STRIPE_CONFIG.buyerFeePercent / 100)
  )
  const vendorFeeCents = Math.round(
    basePriceCents * (STRIPE_CONFIG.vendorFeePercent / 100)
  )

  const buyerPaysCents = basePriceCents + buyerFeeCents
  const vendorGetsCents = basePriceCents - vendorFeeCents
  const platformFeeCents = buyerFeeCents + vendorFeeCents

  return {
    basePriceCents,
    buyerFeeCents,
    vendorFeeCents,
    buyerPaysCents,
    vendorGetsCents,
    platformFeeCents,
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

  const session = await stripe.checkout.sessions.create({
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
  })

  return session
}

/**
 * Create transfer to vendor
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
  const transfer = await stripe.transfers.create({
    amount,
    currency: 'usd',
    destination,
    metadata: {
      order_id: orderId,
      order_item_id: orderItemId,
    },
  })

  return transfer
}

/**
 * Create refund
 */
export async function createRefund(paymentIntentId: string, amount?: number) {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,
  })

  return refund
}
