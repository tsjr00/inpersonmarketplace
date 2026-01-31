/**
 * Vendor Fee Calculation and Management
 *
 * Handles platform fees for external payment methods (Venmo, Cash App, PayPal, Cash).
 * Fees are tracked and either auto-deducted from Stripe payouts or invoiced.
 */

import { SupabaseClient } from '@supabase/supabase-js'

// Fee structure
export const BUYER_FEE_PERCENT = 6.5 // 6.5%
export const BUYER_FEE_FIXED_CENTS = 15 // $0.15
export const SELLER_FEE_PERCENT = 3.5 // 3.5% for external payments

// Thresholds for invoicing
export const BALANCE_INVOICE_THRESHOLD_CENTS = 5000 // $50
export const AGE_INVOICE_THRESHOLD_DAYS = 40

// Cap for auto-deduction from Stripe payouts
export const AUTO_DEDUCT_MAX_PERCENT = 50 // Don't take more than 50% of vendor payout

/**
 * Calculate buyer fee for an order
 * @param subtotalCents - Order subtotal in cents
 * @returns Buyer fee in cents
 */
export function calculateBuyerFee(subtotalCents: number): number {
  const percentFee = Math.round(subtotalCents * (BUYER_FEE_PERCENT / 100))
  return percentFee + BUYER_FEE_FIXED_CENTS
}

/**
 * Calculate seller fee for external payment order
 * @param subtotalCents - Order subtotal in cents
 * @returns Seller fee in cents
 */
export function calculateSellerFee(subtotalCents: number): number {
  return Math.round(subtotalCents * (SELLER_FEE_PERCENT / 100))
}

/**
 * Calculate total platform fee owed for external payment
 * @param subtotalCents - Order subtotal in cents
 * @returns Total fee (buyer + seller) in cents
 */
export function calculateTotalExternalFee(subtotalCents: number): number {
  return calculateBuyerFee(subtotalCents) + calculateSellerFee(subtotalCents)
}

/**
 * Calculate order total for external payment (subtotal + buyer fee)
 * @param subtotalCents - Order subtotal in cents
 * @returns Total amount buyer pays in cents
 */
export function calculateExternalPaymentTotal(subtotalCents: number): number {
  return subtotalCents + calculateBuyerFee(subtotalCents)
}

/**
 * Get vendor's current fee balance
 * @param supabase - Supabase client
 * @param vendorProfileId - Vendor profile ID
 * @returns Fee balance info
 */
export async function getVendorFeeBalance(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<{
  balanceCents: number
  oldestUnpaidAt: Date | null
  requiresPayment: boolean
}> {
  const { data, error } = await supabase
    .from('vendor_fee_balance')
    .select('balance_cents, oldest_unpaid_at')
    .eq('vendor_profile_id', vendorProfileId)
    .single()

  if (error || !data) {
    return {
      balanceCents: 0,
      oldestUnpaidAt: null,
      requiresPayment: false
    }
  }

  const oldestUnpaidAt = data.oldest_unpaid_at ? new Date(data.oldest_unpaid_at) : null
  const daysSinceOldest = oldestUnpaidAt
    ? (Date.now() - oldestUnpaidAt.getTime()) / (1000 * 60 * 60 * 24)
    : 0

  const requiresPayment =
    data.balance_cents >= BALANCE_INVOICE_THRESHOLD_CENTS ||
    daysSinceOldest >= AGE_INVOICE_THRESHOLD_DAYS

  return {
    balanceCents: data.balance_cents,
    oldestUnpaidAt,
    requiresPayment
  }
}

/**
 * Add fee debit to vendor ledger (when external payment order confirmed)
 * @param supabase - Supabase client (service role)
 * @param vendorProfileId - Vendor profile ID
 * @param orderId - Order ID
 * @param subtotalCents - Order subtotal in cents
 * @returns Ledger entry
 */
export async function recordExternalPaymentFee(
  supabase: SupabaseClient,
  vendorProfileId: string,
  orderId: string,
  subtotalCents: number
): Promise<{ success: boolean; error?: string }> {
  const totalFee = calculateTotalExternalFee(subtotalCents)

  const { error } = await supabase
    .from('vendor_fee_ledger')
    .insert({
      vendor_profile_id: vendorProfileId,
      order_id: orderId,
      amount_cents: totalFee,
      type: 'debit',
      description: `Platform fee for external payment order`
    })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Record fee credit (when fees are paid or auto-deducted)
 * @param supabase - Supabase client (service role)
 * @param vendorProfileId - Vendor profile ID
 * @param amountCents - Amount credited in cents
 * @param description - Description of credit
 * @param orderId - Optional order ID if from auto-deduction
 * @returns Success status
 */
export async function recordFeeCredit(
  supabase: SupabaseClient,
  vendorProfileId: string,
  amountCents: number,
  description: string,
  orderId?: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('vendor_fee_ledger')
    .insert({
      vendor_profile_id: vendorProfileId,
      order_id: orderId || null,
      amount_cents: amountCents,
      type: 'credit',
      description
    })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Calculate how much to add to Stripe application_fee for auto-deduction
 * @param vendorPayoutCents - Amount vendor would receive from this Stripe order
 * @param owedBalanceCents - Current fee balance owed
 * @returns Amount to add to application_fee (capped at 50% of payout)
 */
export function calculateAutoDeductAmount(
  vendorPayoutCents: number,
  owedBalanceCents: number
): number {
  if (owedBalanceCents <= 0) {
    return 0
  }

  const maxDeduct = Math.floor(vendorPayoutCents * (AUTO_DEDUCT_MAX_PERCENT / 100))
  return Math.min(owedBalanceCents, maxDeduct)
}

/**
 * Get vendor fee ledger entries
 * @param supabase - Supabase client
 * @param vendorProfileId - Vendor profile ID
 * @param limit - Max entries to return
 * @returns Ledger entries
 */
export async function getVendorFeeLedger(
  supabase: SupabaseClient,
  vendorProfileId: string,
  limit: number = 50
): Promise<Array<{
  id: string
  orderId: string | null
  amountCents: number
  type: 'debit' | 'credit'
  description: string | null
  createdAt: string
}>> {
  const { data, error } = await supabase
    .from('vendor_fee_ledger')
    .select('id, order_id, amount_cents, type, description, created_at')
    .eq('vendor_profile_id', vendorProfileId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) {
    return []
  }

  return data.map(entry => ({
    id: entry.id,
    orderId: entry.order_id,
    amountCents: entry.amount_cents,
    type: entry.type as 'debit' | 'credit',
    description: entry.description,
    createdAt: entry.created_at
  }))
}

/**
 * Check if vendor can use external payment methods
 * @param supabase - Supabase client
 * @param vendorProfileId - Vendor profile ID
 * @returns Whether external payments are allowed
 */
export async function canUseExternalPayments(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Check if vendor has Stripe connected
  const { data: vendor, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('stripe_account_id')
    .eq('id', vendorProfileId)
    .single()

  if (vendorError || !vendor) {
    return { allowed: false, reason: 'Vendor profile not found' }
  }

  if (!vendor.stripe_account_id) {
    return { allowed: false, reason: 'Stripe account required for external payments' }
  }

  // Check fee balance
  const { balanceCents, oldestUnpaidAt } = await getVendorFeeBalance(supabase, vendorProfileId)

  if (balanceCents >= BALANCE_INVOICE_THRESHOLD_CENTS) {
    return {
      allowed: false,
      reason: `Outstanding fee balance of $${(balanceCents / 100).toFixed(2)} must be paid`
    }
  }

  if (oldestUnpaidAt) {
    const daysSinceOldest = (Date.now() - oldestUnpaidAt.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceOldest >= AGE_INVOICE_THRESHOLD_DAYS) {
      return {
        allowed: false,
        reason: `Fee balance over ${AGE_INVOICE_THRESHOLD_DAYS} days old must be paid`
      }
    }
  }

  return { allowed: true }
}
