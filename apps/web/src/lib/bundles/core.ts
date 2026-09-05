/**
 * Market-curated bundles — core pure module (B1+B2, mig 244).
 *
 * THE SHAPE (market_bundles_build_plan.md, locked 2026-09-05): a bundle
 * checkout expands into ORDINARY component order_items at LIVE vendor prices —
 * every existing pricing/inventory/payout path runs byte-identically to a
 * plain cart — plus ONE fixed margin addend on the order. The margin is
 * seller-fee-free (the manager receives it whole), the buyer fee applies to
 * the full bundle price including margin, and the margin transfers to
 * markets.stripe_account_id ONLY after the manager marks the order handed
 * off (no-clawback invariant).
 *
 * This module is the single source of bundle money math + limits. It does
 * NO I/O — checkout, the manager UI, the admin approval queue, and the
 * market-page card all read these functions so their numbers cannot disagree.
 */

import { FEES } from '@/lib/pricing'

// Q5 limits (owner-approved 2026-09-05) — config constants, not inline.
export const BUNDLE_LIMITS = {
  /** Max copies of one bundle that can be sold (quantity_limit ceiling). */
  maxQuantityPerBundle: 25,
  /** Max simultaneously ACTIVE bundles per market. */
  maxActivePerMarket: 3,
  /**
   * Full days the manager gets between order close and the pickup market
   * day to collect components and assemble. With 1 buffer day, the last
   * orderable day is TWO days before pickup (orders close end of
   * pickup−2, leaving all of pickup−1 for assembly).
   */
  assemblyBufferDays: 1,
} as const

export interface BundleComponent {
  listing_id: string
  quantity: number
}

/**
 * Expand a bundle purchase into plain cart-item shapes.
 *
 * CONSERVATION ANCHOR: the output carries listing ids and quantities ONLY —
 * no prices. Checkout prices every expanded item from the LIVE listings row
 * exactly as it prices a hand-built cart, so component vendors' subtotals,
 * fees, and payouts are identical to a plain order by construction.
 */
export function expandBundleComponents(
  components: BundleComponent[],
  bundleQuantity: number
): Array<{ listingId: string; quantity: number }> {
  return components.map((c) => ({
    listingId: c.listing_id,
    quantity: c.quantity * bundleQuantity,
  }))
}

/** The bundle's base price: live component sum + the manager's fixed margin. */
export function bundleBaseCents(componentSumCents: number, marginCents: number): number {
  return componentSumCents + marginCents
}

/**
 * What the buyer sees and what the Stripe line charges for ONE bundle.
 * Buyer % applies to the FULL bundle price including margin (locked
 * decision). Rounded in TWO parts — components and margin separately —
 * because for integer C, round(1.065·C) ≡ C + round(0.065·C), which is
 * exactly the fee term calculateOrderPricing computes: this makes the
 * Stripe charge, the checkout page, the market-page card, and
 * orders.total_cents all equal TO THE CENT on a bundle-only order.
 * (A single round of the sum can drift 1¢ from the stored total.)
 * The per-order flat service fee rides its own existing line, not this one.
 */
export function bundleDisplayPriceCents(componentSumCents: number, marginCents: number): number {
  return Math.round(componentSumCents * (1 + FEES.buyerFeePercent / 100)) + marginWithBuyerFeeCents(marginCents)
}

/**
 * The orders.total_cents addend for the margin: margin + its buyer fee.
 * Components enter calculateOrderPricing like any cart item; this addend
 * rides beside tip/chipin and NEVER enters the vendor-fee math.
 */
export function marginWithBuyerFeeCents(marginCents: number): number {
  return Math.round(marginCents * (1 + FEES.buyerFeePercent / 100))
}

/**
 * B2 cause split of the margin (rides the mig-213 cause rails). Exact
 * conservation: the two legs always sum to marginCents. No cause attached
 * (null/0 pct) → everything to the market.
 */
export function splitMargin(
  marginCents: number,
  causePct: number | null | undefined
): { causeCents: number; marketCents: number } {
  if (!causePct || causePct <= 0) return { causeCents: 0, marketCents: marginCents }
  const pct = Math.min(100, Math.round(causePct))
  const causeCents = Math.round(marginCents * pct / 100)
  return { causeCents, marketCents: marginCents - causeCents }
}

/**
 * Bundle ordering window (Q5 assembly buffer). `todayInMarketTz` and
 * `pickupMarketDate` are YYYY-MM-DD strings — callers derive "today" in the
 * MARKET's timezone (markets.timezone, Chicago fallback idiom) because
 * Vercel runs UTC. Last orderable day = pickup − (buffer + 1) days, so the
 * manager keeps `assemblyBufferDays` FULL days after orders close.
 * Component listings' own time-based cutoffs still apply on top at checkout.
 */
export function bundleOrderingOpen(
  todayInMarketTz: string,
  pickupMarketDate: string,
  bufferDays: number = BUNDLE_LIMITS.assemblyBufferDays
): boolean {
  const pickup = new Date(`${pickupMarketDate}T00:00:00Z`)
  const today = new Date(`${todayInMarketTz}T00:00:00Z`)
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(today.getTime())) return false
  const daysUntilPickup = Math.round((pickup.getTime() - today.getTime()) / 86_400_000)
  return daysUntilPickup >= bufferDays + 1
}

/** Deterministic Stripe idempotency key for the margin transfer — never time-based. */
export function bundleMarginIdempotencyKey(orderId: string): string {
  return `bundle-margin:${orderId}`
}
