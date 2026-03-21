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

// Per-vertical vendor subscription prices
// Each vertical has its own Stripe products for branding on receipts/statements
const VERTICAL_VENDOR_PRICES: Record<string, Record<string, { priceId: string; amountCents: number }>> = {
  farmers_market: {
    pro_monthly: { priceId: process.env.STRIPE_FM_PRO_MONTHLY_PRICE_ID || '', amountCents: 2500 },
    pro_annual: { priceId: process.env.STRIPE_FM_PRO_ANNUAL_PRICE_ID || '', amountCents: 20815 },
    boss_monthly: { priceId: process.env.STRIPE_FM_BOSS_MONTHLY_PRICE_ID || '', amountCents: 5000 },
    boss_annual: { priceId: process.env.STRIPE_FM_BOSS_ANNUAL_PRICE_ID || '', amountCents: 48150 },
  },
  food_trucks: {
    pro_monthly: { priceId: process.env.STRIPE_FT_PRO_MONTHLY_PRICE_ID || '', amountCents: 2500 },
    pro_annual: { priceId: process.env.STRIPE_FT_PRO_ANNUAL_PRICE_ID || '', amountCents: 20815 },
    boss_monthly: { priceId: process.env.STRIPE_FT_BOSS_MONTHLY_PRICE_ID || '', amountCents: 5000 },
    boss_annual: { priceId: process.env.STRIPE_FT_BOSS_ANNUAL_PRICE_ID || '', amountCents: 48150 },
  },
}

// Buyer subscription prices (same across all verticals)
const BUYER_PRICES = {
  monthly: { priceId: process.env.STRIPE_BUYER_MONTHLY_PRICE_ID || '', amountCents: 999 },
  annual: { priceId: process.env.STRIPE_BUYER_ANNUAL_PRICE_ID || '', amountCents: 8150 },
}

// Backward-compatible unified view (uses first available vertical's prices)
export const SUBSCRIPTION_PRICES = {
  vendor: {
    pro_monthly: {
      priceId: process.env.STRIPE_VENDOR_PRO_MONTHLY_PRICE_ID || VERTICAL_VENDOR_PRICES.food_trucks.pro_monthly.priceId || VERTICAL_VENDOR_PRICES.farmers_market.pro_monthly.priceId,
      amountCents: 2500,
    },
    pro_annual: {
      priceId: process.env.STRIPE_VENDOR_PRO_ANNUAL_PRICE_ID || VERTICAL_VENDOR_PRICES.food_trucks.pro_annual.priceId || VERTICAL_VENDOR_PRICES.farmers_market.pro_annual.priceId,
      amountCents: 20815,
    },
    boss_monthly: {
      priceId: process.env.STRIPE_VENDOR_BOSS_MONTHLY_PRICE_ID || VERTICAL_VENDOR_PRICES.food_trucks.boss_monthly.priceId || VERTICAL_VENDOR_PRICES.farmers_market.boss_monthly.priceId,
      amountCents: 5000,
    },
    boss_annual: {
      priceId: process.env.STRIPE_VENDOR_BOSS_ANNUAL_PRICE_ID || VERTICAL_VENDOR_PRICES.food_trucks.boss_annual.priceId || VERTICAL_VENDOR_PRICES.farmers_market.boss_annual.priceId,
      amountCents: 48150,
    },
  },
  buyer: BUYER_PRICES,
  // Legacy references
  fm_premium: {
    monthly: { get priceId() { return VERTICAL_VENDOR_PRICES.farmers_market.pro_monthly.priceId }, amountCents: 2500 },
    annual: { get priceId() { return VERTICAL_VENDOR_PRICES.farmers_market.pro_annual.priceId }, amountCents: 20815 },
  },
  fm_vendor: {
    standard_monthly: { priceId: '', amountCents: 0 },
    standard_annual: { priceId: '', amountCents: 0 },
    featured_monthly: { get priceId() { return VERTICAL_VENDOR_PRICES.farmers_market.boss_monthly.priceId }, amountCents: 5000 },
    featured_annual: { get priceId() { return VERTICAL_VENDOR_PRICES.farmers_market.boss_annual.priceId }, amountCents: 48150 },
  },
  food_truck_vendor: {
    basic_monthly: { priceId: '', amountCents: 0 },
    basic_annual: { priceId: '', amountCents: 0 },
    pro_monthly: { get priceId() { return VERTICAL_VENDOR_PRICES.food_trucks.pro_monthly.priceId }, amountCents: 2500 },
    pro_annual: { get priceId() { return VERTICAL_VENDOR_PRICES.food_trucks.pro_annual.priceId }, amountCents: 20815 },
    boss_monthly: { get priceId() { return VERTICAL_VENDOR_PRICES.food_trucks.boss_monthly.priceId }, amountCents: 5000 },
    boss_annual: { get priceId() { return VERTICAL_VENDOR_PRICES.food_trucks.boss_annual.priceId }, amountCents: 48150 },
  },
}

// Check if vendor subscription prices are configured (checks at least one vertical)
export function areSubscriptionPricesConfigured(): boolean {
  return !!(
    (VERTICAL_VENDOR_PRICES.food_trucks.pro_monthly.priceId || VERTICAL_VENDOR_PRICES.farmers_market.pro_monthly.priceId) &&
    BUYER_PRICES.monthly.priceId
  )
}

/** @deprecated Use areSubscriptionPricesConfigured */
export function areFtPricesConfigured(): boolean {
  return !!VERTICAL_VENDOR_PRICES.food_trucks.pro_monthly.priceId
}

export function areVerticalPricesConfigured(vertical: string): boolean {
  const prices = VERTICAL_VENDOR_PRICES[vertical]
  return !!(prices && prices.pro_monthly.priceId)
}

/** Get vendor price config by tier + cycle + vertical */
export function getVendorPriceConfig(tier: string, cycle?: 'monthly' | 'annual', vertical?: string): { priceId: string; amountCents: number } | null {
  const suffix = cycle === 'annual' ? 'annual' : 'monthly'
  const key = `${tier}_${suffix}`

  // Try vertical-specific prices first
  if (vertical && VERTICAL_VENDOR_PRICES[vertical]) {
    const config = VERTICAL_VENDOR_PRICES[vertical][key]
    if (config?.priceId) return config
  }

  // Fall back to unified prices
  const unifiedKey = key as keyof typeof SUBSCRIPTION_PRICES.vendor
  const unified = SUBSCRIPTION_PRICES.vendor[unifiedKey]
  return unified?.priceId ? unified : null
}

/** Get FT vendor price — uses food_trucks vertical prices */
export function getFtPriceConfig(tier: string, cycle?: 'monthly' | 'annual'): { priceId: string; amountCents: number } | null {
  return getVendorPriceConfig(tier, cycle, 'food_trucks')
}

/** Get FM vendor price — maps legacy tier names to unified, uses farmers_market vertical prices */
export function getFmPriceConfig(tier: string, cycle?: 'monthly' | 'annual'): { priceId: string; amountCents: number } | null {
  if (tier === 'premium') return getVendorPriceConfig('pro', cycle, 'farmers_market')
  if (tier === 'featured') return getVendorPriceConfig('boss', cycle, 'farmers_market')
  if (tier === 'standard') return null
  return getVendorPriceConfig(tier, cycle, 'farmers_market')
}

/** Get buyer price config (same across all verticals) */
export function getBuyerPriceConfig(cycle?: 'monthly' | 'annual'): { priceId: string; amountCents: number } | null {
  const config = cycle === 'annual' ? BUYER_PRICES.annual : BUYER_PRICES.monthly
  return config?.priceId ? config : null
}
