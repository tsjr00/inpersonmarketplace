/**
 * Cancellation Fee Calculations
 *
 * Extracted from /api/buyer/orders/[id]/cancel/route.ts for testability.
 * Pure functions — no Supabase or Stripe calls.
 */

import { STRIPE_CONFIG } from '@/lib/stripe/config'
import { proratedFlatFeeSimple } from '@/lib/pricing'

// Cancellation fee: 25% of what the buyer paid, retained and split between platform + vendor
export const CANCELLATION_FEE_PERCENT = 25

// Per-vertical early cancel windows — full refund within this window, no questions asked
// FM = 1 hour, FT = 15 minutes
export const GRACE_PERIOD_BY_VERTICAL: Record<string, number> = {
  farmers_market: 60 * 60 * 1000,   // 1 hour
  food_trucks: 15 * 60 * 1000,      // 15 minutes
  fire_works: 60 * 60 * 1000,       // 1 hour (default — same as FM)
}

// Default grace period for unknown verticals
export const DEFAULT_GRACE_PERIOD_MS = 60 * 60 * 1000  // 1 hour

/** @deprecated Use GRACE_PERIOD_BY_VERTICAL — kept for backward compatibility */
export const GRACE_PERIOD_MS = DEFAULT_GRACE_PERIOD_MS

export function getGracePeriodMs(vertical?: string): number {
  if (vertical && vertical in GRACE_PERIOD_BY_VERTICAL) {
    return GRACE_PERIOD_BY_VERTICAL[vertical]
  }
  return DEFAULT_GRACE_PERIOD_MS
}

export interface CancellationInput {
  subtotalCents: number
  totalItemsInOrder: number
  orderStatus: string
  orderCreatedAt: Date
  vertical?: string // per-vertical grace period
  smallOrderFeeCents?: number // order-level small order fee, prorated across items
  now?: Date // injectable for testing
}

export interface CancellationResult {
  refundAmountCents: number
  cancellationFeeCents: number
  vendorShareCents: number
  platformShareCents: number
  feeApplied: boolean
  withinGracePeriod: boolean
  vendorHadConfirmed: boolean
}

/**
 * Calculate cancellation fee and refund amounts for a single order item.
 *
 * Layer 1: Within per-vertical early cancel window → full refund (always wins)
 *          FM = 1 hour, FT = 15 minutes
 * Layer 2: After window AND vendor has confirmed/prepared → 25% cancellation fee
 * Layer 3: After window but vendor NOT confirmed → full refund
 */
// (calculateBundleCancellation, the whole-bundle variant, is defined below.)
export function calculateCancellationFee(input: CancellationInput): CancellationResult {
  const { subtotalCents, totalItemsInOrder, orderStatus, orderCreatedAt } = input
  const now = input.now ?? new Date()

  // Calculate what buyer originally paid for this item
  // M12 FIX: Use floor-based proration to avoid off-by-one (remainder goes to last item at checkout)
  const flatFeePerItem = proratedFlatFeeSimple(STRIPE_CONFIG.buyerFlatFeeCents, totalItemsInOrder)
  const buyerFeeOnItem = Math.round(subtotalCents * (STRIPE_CONFIG.buyerFeePercent / 100)) + flatFeePerItem
  // Prorate small order fee across items so buyer gets true 75% of total paid
  const smallOrderFeePerItem = Math.round((input.smallOrderFeeCents || 0) / totalItemsInOrder)
  const buyerPaidForItem = subtotalCents + buyerFeeOnItem + smallOrderFeePerItem

  // Determine grace period (per-vertical) and vendor confirmation status
  const gracePeriodMs = getGracePeriodMs(input.vertical)
  const gracePeriodEndsAt = new Date(orderCreatedAt.getTime() + gracePeriodMs)
  const withinGracePeriod = now < gracePeriodEndsAt
  const vendorHadConfirmed = ['confirmed', 'ready', 'fulfilled'].includes(orderStatus)

  if (withinGracePeriod || !vendorHadConfirmed) {
    // Full refund: within grace period OR vendor hasn't confirmed yet
    return {
      refundAmountCents: buyerPaidForItem,
      cancellationFeeCents: 0,
      vendorShareCents: 0,
      platformShareCents: 0,
      feeApplied: false,
      withinGracePeriod,
      vendorHadConfirmed,
    }
  }

  // After grace period AND vendor has confirmed: 25% fee
  const refundAmountCents = Math.round(buyerPaidForItem * (1 - CANCELLATION_FEE_PERCENT / 100))
  const cancellationFeeCents = buyerPaidForItem - refundAmountCents
  const platformShareCents = Math.round(cancellationFeeCents * (STRIPE_CONFIG.applicationFeePercent / 100))
  const vendorShareCents = cancellationFeeCents - platformShareCents

  return {
    refundAmountCents,
    cancellationFeeCents,
    vendorShareCents,
    platformShareCents,
    feeApplied: true,
    withinGracePeriod,
    vendorHadConfirmed,
  }
}

// ── Bundle cancellation (owner rulings 2026-09-06) ──────────────────────────
//
// A bundle is ONE product: cancellation is all-or-nothing, and the fee test
// runs at BUNDLE level — once ANY vendor has confirmed (and the grace window
// has passed), the 25% fee applies to the WHOLE bundle total, margin
// included. The tip is excluded here: house rule refunds tips in full
// (VOR-16), the caller refunds it separately. The fee's vendor-compensation
// share goes only to vendors who actually confirmed (they prepped);
// unconfirmed vendors' fee portions stay with the platform. The manager
// never receives a fee share — pre-handoff they have done no assembly, so
// the margin simply refunds (75% when the fee applies, 100% otherwise).

export interface BundleCancellationItem {
  id: string
  subtotalCents: number
  status: string
}

export interface BundleCancellationInput {
  /** LIVE (non-cancelled) items only. */
  items: BundleCancellationItem[]
  /** ALL items ever on the order — the flat/small-fee proration denominator. */
  totalItemsInOrder: number
  orderCreatedAt: Date
  vertical?: string
  smallOrderFeeCents?: number
  /** What the buyer paid for the manager's margin (marginWithBuyerFeeCents). */
  marginAddendCents: number
  now?: Date
}

export interface BundleCancellationItemResult {
  id: string
  refundCents: number
  feeCents: number
  vendorShareCents: number
  platformShareCents: number
  vendorConfirmed: boolean
}

export interface BundleCancellationResult {
  feeApplied: boolean
  withinGracePeriod: boolean
  anyVendorConfirmed: boolean
  perItem: BundleCancellationItemResult[]
  marginRefundCents: number
  /** Items + margin. The tip is NOT included — callers refund it in full. */
  totalRefundCents: number
  totalFeeCents: number
}

export function calculateBundleCancellation(input: BundleCancellationInput): BundleCancellationResult {
  const now = input.now ?? new Date()
  const gracePeriodMs = getGracePeriodMs(input.vertical)
  const withinGracePeriod = now < new Date(input.orderCreatedAt.getTime() + gracePeriodMs)
  const anyVendorConfirmed = input.items.some(i => ['confirmed', 'ready'].includes(i.status))
  const feeApplied = !withinGracePeriod && anyVendorConfirmed

  const flatFeePerItem = proratedFlatFeeSimple(STRIPE_CONFIG.buyerFlatFeeCents, input.totalItemsInOrder)
  const smallOrderFeePerItem = Math.round((input.smallOrderFeeCents || 0) / input.totalItemsInOrder)

  const perItem: BundleCancellationItemResult[] = input.items.map(item => {
    const buyerPaidForItem = item.subtotalCents
      + Math.round(item.subtotalCents * (STRIPE_CONFIG.buyerFeePercent / 100))
      + flatFeePerItem
      + smallOrderFeePerItem
    if (!feeApplied) {
      return { id: item.id, refundCents: buyerPaidForItem, feeCents: 0, vendorShareCents: 0, platformShareCents: 0, vendorConfirmed: ['confirmed', 'ready'].includes(item.status) }
    }
    const refundCents = Math.round(buyerPaidForItem * (1 - CANCELLATION_FEE_PERCENT / 100))
    const feeCents = buyerPaidForItem - refundCents
    const vendorConfirmed = ['confirmed', 'ready'].includes(item.status)
    // Fee split only compensates the vendor who actually prepped.
    const platformShareCents = vendorConfirmed
      ? Math.round(feeCents * (STRIPE_CONFIG.applicationFeePercent / 100))
      : feeCents
    const vendorShareCents = feeCents - platformShareCents
    return { id: item.id, refundCents, feeCents, vendorShareCents, platformShareCents, vendorConfirmed }
  })

  const marginRefundCents = feeApplied
    ? Math.round(input.marginAddendCents * (1 - CANCELLATION_FEE_PERCENT / 100))
    : input.marginAddendCents

  return {
    feeApplied,
    withinGracePeriod,
    anyVendorConfirmed,
    perItem,
    marginRefundCents,
    totalRefundCents: perItem.reduce((s, i) => s + i.refundCents, 0) + marginRefundCents,
    totalFeeCents: perItem.reduce((s, i) => s + i.feeCents, 0) + (input.marginAddendCents - marginRefundCents),
  }
}
