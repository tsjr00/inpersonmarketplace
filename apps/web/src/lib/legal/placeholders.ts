import type { VerticalPlaceholders } from './types'
import { getSmallOrderFeeConfig } from '@/lib/pricing'
import { formatCentsUSD, vendorTiersSentence } from '@/lib/pricing-display'

/**
 * Money figures here are DERIVED, never typed as prose — this text is
 * interpolated into the vendor service agreement that vendors legally accept.
 *
 * Until 2026-07-18 VENDOR_TIERS was hand-written and had gone stale in both
 * verticals: FM quoted "Premium ($24.99/month)" (actual: $25.00) and FT quoted
 * "Basic ($10/month), Pro ($30/month)" (actual: Basic is free, Pro is $25).
 * Tiers are now unified across verticals, so both read from the same source.
 */
const fmSmallOrder = getSmallOrderFeeConfig('farmers_market')
const ftSmallOrder = getSmallOrderFeeConfig('food_trucks')

export const verticalPlaceholders: Record<string, VerticalPlaceholders> = {
  farmers_market: {
    PLATFORM_NAME: 'Farmers Marketing',
    PLATFORM_DOMAIN: 'farmersmarketing.app',
    VERTICAL_MARKET_TERM: 'market',
    VERTICAL_BOX_TERM: 'Market Box',
    VERTICAL_BOX_TYPES: 'curated selections of local products',
    GRACE_PERIOD: 'one (1) hour',
    SMALL_ORDER_THRESHOLD: formatCentsUSD(fmSmallOrder.thresholdCents),
    SMALL_ORDER_FEE: formatCentsUSD(fmSmallOrder.feeCents),
    VENDOR_TIERS: vendorTiersSentence(),
    TRIAL_TERMS: null,
  },
  food_trucks: {
    PLATFORM_NAME: "Food Truck'n",
    PLATFORM_DOMAIN: 'foodtruckn.app',
    VERTICAL_MARKET_TERM: 'park/location',
    VERTICAL_BOX_TERM: 'Chef Box',
    VERTICAL_BOX_TYPES: 'Weekly Dinner, Family Kit, Mystery Box, Meal Prep, Office Lunch',
    GRACE_PERIOD: 'fifteen (15) minutes',
    SMALL_ORDER_THRESHOLD: formatCentsUSD(ftSmallOrder.thresholdCents),
    SMALL_ORDER_FEE: formatCentsUSD(ftSmallOrder.feeCents),
    VENDOR_TIERS: vendorTiersSentence(),
    // The 90-day complimentary trial was retired (owner decision 2026-07-18)
    // and TRIAL_SYSTEM_ENABLED is false, so approval grants no trial. The
    // clause is removed rather than left promising a benefit that is never
    // delivered. null = the agreement renders without a trial section, which
    // is how farmers_market has always read.
    TRIAL_TERMS: null,
  },
}
