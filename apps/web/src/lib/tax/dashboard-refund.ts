/**
 * charge.refunded × sales tax — what the webhook does about tax (Batch 3 step
 * 11; owner Q2 2026-09-24; design 2026-09-26). Called from
 * lib/stripe/webhooks.ts handleChargeRefunded with the ORDER already resolved.
 *
 * Stripe fires charge.refunded for EVERY refund on a charge — the ones our own
 * routes make (which already handled their tax and wrote the ledger) and the
 * ones an admin makes by hand in the Stripe dashboard (which nothing else
 * sees). This decides which it was and does the dashboard case's bookkeeping:
 *
 *   ours      → metadata.source === 'app' (createRefund tags every in-app
 *               refund) or, for refunds made before that tag existed, a ledger
 *               row under the refund id → NOTHING to do.
 *   dashboard, FULL     → one ledger row per item still live on the order
 *               (kind dashboard_refund, full remaining reversal, capped).
 *   dashboard, PARTIAL  → we know the amount but not the items: never a
 *               pro-rata guess (a guess would go on the tax return). If any
 *               live item on the order carries tax, write ONE "reversal owed"
 *               row to order_tax_reversal_queue; an admin allocates it to items
 *               later. A retried event hits the queue's UNIQUE refund id and
 *               is treated as already queued.
 *
 * The refund that triggered the event: `charge.refunds` when Stripe includes
 * it (the SDK marks it optional — it is only present when expanded), else one
 * refunds.list call by payment intent, newest first.
 *
 * NEVER THROWS. A throw inside a webhook handler makes Stripe retry the whole
 * event; everything here is additive bookkeeping, so a failure is logged and
 * the event completes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logError, TracedError, observed } from '@/lib/errors'
import { recordOrderTaxReversals, taxReversalRecorded, TAX_REVERSAL_QUEUE } from './refund-ledger'

/** The slice of a Stripe Refund this needs (kept structural so the spec needs no SDK). */
export interface RefundLike {
  id: string
  amount: number
  /** Unix seconds — newest refund wins. */
  created: number
  metadata?: Record<string, string> | null
}

export interface ChargeLike {
  amount: number
  amount_refunded: number
  refunds?: { data: RefundLike[] } | null
}

export type ChargeRefundTaxOutcome =
  | 'ours'
  | 'dashboard_full'
  | 'dashboard_partial_queued'
  | 'dashboard_partial_no_tax'
  | 'no_refund_found'
  | 'failed'

const ROUTE = '/webhooks/stripe'

export async function reconcileChargeRefundTax(
  service: SupabaseClient,
  listRefunds: () => Promise<RefundLike[]>,
  charge: ChargeLike,
  orderId: string
): Promise<{ outcome: ChargeRefundTaxOutcome; refundId?: string }> {
  try {
    const refunds = charge.refunds?.data?.length ? charge.refunds.data : await listRefunds()
    const newest = [...refunds].sort((a, b) => b.created - a.created)[0]
    if (!newest) {
      await logError(new TracedError('ERR_REFUND_001', `charge.refunded for order ${orderId}: no refund object found on the charge or by listing — tax reversal not recorded; check the Stripe dashboard`, { route: ROUTE, method: 'POST', orderId }))
      return { outcome: 'no_refund_found' }
    }

    const ours = newest.metadata?.source === 'app' || await taxReversalRecorded(service, newest.id)
    if (ours) return { outcome: 'ours', refundId: newest.id }

    if (charge.amount_refunded >= charge.amount) {
      await recordOrderTaxReversals(service, { orderId, refundRef: newest.id, kind: 'dashboard_refund', route: ROUTE })
      return { outcome: 'dashboard_full', refundId: newest.id }
    }

    // Partial dashboard refund: only worth an admin's time if there is tax on the order.
    const { data: taxed, error: taxedErr } = await observed(service
      .from('order_items')
      .select('id')
      .eq('order_id', orderId)
      .is('cancelled_at', null)
      .gt('tax_amount_cents', 0)
      .limit(1), { table: 'order_items' })
    if (taxedErr) throw new TracedError('ERR_REFUND_001', `order_items read failed: ${taxedErr.message}`)
    if (!taxed || taxed.length === 0) return { outcome: 'dashboard_partial_no_tax', refundId: newest.id }

    const { error: queueErr } = await service.from(TAX_REVERSAL_QUEUE).insert({
      order_id: orderId,
      stripe_refund_id: newest.id,
      refund_amount_cents: newest.amount,
    })
    if (queueErr && queueErr.code !== '23505') throw new TracedError('ERR_REFUND_001', `queue insert failed: ${queueErr.message}`)
    return { outcome: 'dashboard_partial_queued', refundId: newest.id }
  } catch (err) {
    await logError(new TracedError('ERR_REFUND_001',
      `charge.refunded tax bookkeeping failed for order ${orderId}: ${err instanceof Error ? err.message : String(err)} — check the Stripe dashboard refund against the tax ledger / queue by hand`,
      { route: ROUTE, method: 'POST', orderId }))
    return { outcome: 'failed' }
  }
}
