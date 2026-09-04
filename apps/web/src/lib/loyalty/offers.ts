/**
 * VIP perk offers — pure eligibility + discount math (Phase B1,
 * vip_loyalty_buildout_plan.md; mig 243 `vendor_offers`).
 *
 * Owner decisions 2026-09-04: perks are a platform-defined MENU the vendor
 * toggles; VENDOR-FUNDED only (platform-funded stays behind chunk D);
 * VIP-ONLY for the feedback round — a discount applies only when the buyer is
 * on that vendor's VIP list (vendor_vip_customers).
 *
 * THE INVARIANT this module serves (research doc "store subtotal NET"):
 * checkout computes `net = itemSubtotal − discount` and stores net AS
 * subtotal_cents. Fees, payouts, refunds, small-order fee, reports and
 * chunk-D tax all read net by construction — this module only ever answers
 * "how many cents come off", it never touches the money paths itself.
 *
 * v1 scope: only 'spend_threshold' produces a discount here. 'punch_card'
 * needs redemption STATE (earned & unspent punches) — that arrives with the
 * punch-card build; its kind exists in the schema so vendors' menus are
 * forward-compatible.
 *
 * Bounds (code-enforced at the vendor config route, not schema CHECKs, so
 * tuning needs no migration): Q5/Q6 owner answers land in these constants.
 */

export interface SpendThresholdConfig {
  threshold_cents: number
  pct: number
}

export interface VendorOffer {
  id: string
  vendor_profile_id: string
  kind: 'punch_card' | 'spend_threshold'
  enabled: boolean
  config: Record<string, unknown>
}

// D1 (owner-CONFIRMED 2026-09-04): 5–25% off, threshold $15–$200 — the $200
// ceiling is deliberate, "some FM vendors have higher dollar items". Two
// vendor controls (% + threshold); the system does the math on the backend.
export const SPEND_THRESHOLD_BOUNDS = {
  minPct: 5,
  maxPct: 25,
  minThresholdCents: 1500,
  maxThresholdCents: 20000,
} as const

/** Parse + bounds-check a spend_threshold config; null = invalid/ignore. */
export function parseSpendThreshold(config: Record<string, unknown>): SpendThresholdConfig | null {
  const threshold = config.threshold_cents
  const pct = config.pct
  if (typeof threshold !== 'number' || typeof pct !== 'number') return null
  if (!Number.isInteger(threshold) || !Number.isInteger(pct)) return null
  const b = SPEND_THRESHOLD_BOUNDS
  if (pct < b.minPct || pct > b.maxPct) return null
  if (threshold < b.minThresholdCents || threshold > b.maxThresholdCents) return null
  return { threshold_cents: threshold, pct }
}

/**
 * The vendor-funded discount for ONE vendor's slice of a cart.
 *
 * `vendorSubtotalCents` = Σ list-price subtotals of this vendor's items in the
 * order. The threshold compares against what the buyer is spending WITH THIS
 * VENDOR (their perk, their money); the discount is pct off that whole slice.
 * Caller allocates the result across the vendor's items proportionally
 * (floor + remainder — the flat-fee proration idiom) so per-item nets sum
 * exactly to the vendor total.
 *
 * Returns 0 unless: the offer is enabled + parses inside bounds + the buyer
 * is a VIP of this vendor + the slice clears the threshold.
 */
export function computeSpendThresholdDiscount(
  offer: VendorOffer | undefined,
  isVip: boolean,
  vendorSubtotalCents: number
): number {
  if (!offer || !offer.enabled || offer.kind !== 'spend_threshold') return 0
  if (!isVip) return 0
  const cfg = parseSpendThreshold(offer.config)
  if (!cfg) return 0
  if (vendorSubtotalCents < cfg.threshold_cents) return 0
  return Math.round(vendorSubtotalCents * cfg.pct / 100)
}

/**
 * Allocate a vendor-level discount across that vendor's items proportionally
 * to their subtotals, floor + remainder so the parts sum EXACTLY to the whole
 * (the proratedFlatFee idiom — conservation by construction).
 */
export function allocateDiscount(itemSubtotals: number[], totalDiscount: number): number[] {
  const total = itemSubtotals.reduce((a, b) => a + b, 0)
  if (total <= 0 || totalDiscount <= 0) return itemSubtotals.map(() => 0)
  const capped = Math.min(totalDiscount, total)
  const parts = itemSubtotals.map(s => Math.floor((capped * s) / total))
  let remainder = capped - parts.reduce((a, b) => a + b, 0)
  for (let i = 0; remainder > 0 && i < parts.length; i++) {
    // hand leftover cents to the largest items first (stable, deterministic)
    parts[i] += 1
    remainder -= 1
  }
  return parts
}
