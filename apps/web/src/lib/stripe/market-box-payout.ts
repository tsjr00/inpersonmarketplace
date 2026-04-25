import { transferMarketBoxPayout, getChargeIdFromPaymentIntent } from './payments'
import { calculateVendorPayout } from '@/lib/pricing'
import { sendNotification } from '@/lib/notifications'
import { TracedError, logError } from '@/lib/errors'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProcessMarketBoxPayoutOpts {
  serviceClient: SupabaseClient
  subscriptionId: string
  offeringId: string
  /** Amount the buyer actually paid for this subscription, in cents. */
  actualPaidCents: number
  /** Stripe payment intent ID — used to thread source_transaction so the */
  /** transfer queues against the specific charge instead of the platform's */
  /** available balance (avoids balance_insufficient before funds settle). */
  paymentIntentId: string | null
  /** Caller context for error attribution in logs. */
  source: 'checkout-success' | 'stripe-webhook'
}

/**
 * Idempotently create a vendor_payouts row and initiate the Stripe transfer
 * for a market box subscription.
 *
 * Bug history:
 * - CRIT-1 (2026-04-24): formerly used offering.price_4week_cents (full price)
 *   to compute vendor payout, which over-paid vendors when buyer paid half
 *   (biweekly subscriptions). Now uses actualPaidCents directly.
 * - CRIT-2 (2026-04-24): formerly omitted source_transaction, causing
 *   balance_insufficient when transfer fired before charge settled.
 */
export async function processMarketBoxPayout(opts: ProcessMarketBoxPayoutOpts): Promise<void> {
  const { serviceClient, subscriptionId, offeringId, actualPaidCents, paymentIntentId, source } = opts

  if (actualPaidCents <= 0) return

  try {
    // Idempotency: skip if a non-terminal payout already exists.
    // 'failed' and 'cancelled' are terminal and do NOT block — the unique
    // partial index on vendor_payouts(market_box_subscription_id) WHERE
    // status NOT IN ('failed','cancelled') matches this filter.
    const { data: existingPayout } = await serviceClient
      .from('vendor_payouts')
      .select('id')
      .eq('market_box_subscription_id', subscriptionId)
      .not('status', 'in', '("failed","cancelled")')
      .maybeSingle()

    if (existingPayout) return

    // Resolve vendor from the offering
    const { data: offering } = await serviceClient
      .from('market_box_offerings')
      .select('vendor_profile_id')
      .eq('id', offeringId)
      .single()

    if (!offering) return

    const { data: vendor } = await serviceClient
      .from('vendor_profiles')
      .select('id, stripe_account_id, stripe_payouts_enabled, user_id, vertical_id')
      .eq('id', offering.vendor_profile_id)
      .single()

    if (!vendor) return

    // Vendor share comes off the actual amount paid, not the full weekly price
    const vendorPayoutCents = calculateVendorPayout(actualPaidCents)

    if (vendor.stripe_account_id && vendor.stripe_payouts_enabled) {
      // Insert pending row BEFORE transfer so failures are tracked
      const { data: payoutRecord, error: insertErr } = await serviceClient
        .from('vendor_payouts')
        .insert({
          market_box_subscription_id: subscriptionId,
          vendor_profile_id: vendor.id,
          amount_cents: vendorPayoutCents,
          stripe_transfer_id: null,
          status: 'pending',
        })
        .select('id')
        .single()

      if (insertErr) {
        if (insertErr.code === '23505') return  // duplicate due to race — ignore
        await logError(new TracedError('ERR_PAYOUT_003', `Failed to insert pending market box payout: ${insertErr.message}`, {
          route: source === 'checkout-success' ? '/api/checkout/success' : '/webhooks/stripe',
          method: source === 'checkout-success' ? 'GET' : 'POST',
          subscriptionId,
        }))
        return
      }

      try {
        // Thread source_transaction so Stripe queues the transfer against the
        // specific charge — works even before funds become available
        let chargeId: string | undefined
        if (paymentIntentId) {
          chargeId = (await getChargeIdFromPaymentIntent(paymentIntentId)) || undefined
        }

        const transfer = await transferMarketBoxPayout({
          amount: vendorPayoutCents,
          destination: vendor.stripe_account_id,
          subscriptionId,
          sourceTransaction: chargeId,
        })

        await serviceClient
          .from('vendor_payouts')
          .update({
            stripe_transfer_id: transfer.id,
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', payoutRecord.id)
      } catch (transferErr) {
        console.error('[MARKET_BOX_PAYOUT] Transfer failed:', transferErr)
        await serviceClient
          .from('vendor_payouts')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', payoutRecord.id)
      }
    } else {
      // Vendor not yet Stripe-ready — queue for cron retry once they are
      const { error: pendingInsertErr } = await serviceClient
        .from('vendor_payouts')
        .insert({
          market_box_subscription_id: subscriptionId,
          vendor_profile_id: vendor.id,
          amount_cents: vendorPayoutCents,
          stripe_transfer_id: null,
          status: 'pending_stripe_setup',
        })
      if (pendingInsertErr && pendingInsertErr.code === '23505') return
    }

    if (vendor.user_id) {
      await sendNotification(vendor.user_id, 'payout_processed', {
        amountCents: vendorPayoutCents,
      }, { vertical: vendor.vertical_id })
    }
  } catch (err) {
    console.error('[MARKET_BOX_PAYOUT] Error in processMarketBoxPayout:', err)
  }
}
