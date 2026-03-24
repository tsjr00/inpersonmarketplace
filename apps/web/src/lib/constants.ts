/**
 * Platform Constants
 * Central location for platform-wide configuration values
 *
 * NOTE: Pricing functions have moved to src/lib/pricing.ts
 * Imports below are for backwards compatibility - use pricing.ts directly for new code
 */

// Feature flag: external payments (Venmo, CashApp, PayPal, Cash)
// Set to false to hide all external payment UI while preserving backend code.
// Tax implications of facilitating external transactions need resolution before re-enabling.
export const EXTERNAL_PAYMENTS_ENABLED = false

// Re-export pricing functions for backwards compatibility
export {
  formatPrice,
  formatDisplayPrice,
  calculateItemDisplayPrice as calculateDisplayPrice,  // For individual items (no flat fee)
  calculateBuyerPrice,  // For order totals (includes flat fee)
  FEES,
} from './pricing'

// Re-export specific fee constants for backwards compatibility
import { FEES } from './pricing'
import { getTierLimits } from './vendor-limits'
export const PLATFORM_FEE_RATE = FEES.buyerFeePercent / 100  // 0.065
export const PLATFORM_FLAT_FEE_CENTS = FEES.buyerFlatFeeCents  // 15

// Inventory thresholds
export const LOW_STOCK_THRESHOLD = 5

// Default cutoff hours by market type/vertical
// Used when market.cutoff_hours is NULL (fallback)
export const DEFAULT_CUTOFF_HOURS = {
  traditional: 18,       // FM: 18 hours before market opens
  private_pickup: 10,    // Private pickup: 10 hours before window
  food_trucks: 0,        // FT: no cutoff (prepare on the spot)
  event: 24,             // Events: 24 hours before event starts (advance ordering)
} as const

// Quantity/measurement units for listings and market box offerings
export const QUANTITY_UNITS: { value: string; label: string; verticals: string[] }[] = [
  { value: 'lb', label: 'lb', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'oz', label: 'oz', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'count', label: 'count', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'dozen', label: 'dozen', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'pack', label: 'pack', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'pint', label: 'pint', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'quart', label: 'quart', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'gallon', label: 'gallon', verticals: ['farmers_market'] },
  { value: 'loaf', label: 'loaf', verticals: ['farmers_market'] },
  { value: 'bag', label: 'bag', verticals: ['farmers_market'] },
  { value: 'bunch', label: 'bunch', verticals: ['farmers_market'] },
  { value: 'bouquet', label: 'bouquet', verticals: ['farmers_market'] },
  { value: 'box', label: 'box', verticals: ['farmers_market', 'food_trucks'] },
  { value: 'serving', label: 'serving', verticals: ['food_trucks'] },
  { value: 'feeds', label: 'feeds', verticals: ['food_trucks'] },
  { value: 'other', label: 'other', verticals: ['farmers_market', 'food_trucks'] },
]

// Approved product categories for farmers market
export const CATEGORIES = [
  'Produce',
  'Meat & Poultry',
  'Dairy & Eggs',
  'Baked Goods',
  'Pantry',
  'Prepared Foods',
  'Plants & Flowers',
  'Health & Wellness',
  'Art & Decor',
  'Home & Functional'
] as const

export type Category = typeof CATEGORIES[number]

// Approved cuisine categories for food trucks
export const FOOD_TRUCK_CATEGORIES = [
  'American',
  'Mexican / Latin',
  'BBQ & Smoked',
  'Asian',
  'Italian',
  'Mediterranean',
  'Seafood',
  'Desserts & Sweets',
  'Beverages',
  'Fusion',
  'Other'
] as const

export type FoodTruckCategory = typeof FOOD_TRUCK_CATEGORIES[number]

/**
 * Format quantity/measurement for display
 * Examples: "1 lb", "3-pack", "feeds 4", "12 count"
 */
export function formatQuantityDisplay(amount: number | null, unit: string | null): string | null {
  if (amount == null || !unit) return null
  // "feeds" reads more naturally as "feeds 4" than "4 feeds"
  if (unit === 'feeds') return `feeds ${amount}`
  // Format number: drop trailing .0 for whole numbers
  const formatted = Number.isInteger(amount) ? amount.toString() : amount.toFixed(1)
  return `${formatted} ${unit}`
}

// Premium tier badge configuration
// Uses statusColors from design-tokens for standard palette colors
// FT tiers (pro/boss) use brand-specific colors from the FT brand kit
import { statusColors } from './design-tokens'

// Unified tier badges — Free / Pro / Boss (both verticals)
const FREE_BADGE = {
  label: 'Free',
  icon: '',
  color: statusColors.neutral500,
  bgColor: statusColors.neutral100,
  borderColor: statusColors.neutral300
} as const

export const TIER_BADGES: Record<string, { label: string; icon: string; color: string; bgColor: string; borderColor: string }> = {
  free: FREE_BADGE,
  pro: {
    label: 'Pro',
    icon: '🔥',
    color: '#ff3131',
    bgColor: '#fff5f5',
    borderColor: '#ff8f8f'
  },
  boss: {
    label: 'Boss',
    icon: '👑',
    color: '#545454',
    bgColor: '#ffe38f',
    borderColor: '#ffd54f'
  },
  // Legacy aliases → free
  basic: FREE_BADGE,
  standard: FREE_BADGE,
  premium: FREE_BADGE,
  featured: FREE_BADGE,
}

export type VendorTierType = 'free' | 'pro' | 'boss'

// Vendor tier type — re-export from vendor-limits.ts (source of truth)
export type { VendorTier } from './vendor-limits'

/**
 * Get listing limit for a vendor tier (per-account total)
 * Delegates to getTierLimits() for all verticals
 */
export function getListingLimit(tier: string, vertical?: string): number {
  return getTierLimits(tier, vertical).productListings
}

/**
 * Get market limit for a vendor tier
 * Delegates to getTierLimits() for all verticals
 */
export function getMarketLimit(tier: string, vertical?: string): number {
  return getTierLimits(tier, vertical).traditionalMarkets
}
