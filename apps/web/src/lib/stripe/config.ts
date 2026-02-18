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

// Subscription pricing for premium tiers
// Price IDs must be created in Stripe Dashboard and added to environment variables
export const SUBSCRIPTION_PRICES = {
  vendor: {
    monthly: {
      priceId: process.env.STRIPE_VENDOR_MONTHLY_PRICE_ID || '',
      amountCents: 2499, // $24.99/month
    },
    annual: {
      priceId: process.env.STRIPE_VENDOR_ANNUAL_PRICE_ID || '',
      amountCents: 20815, // $208.15/year (saves 30%)
    },
  },
  buyer: {
    monthly: {
      priceId: process.env.STRIPE_BUYER_MONTHLY_PRICE_ID || '',
      amountCents: 999, // $9.99/month
    },
    annual: {
      priceId: process.env.STRIPE_BUYER_ANNUAL_PRICE_ID || '',
      amountCents: 8150, // $81.50/year (saves 32%)
    },
  },
  // Food truck vendor tiers (monthly only for launch)
  food_truck_vendor: {
    basic_monthly: {
      priceId: process.env.STRIPE_FT_BASIC_MONTHLY_PRICE_ID || '',
      amountCents: 1000, // $10/month
    },
    pro_monthly: {
      priceId: process.env.STRIPE_FT_PRO_MONTHLY_PRICE_ID || '',
      amountCents: 3000, // $30/month
    },
    boss_monthly: {
      priceId: process.env.STRIPE_FT_BOSS_MONTHLY_PRICE_ID || '',
      amountCents: 5000, // $50/month
    },
  },
}

// Helper to check if subscription prices are configured (FM vendor + buyer)
export function areSubscriptionPricesConfigured(): boolean {
  return !!(
    SUBSCRIPTION_PRICES.vendor.monthly.priceId &&
    SUBSCRIPTION_PRICES.vendor.annual.priceId &&
    SUBSCRIPTION_PRICES.buyer.monthly.priceId &&
    SUBSCRIPTION_PRICES.buyer.annual.priceId
  )
}

// Helper to check if FT subscription prices are configured
export function areFtPricesConfigured(): boolean {
  return !!(
    SUBSCRIPTION_PRICES.food_truck_vendor.basic_monthly.priceId &&
    SUBSCRIPTION_PRICES.food_truck_vendor.pro_monthly.priceId &&
    SUBSCRIPTION_PRICES.food_truck_vendor.boss_monthly.priceId
  )
}

// Get FT price config by tier name
export function getFtPriceConfig(tier: string): { priceId: string; amountCents: number } | null {
  const key = `${tier}_monthly` as keyof typeof SUBSCRIPTION_PRICES.food_truck_vendor
  return SUBSCRIPTION_PRICES.food_truck_vendor[key] || null
}
