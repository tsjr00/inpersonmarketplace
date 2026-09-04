/**
 * Cart discount computation — the ONE function that decides what a VIP's
 * perks are worth on a given cart (Phase B, vip_loyalty_buildout_plan.md).
 *
 * Consumed by BOTH `api/checkout/session` (the money truth) and
 * `api/checkout/discount-preview` (the checkout page's display mirror) — one
 * source, so the page total and the Stripe total can never disagree (the
 * display-price-integrity pair).
 *
 * Rules (owner 2026-09-04): VIP-only · vendor-funded only · NO STACKING —
 * per vendor, the single best-for-buyer perk applies (D6/D7). Perks:
 *   spend_threshold — pct off the vendor slice when it clears the threshold
 *   punch_card      — reward on the order AFTER the buyer's Nth qualifying
 *                     visit (D6 auto-apply). Punch state is DERIVED, no new
 *                     table: a redemption is any order carrying this offer's
 *                     id (order_items.offer_id, mig 243); punches = fulfilled
 *                     qualifying orders since max(VIP added_at, last
 *                     redemption) — D5, counting starts at designation.
 *   Qualifying visit = the vendor slice's DISPLAYED subtotal (×1.065, the
 *   platform's small-order convention) meets the vertical's small-order
 *   threshold — owner: "no small orders" (interpretation flagged in
 *   decisions.md #7).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { FEES, getSmallOrderFeeConfig } from '@/lib/pricing'
import {
  allocateDiscount,
  computePunchRewardDiscount,
  computeSpendThresholdDiscount,
  parsePunchCard,
  type VendorOffer,
} from './offers'

export interface CartDiscountItem {
  /** Caller's index into its own items array. */
  index: number
  listingId: string
  vendorProfileId: string
  /** List-price subtotal (unit_price × quantity) for this item. */
  subtotalCents: number
}

export interface CartDiscounts {
  /** Per caller-index discount + the offer that funded it. */
  byIndex: Map<number, { cents: number; offerId: string }>
  totalCents: number
}

const EMPTY: CartDiscounts = { byIndex: new Map(), totalCents: 0 }

export async function computeCartDiscounts(
  serviceClient: SupabaseClient,
  buyerUserId: string,
  cartItems: CartDiscountItem[],
  vertical: string
): Promise<CartDiscounts> {
  const vendorIds = [...new Set(cartItems.map((i) => i.vendorProfileId))]
  if (vendorIds.length === 0) return EMPTY

  const [{ data: offerRows }, { data: vipRows }] = await Promise.all([
    observed(serviceClient
      .from('vendor_offers')
      .select('id, vendor_profile_id, kind, enabled, config')
      .in('vendor_profile_id', vendorIds)
      .eq('enabled', true), { table: 'vendor_offers' }),
    observed(serviceClient
      .from('vendor_vip_customers')
      .select('vendor_profile_id, added_at')
      .eq('buyer_user_id', buyerUserId)
      .in('vendor_profile_id', vendorIds), { table: 'vendor_vip_customers' }),
  ])
  if (!offerRows || offerRows.length === 0) return EMPTY
  const vipByVendor = new Map((vipRows ?? []).map((r) => [r.vendor_profile_id as string, r.added_at as string]))

  const byIndex = new Map<number, { cents: number; offerId: string }>()
  let totalCents = 0

  for (const vendorId of vendorIds) {
    const vipAddedAt = vipByVendor.get(vendorId)
    if (!vipAddedAt) continue // VIP-only, hard gate
    const vendorOffers = (offerRows as unknown as VendorOffer[]).filter((o) => o.vendor_profile_id === vendorId)
    if (vendorOffers.length === 0) continue

    const vendorItems = cartItems.filter((i) => i.vendorProfileId === vendorId)
    const subtotals = vendorItems.map((i) => i.subtotalCents)
    const vendorTotal = subtotals.reduce((a, b) => a + b, 0)

    // Candidate 1: spend threshold.
    const thresholdOffer = vendorOffers.find((o) => o.kind === 'spend_threshold')
    const thresholdDiscount = computeSpendThresholdDiscount(thresholdOffer, true, vendorTotal)

    // Candidate 2: punch reward, if EARNED (Nth qualifying visit reached
    // since the anchor and not yet redeemed).
    let punchDiscount = 0
    const punchOffer = vendorOffers.find((o) => o.kind === 'punch_card')
    const punchCfg = punchOffer ? parsePunchCard(punchOffer.config) : null
    if (punchOffer && punchCfg) {
      const earned = await punchEarned(serviceClient, buyerUserId, vendorId, punchOffer.id, punchCfg.visits, vipAddedAt, vertical)
      if (earned) punchDiscount = computePunchRewardDiscount(punchCfg.reward, vendorTotal)
    }

    // NO STACKING (D6/D7): the single best-for-buyer perk.
    const best = punchDiscount >= thresholdDiscount
      ? { cents: punchDiscount, offerId: punchOffer?.id ?? '' }
      : { cents: thresholdDiscount, offerId: thresholdOffer?.id ?? '' }
    if (best.cents <= 0 || !best.offerId) continue

    const parts = allocateDiscount(subtotals, best.cents)
    vendorItems.forEach((item, i) => {
      if (parts[i]! > 0) {
        byIndex.set(item.index, { cents: parts[i]!, offerId: best.offerId })
        totalCents += parts[i]!
      }
    })
  }

  return { byIndex, totalCents }
}

/**
 * Has this buyer EARNED the punch reward at this vendor?
 * punches = distinct FULFILLED orders whose vendor-slice displayed subtotal
 * meets the vertical's small-order threshold, created after the anchor
 * (max of VIP added_at and the last redemption). Exported for the evaluator's
 * earned-notification check — one definition, two readers.
 */
export async function punchEarned(
  serviceClient: SupabaseClient,
  buyerUserId: string,
  vendorProfileId: string,
  punchOfferId: string,
  visitsTarget: number,
  vipAddedAt: string,
  vertical: string
): Promise<boolean> {
  const state = await punchState(serviceClient, buyerUserId, vendorProfileId, punchOfferId, vipAddedAt, vertical)
  return state.punches >= visitsTarget
}

/**
 * Current punch count + the cycle anchor (for progress display, earn checks,
 * and the earned-notification's per-cycle dedup key).
 */
export async function punchState(
  serviceClient: SupabaseClient,
  buyerUserId: string,
  vendorProfileId: string,
  punchOfferId: string,
  vipAddedAt: string,
  vertical: string
): Promise<{ punches: number; anchor: string }> {
  // Anchor: last redemption (an order carrying this offer's id), else VIP
  // designation (D5 — punches start counting from designation).
  const { data: lastRedemption } = await observed(serviceClient
    .from('order_items')
    .select('created_at, order:orders!inner(buyer_user_id)')
    .eq('offer_id', punchOfferId)
    .eq('order.buyer_user_id', buyerUserId)
    .order('created_at', { ascending: false })
    .limit(1), { table: 'order_items' })
  const redeemedAt = (lastRedemption?.[0]?.created_at as string | undefined) ?? null
  const anchor = redeemedAt && redeemedAt > vipAddedAt ? redeemedAt : vipAddedAt

  const { data: rows } = await observed(serviceClient
    .from('order_items')
    .select('order_id, subtotal_cents, order:orders!inner(buyer_user_id)')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('status', 'fulfilled')
    .eq('order.buyer_user_id', buyerUserId)
    .gt('created_at', anchor), { table: 'order_items' })

  const thresholdCents = getSmallOrderFeeConfig(vertical).thresholdCents
  const byOrder = new Map<string, number>()
  for (const r of rows ?? []) {
    byOrder.set(r.order_id as string, (byOrder.get(r.order_id as string) ?? 0) + ((r.subtotal_cents as number) || 0))
  }
  let punches = 0
  for (const sliceCents of byOrder.values()) {
    // The platform's small-order convention compares the DISPLAYED subtotal.
    if (Math.round(sliceCents * (1 + FEES.buyerFeePercent / 100)) >= thresholdCents) punches++
  }
  return { punches, anchor }
}
