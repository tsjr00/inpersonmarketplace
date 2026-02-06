/**
 * Platform Constants
 * Central location for platform-wide configuration values
 *
 * NOTE: Pricing functions have moved to src/lib/pricing.ts
 * Imports below are for backwards compatibility - use pricing.ts directly for new code
 */

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
export const PLATFORM_FEE_RATE = FEES.buyerFeePercent / 100  // 0.065
export const PLATFORM_FLAT_FEE_CENTS = FEES.buyerFlatFeeCents  // 15
export const MINIMUM_ORDER_CENTS = FEES.minimumOrderCents  // 1000

// Inventory thresholds
export const LOW_STOCK_THRESHOLD = 5

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
  'Clothing & Fashion',
  'Art & Decor',
  'Home & Functional'
] as const

export type Category = typeof CATEGORIES[number]

// Premium tier badge configuration
export const TIER_BADGES = {
  premium: {
    label: 'Premium',
    icon: '⭐',
    color: '#3b82f6',
    bgColor: '#dbeafe',
    borderColor: '#93c5fd'
  },
  featured: {
    label: 'Featured',
    icon: '✨',
    color: '#f59e0b',
    bgColor: '#fef3c7',
    borderColor: '#fcd34d'
  },
  standard: {
    label: 'Standard',
    icon: '',
    color: '#6b7280',
    bgColor: '#f3f4f6',
    borderColor: '#d1d5db'
  }
} as const

export type VendorTierType = keyof typeof TIER_BADGES

// Vendor tier limits
// Note: Listings are counted per-account total, not per-market
export const VENDOR_LIMITS = {
  standard: {
    totalListings: 5,
    traditionalMarkets: 1,
  },
  premium: {
    totalListings: 15,
    traditionalMarkets: 4,
  },
} as const

export type VendorTier = keyof typeof VENDOR_LIMITS

/**
 * Get listing limit for a vendor tier (per-account total)
 */
export function getListingLimit(tier: string): number {
  return VENDOR_LIMITS[tier as VendorTier]?.totalListings || 5
}

/**
 * Get market limit for a vendor tier
 */
export function getMarketLimit(tier: string): number {
  return VENDOR_LIMITS[tier as VendorTier]?.traditionalMarkets || 1
}
