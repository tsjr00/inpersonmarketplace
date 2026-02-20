/**
 * Cancellation Fee Calculations
 *
 * Extracted from /api/buyer/orders/[id]/cancel/route.ts for testability.
 * Pure functions — no Supabase or Stripe calls.
 */

import { STRIPE_CONFIG } from '@/lib/stripe/config'

// Cancellation fee: 25% of what the buyer paid, retained and split between platform + vendor
export const CANCELLATION_FEE_PERCENT = 25

// Grace period: 1 hour after order creation — full refund, no questions asked
export const GRACE_PERIOD_MS = 60 * 60 * 1000

export interface CancellationInput {
  subtotalCents: number
  totalItemsInOrder: number
  orderStatus: string
  orderCreatedAt: Date
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
 * Layer 1: Within 1-hour grace period → full refund (always wins)
 * Layer 2: After grace period AND vendor has confirmed/prepared → 25% cancellation fee
 * Layer 3: After grace but vendor NOT confirmed → full refund
 */
export function calculateCancellationFee(input: CancellationInput): CancellationResult {
  const { subtotalCents, totalItemsInOrder, orderStatus, orderCreatedAt } = input
  const now = input.now ?? new Date()

  // Calculate what buyer originally paid for this item
  const flatFeePerItem = Math.round(STRIPE_CONFIG.buyerFlatFeeCents / totalItemsInOrder)
  const buyerFeeOnItem = Math.round(subtotalCents * (STRIPE_CONFIG.buyerFeePercent / 100)) + flatFeePerItem
  const buyerPaidForItem = subtotalCents + buyerFeeOnItem

  // Determine grace period and vendor confirmation status
  const gracePeriodEndsAt = new Date(orderCreatedAt.getTime() + GRACE_PERIOD_MS)
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
