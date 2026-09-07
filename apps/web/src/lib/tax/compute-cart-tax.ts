/**
 * THE TAX SEAM — computeCartTax (Phase 1 Batch 1, plan III.6, design doc A′).
 *
 * Facilitated-sales tax is computed BY US from each market's stored
 * jurisdictions (mig 214) — zero external calls. This function is the single
 * seam every consumer goes through (checkout line, capture snapshot, display,
 * refund reversal): if the multi-state trigger ever fires, its INTERNALS swap
 * to the Stripe Tax Calculations API (design doc Option C) and nothing else
 * in the app moves.
 *
 * Deliberate design points:
 * - `taxableBaseCents` is supplied by the CALLER per item — the base policy
 *   (does the buyer-fee share join the sales price? CPA Q11) lives at the
 *   call site, not here. This stays pure arithmetic + guardrails.
 * - Bundles: the caller passes EXPANDED COMPONENTS as items, each with its
 *   own is_taxable (owner ruling 2026-09-07: taxability follows the items;
 *   assembly changes nothing).
 * - ALL-OR-NOTHING: if any market with a taxable item fails a guardrail, the
 *   whole computation refuses with per-market reasons. A silent partial tax
 *   total is exactly the failure mode the guardrails exist to prevent.
 * - Markets with ONLY exempt items need no jurisdiction data (an exempt sale
 *   produces no List Supplement line), so exempt-only carts always compute.
 *
 * Guardrails (plan III.6 ①②③):
 * - TX-only hard assert — a non-Texas market refuses loudly; a second state
 *   is a strategy conversation, never a silent miscomputation.
 * - Readiness — jurisdictions must exist, validate, and be admin-VERIFIED
 *   (the III.7 intake: submission → admin enters codes → approval).
 * - Rate freshness — a rate_version older than the current quarter refuses
 *   (rates drift quarterly; stale must be loud, never silent). ⚠ Consequence:
 *   the quarterly refresh job (Batch 4) MUST exist before TAX_STREAM1 is
 *   enabled anywhere, or every quarter-turn halts taxable sales.
 *
 * NOT WIRED to anything in Batch 1 — ships inert.
 */
import {
  computeItemTax,
  validateJurisdictions,
  type TaxJurisdiction,
  type ItemTaxResult,
} from './jurisdictions'

export interface CartTaxMarketInput {
  marketId: string
  /** markets.state — the TX-only assert reads this. */
  state: string | null
  /** Parsed markets.tax_jurisdictions (use parseJurisdictions upstream). */
  jurisdictions: TaxJurisdiction[]
  /** markets.tax_jurisdiction_verified_at — the III.7 approval stamp. */
  verifiedAt: string | null
  /** markets.tax_rate_version, e.g. "2026-Q3". */
  rateVersion: string | null
}

export interface CartTaxItemInput {
  /** Caller's reference (cart line / order item / bundle component id). */
  ref: string
  marketId: string
  /** The amount tax applies to — base POLICY is the caller's (CPA Q11). */
  taxableBaseCents: number
  /** listings.is_taxable (bundle components carry their own). */
  isTaxable: boolean
}

export type MarketTaxRefusalReason =
  | 'not_texas'
  | 'no_jurisdictions'
  | 'invalid_jurisdictions'
  | 'unverified'
  | 'stale_rates'

export interface MarketTaxRefusal {
  marketId: string
  reason: MarketTaxRefusalReason
  detail: string
}

export interface CartItemTax extends ItemTaxResult {
  ref: string
  marketId: string
  /** Frozen onto the snapshot as tax_rate_version. */
  rateVersion: string | null
}

export type CartTaxResult =
  | { ok: true; totalTaxCents: number; items: CartItemTax[] }
  | { ok: false; refusals: MarketTaxRefusal[] }

/** "YYYY-Qn" for the quarter containing `now` — the freshness yardstick. */
export function currentQuarterLabel(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`
}

/**
 * A rate version is fresh only when it names the CURRENT quarter. Anything
 * else — prior quarter, free text, empty — is stale/unknown and refuses.
 * The quarterly refresh job's whole job is keeping this true unattended.
 */
export function isRateVersionFresh(rateVersion: string | null, now: Date = new Date()): boolean {
  if (!rateVersion) return false
  return rateVersion.trim() === currentQuarterLabel(now)
}

export function computeCartTax(
  items: CartTaxItemInput[],
  markets: CartTaxMarketInput[],
  now: Date = new Date()
): CartTaxResult {
  const marketById = new Map(markets.map((m) => [m.marketId, m]))

  // Guardrails run only for markets that actually have a TAXABLE item with a
  // positive base — exempt-only (or empty) markets need no jurisdiction data.
  const taxableMarketIds = new Set(
    items.filter((i) => i.isTaxable && i.taxableBaseCents > 0).map((i) => i.marketId)
  )

  const refusals: MarketTaxRefusal[] = []
  for (const marketId of taxableMarketIds) {
    const market = marketById.get(marketId)
    if (!market) {
      refusals.push({ marketId, reason: 'no_jurisdictions', detail: 'Market data not supplied to the tax seam' })
      continue
    }
    if ((market.state || '').trim().toUpperCase() !== 'TX') {
      refusals.push({
        marketId,
        reason: 'not_texas',
        detail: `Tax is TX-only by construction (plan III.6); market state is "${market.state ?? 'unknown'}". A second state swaps the seam internals — it is never computed here.`,
      })
      continue
    }
    if (market.jurisdictions.length === 0) {
      refusals.push({ marketId, reason: 'no_jurisdictions', detail: 'No jurisdiction codes entered — the III.7 intake (admin enters codes at approval) has not completed for this location' })
      continue
    }
    const errors = validateJurisdictions(market.jurisdictions)
    if (errors.length > 0) {
      refusals.push({ marketId, reason: 'invalid_jurisdictions', detail: errors.join('; ') })
      continue
    }
    if (!market.verifiedAt) {
      refusals.push({ marketId, reason: 'unverified', detail: 'Jurisdictions entered but not verified (address may have changed — mig 215 re-verify pending)' })
      continue
    }
    if (!isRateVersionFresh(market.rateVersion, now)) {
      refusals.push({
        marketId,
        reason: 'stale_rates',
        detail: `rate_version "${market.rateVersion ?? '(none)'}" is not the current quarter ${currentQuarterLabel(now)} — refresh required before taxed sales (loud-fail guardrail, plan III.6 ①)`,
      })
      continue
    }
  }
  if (refusals.length > 0) return { ok: false, refusals }

  const resultItems: CartItemTax[] = items.map((item) => {
    const market = marketById.get(item.marketId)
    const jurisdictions = item.isTaxable && market ? market.jurisdictions : []
    const computed = computeItemTax(item.taxableBaseCents, item.isTaxable, jurisdictions)
    return {
      ref: item.ref,
      marketId: item.marketId,
      rateVersion: market?.rateVersion ?? null,
      ...computed,
    }
  })

  return {
    ok: true,
    totalTaxCents: resultItems.reduce((sum, i) => sum + i.taxAmountCents, 0),
    items: resultItems,
  }
}
