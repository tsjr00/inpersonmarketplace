/**
 * Refund-side tax math — PURE (Batch 3 step 5, plan `tax_build_review_research.md`).
 *
 * The rule this file exists for (sales_tax_readiness.md §3, statutory
 * retention §151.0242): **a refund reverses tax at the ORIGINAL rate, from the
 * snapshot frozen on the order item at sale time — never from today's market
 * rates.** Quarterly rate changes, address moves and re-verification after the
 * sale must not change what a buyer gets back or what we report as reversed.
 *
 * Deliberately policy-neutral. WHICH fraction of an item's base is refunded
 * (full item · the 75% after a cancellation fee · a per-day share) is the
 * caller's decision — this file only turns "this much of the base came back"
 * into "this much tax comes back, per jurisdiction". Owner question Q1
 * (partial refunds) is therefore expressed at the call site, not here.
 *
 * Conservation: Σ jurisdiction cents == tax_cents, always (floor + remainder
 * onto the last jurisdiction, the M12 house pattern). A full reversal is the
 * snapshot exactly — no arithmetic, so a full refund can never drift by a cent.
 * Repeated reversals of the same item are CAPPED at what remains, so two
 * paths racing (buyer cancel + dashboard refund) can over-refund money in
 * Stripe but can never over-reverse tax in the ledger.
 *
 * NOT WIRED to any route yet — ships inert (step 5 precedes the call-site
 * wiring in the plan so the math is spec'd before any money path changes).
 */
import type { TaxJurisdictionSnapshot } from './jurisdictions'

/** The per-item snapshot as stored on `order_items` (mig 214 columns). */
export interface ItemTaxSnapshot {
  taxable_amount_cents: number | null
  tax_amount_cents: number | null
  tax_jurisdictions: TaxJurisdictionSnapshot[] | null
  tax_rate_version: string | null
}

/**
 * How much of the item's taxable base is coming back.
 * - `full`: the whole item — the reversal IS the snapshot.
 * - `refundedBaseCents`: the base amount refunded (the caller's policy).
 */
export type RefundPortion = { kind: 'full' } | { kind: 'partial'; refundedBaseCents: number }

export interface TaxReversal {
  /** Base amount whose tax is being reversed. */
  taxableAmountCents: number
  /** Total tax reversed — always == Σ jurisdictions[].tax_cents. */
  taxCents: number
  /** Per-jurisdiction reversal, same shape as the snapshot (List Supplement subtracts by code). */
  jurisdictions: TaxJurisdictionSnapshot[]
  /** Frozen with the reversal so the return can be reproduced years later. */
  rateVersion: string | null
}

const EMPTY: TaxReversal = { taxableAmountCents: 0, taxCents: 0, jurisdictions: [], rateVersion: null }

/**
 * Tax to reverse for one order item, from its own snapshot.
 *
 * @param snapshot   the item's stored tax columns
 * @param portion    full item, or the refunded base in cents (caller's policy)
 * @param alreadyReversedCents  tax already reversed for this item by earlier
 *        refunds (from the ledger); the result is capped so the item's total
 *        reversals never exceed its snapshot tax
 */
export function taxReversalForItem(
  snapshot: ItemTaxSnapshot,
  portion: RefundPortion,
  alreadyReversedCents = 0
): TaxReversal {
  const snapTax = snapshot.tax_amount_cents ?? 0
  const snapBase = snapshot.taxable_amount_cents ?? 0
  const lines = snapshot.tax_jurisdictions ?? []
  // An exempt item (real zero) or a pre-tax order (NULL) reverses nothing.
  if (snapTax <= 0 || snapBase <= 0 || lines.length === 0) return { ...EMPTY, rateVersion: snapshot.tax_rate_version }

  const remaining = Math.max(0, snapTax - Math.max(0, alreadyReversedCents))
  if (remaining === 0) return { ...EMPTY, rateVersion: snapshot.tax_rate_version }

  if (portion.kind === 'full' && alreadyReversedCents <= 0) {
    // The snapshot IS the reversal — copied, never recomputed.
    return {
      taxableAmountCents: snapBase,
      taxCents: snapTax,
      jurisdictions: lines.map((j) => ({ ...j })),
      rateVersion: snapshot.tax_rate_version,
    }
  }

  // Partial (or a full reversal after an earlier partial): prorate each
  // jurisdiction's ORIGINAL cents by the refunded share of the ORIGINAL base.
  // Rates are never re-applied — the snapshot cents are the source of truth.
  const refundedBase = portion.kind === 'full'
    ? snapBase
    : Math.min(Math.max(0, Math.floor(portion.refundedBaseCents)), snapBase)
  if (refundedBase === 0) return { ...EMPTY, rateVersion: snapshot.tax_rate_version }

  const target = Math.min(remaining, Math.round((snapTax * refundedBase) / snapBase))
  if (target === 0) return { ...EMPTY, rateVersion: snapshot.tax_rate_version }

  let allocated = 0
  const out: TaxJurisdictionSnapshot[] = lines.map((j) => {
    const share = Math.floor((target * (j.tax_cents || 0)) / snapTax)
    allocated += share
    return { ...j, tax_cents: share }
  })
  // Remainder onto the last jurisdiction so the parts sum to the target exactly.
  out[out.length - 1] = { ...out[out.length - 1], tax_cents: out[out.length - 1].tax_cents + (target - allocated) }

  return {
    taxableAmountCents: refundedBase,
    taxCents: target,
    jurisdictions: out,
    rateVersion: snapshot.tax_rate_version,
  }
}

/**
 * What the buyer gets back for an item: the money paths' existing
 * `buyerPaidForItem` (net + buyer % fee + prorated flat fee, possibly reduced
 * by a cancellation fee) PLUS the tax reversed. Kept as a function so every
 * call site adds tax the same way and the flow-integrity pin can find it.
 */
export function refundAmountWithTax(buyerRefundCents: number, reversal: TaxReversal): number {
  return buyerRefundCents + reversal.taxCents
}
