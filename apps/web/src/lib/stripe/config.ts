import Stripe from 'stripe'
import { FEES } from '@/lib/pricing'

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
  applicationFeePercent: FEES.buyerFeePercent + FEES.vendorFeePercent,
  buyerFeePercent: FEES.buyerFeePercent,
  vendorFeePercent: FEES.vendorFeePercent,
  buyerFlatFeeCents: FEES.buyerFlatFeeCents,
  vendorFlatFeeCents: FEES.vendorFlatFeeCents,
}

// Subscription pricing — unified Pro ($25/mo) / Boss ($50/mo) for all verticals
// Price IDs must be created in Stripe Dashboard and added to environment variables
export const SUBSCRIPTION_PRICES = {
  // Vendor tiers — same pricing for both verticals
  // Each vertical may have its own Stripe Price IDs but the amounts are identical
  vendor: {
    pro_monthly: {
      priceId: process.env.STRIPE_VENDOR_PRO_MONTHLY_PRICE_ID || process.env.STRIPE_FT_PRO_MONTHLY_PRICE_ID || process.env.STRIPE_FM_PREMIUM_MONTHLY_PRICE_ID || '',
      amountCents: 2500, // $25/month
    },
    pro_annual: {
      priceId: process.env.STRIPE_VENDOR_PRO_ANNUAL_PRICE_ID || process.env.STRIPE_FT_PRO_ANNUAL_PRICE_ID || process.env.STRIPE_FM_PREMIUM_ANNUAL_PRICE_ID || '',
      amountCents: 20815, // $208.15/year (saves ~30%)
    },
    boss_monthly: {
      priceId: process.env.STRIPE_VENDOR_BOSS_MONTHLY_PRICE_ID || process.env.STRIPE_FT_BOSS_MONTHLY_PRICE_ID || process.env.STRIPE_FM_FEATURED_MONTHLY_PRICE_ID || '',
      amountCents: 5000, // $50/month
    },
    boss_annual: {
      priceId: process.env.STRIPE_VENDOR_BOSS_ANNUAL_PRICE_ID || process.env.STRIPE_FT_BOSS_ANNUAL_PRICE_ID || process.env.STRIPE_FM_FEATURED_ANNUAL_PRICE_ID || '',
      amountCents: 48150, // $481.50/year (saves ~20%)
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
  // Legacy references kept for backward compat (point to unified vendor prices)
  fm_premium: {
    monthly: { get priceId() { return SUBSCRIPTION_PRICES.vendor.pro_monthly.priceId }, amountCents: 2500 },
    annual: { get priceId() { return SUBSCRIPTION_PRICES.vendor.pro_annual.priceId }, amountCents: 20815 },
  },
  fm_vendor: {
    standard_monthly: { priceId: '', amountCents: 0 }, // standard is now free
    standard_annual: { priceId: '', amountCents: 0 },
    featured_monthly: { get priceId() { return SUBSCRIPTION_PRICES.vendor.boss_monthly.priceId }, amountCents: 5000 },
    featured_annual: { get priceId() { return SUBSCRIPTION_PRICES.vendor.boss_annual.priceId }, amountCents: 48150 },
  },
  food_truck_vendor: {
    basic_monthly: { priceId: '', amountCents: 0 }, // basic is now free
    basic_annual: { priceId: '', amountCents: 0 },
    pro_monthly: { get priceId() { return SUBSCRIPTION_PRICES.vendor.pro_monthly.priceId }, amountCents: 2500 },
    pro_annual: { get priceId() { return SUBSCRIPTION_PRICES.vendor.pro_annual.priceId }, amountCents: 20815 },
    boss_monthly: { get priceId() { return SUBSCRIPTION_PRICES.vendor.boss_monthly.priceId }, amountCents: 5000 },
    boss_annual: { get priceId() { return SUBSCRIPTION_PRICES.vendor.boss_annual.priceId }, amountCents: 48150 },
  },
}

// Check if vendor subscription prices are configured
export function areSubscriptionPricesConfigured(): boolean {
  return !!(SUBSCRIPTION_PRICES.vendor.pro_monthly.priceId && SUBSCRIPTION_PRICES.buyer.monthly.priceId)
}

/** @deprecated Use areSubscriptionPricesConfigured */
export function areFtPricesConfigured(): boolean {
  return !!SUBSCRIPTION_PRICES.vendor.pro_monthly.priceId
}

export function areVerticalPricesConfigured(_vertical: string): boolean {
  return !!SUBSCRIPTION_PRICES.vendor.pro_monthly.priceId
}

/** Get vendor price config by tier + cycle (unified — works for any vertical) */
export function getVendorPriceConfig(tier: string, cycle?: 'monthly' | 'annual'): { priceId: string; amountCents: number } | null {
  const suffix = cycle === 'annual' ? 'annual' : 'monthly'
  const key = `${tier}_${suffix}` as keyof typeof SUBSCRIPTION_PRICES.vendor
  return SUBSCRIPTION_PRICES.vendor[key] || null
}

/** @deprecated Use getVendorPriceConfig */
export function getFtPriceConfig(tier: string, cycle?: 'monthly' | 'annual'): { priceId: string; amountCents: number } | null {
  return getVendorPriceConfig(tier, cycle)
}

/** @deprecated Use getVendorPriceConfig */
export function getFmPriceConfig(tier: string, cycle?: 'monthly' | 'annual'): { priceId: string; amountCents: number } | null {
  // Map legacy names to unified
  if (tier === 'premium') return getVendorPriceConfig('pro', cycle)
  if (tier === 'featured') return getVendorPriceConfig('boss', cycle)
  if (tier === 'standard') return null // standard is now free
  return getVendorPriceConfig(tier, cycle)
}
