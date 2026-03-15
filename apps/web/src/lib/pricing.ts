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
} as const

// Subscription pricing amounts (cents) — single source of truth
// stripe/config.ts SUBSCRIPTION_PRICES should match these values
export const SUBSCRIPTION_AMOUNTS = {
  fm_premium_monthly_cents: 2500,     // FM Premium: $25/month
  fm_premium_annual_cents: 20815,     // FM Premium: $208.15/year
  fm_standard_monthly_cents: 1000,    // FM Standard: $10/month
  fm_standard_annual_cents: 8150,    // FM Standard: $81.50/year (saves ~32%)
  fm_featured_monthly_cents: 5000,   // FM Featured: $50/month
  fm_featured_annual_cents: 48150,   // FM Featured: $481.50/year (saves ~20%)
  ft_basic_monthly_cents: 1000,       // FT Basic: $10/month
  ft_basic_annual_cents: 8150,        // FT Basic: $81.50/year (saves ~32%)
  ft_pro_monthly_cents: 2500,         // FT Pro: $25/month
  ft_pro_annual_cents: 20815,         // FT Pro: $208.15/year (saves ~30%)
  ft_boss_monthly_cents: 5000,        // FT Boss: $50/month
  ft_boss_annual_cents: 48150,        // FT Boss: $481.50/year (saves ~20%)
  buyer_monthly_cents: 999,           // Buyer Premium: $9.99/month
  buyer_annual_cents: 8150,           // Buyer Premium: $81.50/year
} as const

// Small order fee defaults per vertical (applied when displayed subtotal < threshold)
// These match the values stored in verticals.config JSONB
export const SMALL_ORDER_FEE_DEFAULTS: Record<string, { thresholdCents: number; feeCents: number }> = {
  farmers_market: { thresholdCents: 1000, feeCents: 100 },  // $10.00 threshold, $1.00 fee
  food_trucks: { thresholdCents: 500, feeCents: 50 },       // $5.00 threshold, $0.50 fee
  fire_works: { thresholdCents: 4000, feeCents: 400 },      // $40.00 threshold, $4.00 fee
}

export const DEFAULT_SMALL_ORDER_FEE = { thresholdCents: 1000, feeCents: 100 }

/**
 * Get small order fee config for a vertical
 * Returns { thresholdCents, feeCents } — the threshold below which the fee applies
 */
export function getSmallOrderFeeConfig(vertical?: string): { thresholdCents: number; feeCents: number } {
  if (vertical && vertical in SMALL_ORDER_FEE_DEFAULTS) {
    return SMALL_ORDER_FEE_DEFAULTS[vertical]
  }
  return DEFAULT_SMALL_ORDER_FEE
}

/**
 * Calculate the small order fee for a given subtotal
 * Returns fee in cents (50) if below threshold, else 0
 *
 * Threshold is compared against the displayed subtotal (base + buyer fee markup)
 * because the buyer sees the marked-up price, not the base price.
 *
 * @param subtotalCents - Order subtotal before fees (base price)
 * @param vertical - Optional vertical slug for per-vertical config
 * @returns Fee amount in cents (0 or feeCents)
 */
export function calculateSmallOrderFee(subtotalCents: number, vertical?: string): number {
  const config = getSmallOrderFeeConfig(vertical)
  const displaySubtotalCents = Math.round(subtotalCents * (1 + FEES.buyerFeePercent / 100))
  return displaySubtotalCents < config.thresholdCents ? config.feeCents : 0
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
 * Prorate a flat fee across N items with zero-sum guarantee.
 * Items 1..N-1 get floor(fee/N), the last item gets the remainder.
 * This ensures the total always equals the original fee exactly.
 *
 * Example: 15 cents / 2 items → [7, 8] (not [8, 8] = 16)
 *
 * @param feeCents - Total fee to prorate (e.g., 15)
 * @param totalItems - Number of items to spread across
 * @param itemIndex - 0-based index of the current item
 * @returns Prorated fee for this item in cents
 */
export function proratedFlatFee(feeCents: number, totalItems: number, itemIndex: number): number {
  if (totalItems <= 0) return 0
  if (totalItems === 1) return feeCents
  const perItem = Math.floor(feeCents / totalItems)
  // Last item gets the remainder to ensure exact total
  if (itemIndex === totalItems - 1) {
    return feeCents - perItem * (totalItems - 1)
  }
  return perItem
}

/**
 * Get the prorated flat fee for a single item (legacy convenience).
 * When you don't track per-item index, returns floor for consistency
 * and the caller should handle the remainder separately.
 *
 * @deprecated Prefer proratedFlatFee() with itemIndex for exact totals
 */
export function proratedFlatFeeSimple(feeCents: number, totalItems: number): number {
  if (totalItems <= 0) return 0
  return Math.floor(feeCents / totalItems)
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
 * Get the displayed amount (in cents) a buyer needs to add to avoid the small order fee.
 * Uses the displayed subtotal (base + 6.5%) to match what the buyer sees.
 *
 * @param subtotalCents - Current base subtotal (before fees)
 * @param vertical - Optional vertical slug for per-vertical threshold
 * @returns Displayed cents needed to reach threshold, or 0 if already above
 */
export function amountToAvoidSmallOrderFee(subtotalCents: number, vertical?: string): number {
  const config = getSmallOrderFeeConfig(vertical)
  const displaySubtotalCents = Math.round(subtotalCents * (1 + FEES.buyerFeePercent / 100))
  return Math.max(0, config.thresholdCents - displaySubtotalCents)
}
