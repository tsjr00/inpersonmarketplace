import Stripe from 'stripe'

// Only initialize Stripe if we have the secret key (allows builds without env vars)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
      typescript: true,
    })
  : (null as unknown as Stripe)

export const STRIPE_CONFIG = {
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
  applicationFeePercent: 13.0, // 6.5% buyer + 6.5% vendor
  buyerFeePercent: 6.5,
  vendorFeePercent: 6.5,
  buyerFlatFeeCents: 15, // $0.15 flat fee added to buyer price
  vendorFlatFeeCents: 15, // $0.15 flat fee deducted from vendor payout
  minimumOrderCents: 1000, // $10.00 minimum cart total (before fees)
}
