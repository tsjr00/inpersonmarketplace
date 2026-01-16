/**
 * Platform Constants
 * Central location for platform-wide configuration values
 */

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

// Platform fee as decimal (6.5% = 0.065)
export const PLATFORM_FEE_RATE = 0.065

/**
 * Calculate display price (what buyer sees)
 * Applies platform fee to base price
 */
export function calculateDisplayPrice(basePriceCents: number): number {
  return Math.round(basePriceCents * (1 + PLATFORM_FEE_RATE))
}

/**
 * Calculate base price from display price (reverse calculation)
 * Useful for understanding vendor's share
 */
export function calculateBasePrice(displayPriceCents: number): number {
  return Math.round(displayPriceCents / (1 + PLATFORM_FEE_RATE))
}

/**
 * Format cents to dollars string
 */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Format with fee applied
 * Use for buyer-facing displays
 */
export function formatDisplayPrice(basePriceCents: number): string {
  return formatPrice(calculateDisplayPrice(basePriceCents))
}

// Vendor tier limits
export const VENDOR_LIMITS = {
  standard: {
    listingsPerMarket: 5,
    traditionalMarkets: 1,
  },
  premium: {
    listingsPerMarket: 10,
    traditionalMarkets: 3,
  },
} as const

export type VendorTier = keyof typeof VENDOR_LIMITS

/**
 * Get listing limit for a vendor tier
 */
export function getListingLimit(tier: string): number {
  return VENDOR_LIMITS[tier as VendorTier]?.listingsPerMarket || 5
}

/**
 * Get market limit for a vendor tier
 */
export function getMarketLimit(tier: string): number {
  return VENDOR_LIMITS[tier as VendorTier]?.traditionalMarkets || 1
}
