/**
 * Unified Pricing Module
 *
 * SINGLE SOURCE OF TRUTH for all fee calculations.
 * Every price display and checkout calculation should use this module.
 *
 * Fee Structure:
 * - Buyer pays: base price + 6.5% + $0.15 flat fee (once per order)
 * - Vendor receives: base price - 6.5% - $0.15 flat fee (once per order)
 * - Platform keeps: 13% + $0.30 per order
 */

// Fee configuration - single place to change fees
export const FEES = {
  buyerFeePercent: 6.5,
  vendorFeePercent: 6.5,
  buyerFlatFeeCents: 15,    // $0.15 added to buyer total
  vendorFlatFeeCents: 15,   // $0.15 deducted from vendor payout
  minimumOrderCents: 1000,  // $10.00 minimum order
} as const

// Subscription pricing amounts (cents) — single source of truth
// stripe/config.ts SUBSCRIPTION_PRICES should match these values
export const SUBSCRIPTION_AMOUNTS = {
  vendor_monthly_cents: 2499,     // $24.99/month
  vendor_annual_cents: 20815,     // $208.15/year
  ft_basic_monthly_cents: 1000,   // $10/month
  ft_pro_monthly_cents: 3000,     // $30/month
  ft_boss_monthly_cents: 5000,    // $50/month
  buyer_monthly_cents: 999,       // $9.99/month
  buyer_annual_cents: 8150,       // $81.50/year
} as const

// Per-vertical minimum order defaults (cents)
// These match the values in verticals.config.minimum_order_cents
// Used as hardcoded fallbacks so client components don't need a DB call
export const VERTICAL_MINIMUM_DEFAULTS: Record<string, number> = {
  farmers_market: 1000,  // $10.00
  food_trucks: 500,      // $5.00
  fire_works: 4000,      // $40.00
}

/**
 * Get minimum order amount for a vertical (in cents)
 * Falls back to FEES.minimumOrderCents (1000) for unknown verticals
 */
export function getMinimumOrderCents(vertical?: string): number {
  if (vertical && vertical in VERTICAL_MINIMUM_DEFAULTS) {
    return VERTICAL_MINIMUM_DEFAULTS[vertical]
  }
  return FEES.minimumOrderCents
}

export interface OrderItem {
  price_cents: number
  quantity: number
}

export interface OrderPricing {
  // Base amounts
  subtotalCents: number           // Sum of (price × quantity) for all items

  // Buyer side
  buyerPercentFeeCents: number    // 6.5% of subtotal
  buyerFlatFeeCents: number       // $0.15 (once per order)
  buyerTotalCents: number         // What buyer pays

  // Vendor side
  vendorPercentFeeCents: number   // 6.5% of subtotal
  vendorFlatFeeCents: number      // $0.15 (once per order)
  vendorPayoutCents: number       // What vendor receives

  // Platform
  platformFeeCents: number        // Total platform revenue
}

/**
 * Calculate all pricing for an order
 *
 * @param items - Array of items with price_cents and quantity
 * @returns Complete pricing breakdown
 *
 * @example
 * const pricing = calculateOrderPricing([
 *   { price_cents: 1000, quantity: 2 },
 *   { price_cents: 500, quantity: 1 }
 * ])
 * // pricing.buyerTotalCents = 2500 * 1.065 + 15 = 2678
 */
export function calculateOrderPricing(items: OrderItem[]): OrderPricing {
  // Calculate subtotal
  const subtotalCents = items.reduce(
    (sum, item) => sum + item.price_cents * item.quantity,
    0
  )

  // Buyer fees
  const buyerPercentFeeCents = Math.round(subtotalCents * (FEES.buyerFeePercent / 100))
  const buyerFlatFeeCents = FEES.buyerFlatFeeCents
  const buyerTotalCents = subtotalCents + buyerPercentFeeCents + buyerFlatFeeCents

  // Vendor fees
  const vendorPercentFeeCents = Math.round(subtotalCents * (FEES.vendorFeePercent / 100))
  const vendorFlatFeeCents = FEES.vendorFlatFeeCents
  const vendorPayoutCents = subtotalCents - vendorPercentFeeCents - vendorFlatFeeCents

  // Platform revenue
  const platformFeeCents = buyerPercentFeeCents + buyerFlatFeeCents + vendorPercentFeeCents + vendorFlatFeeCents

  return {
    subtotalCents,
    buyerPercentFeeCents,
    buyerFlatFeeCents,
    buyerTotalCents,
    vendorPercentFeeCents,
    vendorFlatFeeCents,
    vendorPayoutCents,
    platformFeeCents,
  }
}

/**
 * Calculate buyer display price for ORDER TOTAL
 * Includes percentage fee + flat fee (once per order)
 * Use this for cart/checkout totals
 *
 * @param subtotalCents - Order subtotal in cents
 * @returns Total buyer pays in cents
 */
export function calculateBuyerPrice(subtotalCents: number): number {
  return Math.round(subtotalCents * (1 + FEES.buyerFeePercent / 100)) + FEES.buyerFlatFeeCents
}

/**
 * Calculate display price for a SINGLE ITEM
 * Includes percentage fee only (flat fee is added once at checkout)
 * Use this for browse pages, listing cards, cart items
 *
 * @param baseCents - Item base price in cents
 * @returns Item display price in cents (without flat fee)
 */
export function calculateItemDisplayPrice(baseCents: number): number {
  return Math.round(baseCents * (1 + FEES.buyerFeePercent / 100))
}

/**
 * Calculate vendor payout for a subtotal
 *
 * @param baseCents - Base price in cents
 * @returns What vendor receives in cents
 */
export function calculateVendorPayout(baseCents: number): number {
  return Math.round(baseCents * (1 - FEES.vendorFeePercent / 100)) - FEES.vendorFlatFeeCents
}

/**
 * Format cents as dollar string
 *
 * @param cents - Amount in cents
 * @returns Formatted string like "$12.34"
 */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Format item price with percentage fee as dollar string
 * For displaying individual item prices (flat fee added separately at checkout)
 *
 * @param basePriceCents - Base price in cents
 * @returns Formatted string like "$8.52" with percentage fee included
 */
export function formatDisplayPrice(basePriceCents: number): string {
  return formatPrice(calculateItemDisplayPrice(basePriceCents))
}

/**
 * Check if order meets minimum
 *
 * @param subtotalCents - Order subtotal before fees
 * @param minimumCents - Optional override (defaults to global FEES.minimumOrderCents)
 * @returns Whether order meets minimum
 */
export function meetsMinimumOrder(subtotalCents: number, minimumCents?: number): boolean {
  const min = minimumCents ?? FEES.minimumOrderCents
  return subtotalCents >= min
}

/**
 * Get amount needed to reach minimum order
 *
 * @param subtotalCents - Current subtotal
 * @param minimumCents - Optional override (defaults to global FEES.minimumOrderCents)
 * @returns Cents needed, or 0 if minimum met
 */
export function amountToMinimum(subtotalCents: number, minimumCents?: number): number {
  const min = minimumCents ?? FEES.minimumOrderCents
  return Math.max(0, min - subtotalCents)
}
