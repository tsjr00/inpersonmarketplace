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
 * @returns Whether order meets minimum
 */
export function meetsMinimumOrder(subtotalCents: number): boolean {
  return subtotalCents >= FEES.minimumOrderCents
}

/**
 * Get amount needed to reach minimum order
 *
 * @param subtotalCents - Current subtotal
 * @returns Cents needed, or 0 if minimum met
 */
export function amountToMinimum(subtotalCents: number): number {
  return Math.max(0, FEES.minimumOrderCents - subtotalCents)
}
