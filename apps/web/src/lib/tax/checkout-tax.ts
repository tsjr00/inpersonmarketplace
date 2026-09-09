/**
 * Checkout tax engine — the ONE caller of the computeCartTax seam for the
 * checkout flow (Batch 2, plan III.6 / tax_batch2_plan.md).
 *
 * Consumed by BOTH /api/checkout/session (authoritative) and
 * /api/checkout/discount-preview (the page's mirror) — the same shared-engine
 * pattern as computeCartDiscounts, so the page total and the Stripe total can
 * never disagree on the tax line.
 *
 * THE BASE POLICY LIVES HERE (owner-approved 2026-09-08, all CPA-adjustable):
 * - Q11 interim: an item's taxable base = its NET (post-discount) subtotal
 *   plus its embedded buyer % fee share. The flat Service Fee, small-order
 *   fee, tip, and Community Chip In are NOT in the base.
 * - Q8 interim (bundles): components carry their own listings.is_taxable
 *   (owner ruling: assembly changes nothing); the manager margin's buyer-paid
 *   amount is ALLOCATED pro-rata into the TAXABLE components' bases
 *   (floor+remainder, conservation-exact) — so an all-exempt bundle's margin
 *   is untaxed, and the margin's tax lives inside the per-item snapshots
 *   (List Supplement roll-up and refund reversals need no orphan storage).
 * - Q10 interim: market boxes are EXCLUDED — callers simply don't pass them
 *   (backlog: market-box is_taxable flag + vendor guidance).
 *
 * Flag behavior: TAX_STREAM1_ENABLED=false → `enabled: false` and all-zero
 * results, no DB reads. This function is the single flag gate for checkout.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { FEES } from '@/lib/pricing'
import { marginWithBuyerFeeCents } from '@/lib/bundles/core'
import {
  computeCartTax,
  type CartTaxItemInput,
  type CartTaxMarketInput,
  type CartItemTax,
  type MarketTaxRefusal,
} from './compute-cart-tax'
import { parseJurisdictions } from './jurisdictions'
import { TAX_STREAM1_ENABLED } from './flags'

export interface CheckoutTaxItem {
  /** Caller's handle — order-item index or listing id. */
  ref: string
  listingId: string
  marketId: string | null
  /** Post-discount item subtotal (what subtotal_cents will store). */
  netSubtotalCents: number
}

export interface CheckoutTaxBundle {
  marketId: string
  marginCents: number
}

export type CheckoutTaxResult =
  | { enabled: false; totalTaxCents: 0; items: [] }
  | { enabled: true; ok: true; totalTaxCents: number; items: CartItemTax[] }
  | { enabled: true; ok: false; refusals: MarketTaxRefusal[] }

/** Q11 interim base: net subtotal + its embedded buyer % fee share. */
export function taxableBaseCents(netSubtotalCents: number): number {
  return netSubtotalCents + Math.round(netSubtotalCents * (FEES.buyerFeePercent / 100))
}

/**
 * Q8 interim: split the margin's buyer-paid amount across the TAXABLE
 * components pro-rata by base, floor + remainder so the parts sum exactly
 * (M12 house pattern). Exempt components get 0; all-exempt → nothing
 * allocated (margin untaxed per the owner ruling).
 */
export function allocateMarginToTaxable(
  marginBuyerPaidCents: number,
  bases: Array<{ base: number; isTaxable: boolean }>
): number[] {
  const taxableTotal = bases.reduce((sum, b) => sum + (b.isTaxable ? b.base : 0), 0)
  const shares = bases.map(() => 0)
  if (marginBuyerPaidCents <= 0 || taxableTotal <= 0) return shares
  let allocated = 0
  let lastTaxableIdx = -1
  bases.forEach((b, i) => {
    if (!b.isTaxable || b.base <= 0) return
    shares[i] = Math.floor((marginBuyerPaidCents * b.base) / taxableTotal)
    allocated += shares[i]
    lastTaxableIdx = i
  })
  if (lastTaxableIdx >= 0) shares[lastTaxableIdx] += marginBuyerPaidCents - allocated
  return shares
}

export async function computeCheckoutTax(
  serviceClient: SupabaseClient,
  items: CheckoutTaxItem[],
  bundle: CheckoutTaxBundle | null = null,
  now: Date = new Date()
): Promise<CheckoutTaxResult> {
  if (!TAX_STREAM1_ENABLED) return { enabled: false, totalTaxCents: 0, items: [] }
  if (items.length === 0) return { enabled: true, ok: true, totalTaxCents: 0, items: [] }

  const listingIds = [...new Set(items.map((i) => i.listingId))]
  const { data: listingRows, error: listingErr } = await serviceClient
    .from('listings')
    .select('id, is_taxable')
    .in('id', listingIds)
  if (listingErr) throw listingErr
  const taxableByListing = new Map(
    (listingRows ?? []).map((l) => [l.id as string, !!l.is_taxable])
  )

  const marketIds = [...new Set(items.map((i) => i.marketId).filter((m): m is string => !!m))]
  const { data: marketRows, error: marketErr } = marketIds.length
    ? await serviceClient
        .from('markets')
        .select('id, state, tax_jurisdictions, tax_rate_version, tax_jurisdiction_verified_at')
        .in('id', marketIds)
    : { data: [], error: null }
  if (marketErr) throw marketErr
  const markets: CartTaxMarketInput[] = (marketRows ?? []).map((m) => ({
    marketId: m.id as string,
    state: (m.state as string | null) ?? null,
    jurisdictions: parseJurisdictions(m.tax_jurisdictions),
    verifiedAt: (m.tax_jurisdiction_verified_at as string | null) ?? null,
    rateVersion: (m.tax_rate_version as string | null) ?? null,
  }))

  const bases = items.map((item) => ({
    base: taxableBaseCents(item.netSubtotalCents),
    // An unknown listing row reads as NOT taxable — is_taxable defaults false
    // and the session route has already validated listing existence upstream.
    isTaxable: taxableByListing.get(item.listingId) ?? false,
  }))
  const marginShares = bundle
    ? allocateMarginToTaxable(marginWithBuyerFeeCents(bundle.marginCents), bases)
    : items.map(() => 0)

  const seamItems: CartTaxItemInput[] = items.map((item, i) => ({
    ref: item.ref,
    // A taxable item with NO market refuses loudly downstream ('' is never a
    // real market id) — never silently untaxed.
    marketId: item.marketId ?? '',
    taxableBaseCents: bases[i].base + marginShares[i],
    isTaxable: bases[i].isTaxable,
  }))

  const result = computeCartTax(seamItems, markets, now)
  if (!result.ok) return { enabled: true, ok: false, refusals: result.refusals }
  return { enabled: true, ok: true, totalTaxCents: result.totalTaxCents, items: result.items }
}
