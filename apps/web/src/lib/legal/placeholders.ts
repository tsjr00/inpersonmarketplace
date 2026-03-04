import type { VerticalPlaceholders } from './types'

export const verticalPlaceholders: Record<string, VerticalPlaceholders> = {
  farmers_market: {
    PLATFORM_NAME: 'Farmers Marketing',
    PLATFORM_DOMAIN: 'farmersmarketing.app',
    VERTICAL_MARKET_TERM: 'market',
    VERTICAL_BOX_TERM: 'Market Box',
    VERTICAL_BOX_TYPES: 'curated selections of local products',
    GRACE_PERIOD: 'one (1) hour',
    SMALL_ORDER_THRESHOLD: '$10.00',
    SMALL_ORDER_FEE: '$1.00',
    VENDOR_TIERS: 'Standard (free) and Premium ($24.99/month)',
    TRIAL_TERMS: null,
  },
  food_trucks: {
    PLATFORM_NAME: "Food Truck'n",
    PLATFORM_DOMAIN: 'foodtruckn.app',
    VERTICAL_MARKET_TERM: 'park/location',
    VERTICAL_BOX_TERM: 'Chef Box',
    VERTICAL_BOX_TYPES: 'Weekly Dinner, Family Kit, Mystery Box, Meal Prep, Office Lunch',
    GRACE_PERIOD: 'fifteen (15) minutes',
    SMALL_ORDER_THRESHOLD: '$5.00',
    SMALL_ORDER_FEE: '$0.50',
    VENDOR_TIERS: 'Free, Basic ($10/month), Pro ($30/month), and Boss ($50/month)',
    TRIAL_TERMS: '90-day complimentary Basic tier upon approval',
  },
}
