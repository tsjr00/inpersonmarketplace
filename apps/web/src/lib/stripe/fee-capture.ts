import Stripe from 'stripe'
import { stripe } from './config'
import type { createServiceClient } from '@/lib/supabase/server'
import { observed } from '@/lib/errors'

/**
 * ADM-2 fee capture. The ACTUAL Stripe processing fee the platform bears on a
 * charge lives on that charge's balance_transaction.fee. Because this app uses
 * destination charges (payments.ts transfer_data.destination), the platform is
 * merchant of record and pays that fee — so it is exactly "what we pay Stripe".
 *
 * Shared by the settlement webhook (capture going forward) and the backfill
 * route (historical rows).
 */

/**
 * Retrieve the actual Stripe fee (cents) for a PaymentIntent's charge.
 * Returns null when unavailable (no charge yet, balance_transaction still
 * pending, or fee absent). THROWS on a Stripe API error — callers decide
 * whether to swallow (webhook, non-blocking) or count it (backfill).
 */
export async function retrieveStripeFeeCents(paymentIntentId: string): Promise<number | null> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge.balance_transaction'],
  })
  const charge = pi.latest_charge
  if (!charge || typeof charge !== 'object') return null
  const bt = (charge as Stripe.Charge).balance_transaction
  if (!bt || typeof bt !== 'object') return null
  const fee = (bt as Stripe.BalanceTransaction).fee
  return typeof fee === 'number' ? fee : null
}

const BACKFILLABLE_STATUSES = ['succeeded', 'refunded', 'partially_refunded']

/**
 * Backfill payments.stripe_fee_cents for up to `limit` rows that don't have it
 * yet. Idempotent (only fills NULLs). Returns progress so the caller can invoke
 * repeatedly until `remaining` reaches 0. Requires mig 196 applied.
 */
export async function backfillStripeFees(
  supabase: ReturnType<typeof createServiceClient>,
  limit: number,
): Promise<{ processed: number; updated: number; failed: number; remaining: number }> {
  const { data: rows } = await observed(supabase
    .from('payments')
    .select('stripe_payment_intent_id')
    .is('stripe_fee_cents', null)
    .not('stripe_payment_intent_id', 'is', null)
    .in('status', BACKFILLABLE_STATUSES)
    .limit(limit), { table: 'payments' })

  let updated = 0
  let failed = 0
  for (const r of rows || []) {
    const pi = r.stripe_payment_intent_id as string
    try {
      const fee = await retrieveStripeFeeCents(pi)
      if (fee !== null) {
        await supabase
          .from('payments')
          .update({ stripe_fee_cents: fee })
          .eq('stripe_payment_intent_id', pi)
          .is('stripe_fee_cents', null)
        updated++
      }
    } catch {
      failed++ // e.g. a PI Stripe can't find; leave NULL → report uses the estimate
    }
  }

  const { count: remaining } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .is('stripe_fee_cents', null)
    .not('stripe_payment_intent_id', 'is', null)
    .in('status', BACKFILLABLE_STATUSES)

  return { processed: rows?.length || 0, updated, failed, remaining: remaining || 0 }
}
