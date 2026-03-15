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
export function calculateCancellationFee(input: CancellationInput): CancellationResult {
  const { subtotalCents, totalItemsInOrder, orderStatus, orderCreatedAt } = input
  const now = input.now ?? new Date()

  // Calculate what buyer originally paid for this item
  // M12 FIX: Use floor-based proration to avoid off-by-one (remainder goes to last item at checkout)
  const flatFeePerItem = proratedFlatFeeSimple(STRIPE_CONFIG.buyerFlatFeeCents, totalItemsInOrder)
  const buyerFeeOnItem = Math.round(subtotalCents * (STRIPE_CONFIG.buyerFeePercent / 100)) + flatFeePerItem
  const buyerPaidForItem = subtotalCents + buyerFeeOnItem

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
