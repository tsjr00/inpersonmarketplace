/**
 * Admin-report money decomposition (ADM-2). Pure; no I/O.
 *
 * WHY: `order_items.platform_fee_cents` stores the COMBINED buyer+vendor
 * percentage fee (~13%, checkout/session:569) and excludes the flat fees,
 * small-order fee, and tip (those are order-level on `orders`). Reports that
 * treated it as the buyer-side 6.5% produced figures that don't tie to Stripe.
 *
 * The reliable source of truth is what actually moved:
 *   - `orders.total_cents` — the single Stripe charge for the whole cart
 *     (one PaymentIntent per order, regardless of how many vendors).
 *   - per-item `vendor_payout_cents` — what each vendor is transferred (tip NOT
 *     included; the tip is transferred separately).
 *   - the vendors' tip share = tip_amount − tip_on_platform_fee_cents (order-level).
 *
 * So, for ONE order (any number of vendors/items):
 *   grossPlatform = total_cents − Σ vendor_payout_cents − vendorTipShare
 *   netPlatform   = grossPlatform − estimatedStripeCost − Σ refunds
 *
 * MULTI-VENDOR / MULTI-ITEM: total_cents + tip are ORDER-level and must be
 * counted ONCE per order; vendor payouts + refunds sum ACROSS the order's items.
 * Callers group order_items by order_id and call this once per order — never
 * per item (that would multi-count the buyer charge + tip by the item count).
 */

// Estimated Stripe processing cost the PLATFORM absorbs on a card charge:
// Stripe standard 2.9% + $0.30 per successful charge (per PaymentIntent = per
// ORDER, not per item). External-payment orders incur no Stripe cost. This is
// a reporting ESTIMATE — real Stripe fees vary by card brand/method/country.
export const STRIPE_ESTIMATE_PCT = 0.029
export const STRIPE_ESTIMATE_FLAT_CENTS = 30

export function estimateStripeCostCents(totalCents: number, isStripe: boolean): number {
  if (!isStripe || totalCents <= 0) return 0
  return Math.round(totalCents * STRIPE_ESTIMATE_PCT) + STRIPE_ESTIMATE_FLAT_CENTS
}

export interface OrderMoneyItem {
  vendorPayoutCents: number
  refundAmountCents: number
  /** true when the item (or its order) is cancelled — its payout is excluded. */
  cancelled: boolean
}

export interface OrderMoneyInput {
  totalCents: number
  tipAmount: number
  tipOnPlatformFeeCents: number
  isStripe: boolean
  items: OrderMoneyItem[]
  /**
   * ACTUAL Stripe fee for this order's charge, in cents (from the charge's
   * balance_transaction, stored on payments.stripe_fee_cents). When provided
   * (a number ≥ 0), it OVERRIDES the 2.9%+$0.30 estimate. Leave undefined/null
   * to fall back to the estimate (external payments, or not-yet-captured rows).
   */
  actualStripeFeeCents?: number | null
}

export interface OrderMoneyResult {
  /** Σ vendor_payout_cents over NON-cancelled items (what vendors are paid). */
  vendorPayoutCents: number
  /** Order-level tip paid to vendors (not the platform's cut). */
  vendorTipShareCents: number
  /** Σ actual per-item refund_amount_cents (never estimated). */
  refundCents: number
  /** Platform take before Stripe cost and before refunds — the CHECKPOINT figure. */
  grossPlatformCents: number
  /** Stripe processing cost the platform absorbs on this charge (actual or estimated — see stripeCostIsActual). */
  stripeCostCents: number
  /** true = stripeCostCents is the real fee from Stripe; false = the 2.9%+$0.30 estimate. */
  stripeCostIsActual: boolean
  /** What the platform actually keeps: gross − Stripe − refunds. The headline. */
  netPlatformCents: number
}

export function computeOrderPlatformRevenue(o: OrderMoneyInput): OrderMoneyResult {
  const vendorPayoutCents = o.items.reduce(
    (sum, it) => sum + (it.cancelled ? 0 : (it.vendorPayoutCents || 0)), 0)
  const refundCents = o.items.reduce((sum, it) => sum + (it.refundAmountCents || 0), 0)
  const vendorTipShareCents = Math.max(0, (o.tipAmount || 0) - (o.tipOnPlatformFeeCents || 0))
  const grossPlatformCents = o.totalCents - vendorPayoutCents - vendorTipShareCents
  // Prefer the ACTUAL captured Stripe fee; fall back to the estimate when absent.
  const hasActual = typeof o.actualStripeFeeCents === 'number' && o.actualStripeFeeCents >= 0
  const stripeCostCents = hasActual
    ? (o.actualStripeFeeCents as number)
    : estimateStripeCostCents(o.totalCents, o.isStripe)
  const netPlatformCents = grossPlatformCents - stripeCostCents - refundCents
  return {
    vendorPayoutCents,
    vendorTipShareCents,
    refundCents,
    grossPlatformCents,
    stripeCostCents,
    stripeCostIsActual: hasActual,
    netPlatformCents,
  }
}
