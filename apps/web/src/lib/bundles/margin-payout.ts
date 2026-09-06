import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe/config'
import { getChargeIdFromPaymentIntent } from '@/lib/stripe/payments'
import { splitMargin, bundleMarginIdempotencyKey } from '@/lib/bundles/core'
import { observed, logError, TracedError } from '@/lib/errors'

/**
 * Bundle margin payout (B1+B2, mig 244) — fires ONLY at handoff.
 *
 * THE INVARIANT: the margin transfers to markets.stripe_account_id only after
 * bundle_handed_off_at is set, so a pre-handoff cancellation never needs a
 * margin clawback — refunds ride the ordinary per-item paths and the margin
 * simply never moves.
 *
 * Money model (separate-transfer pattern, mirrors fulfill/route.ts): the
 * booth/park rails to the market account are DESTINATION CHARGES (single
 * payee at payment time) and cannot carry a multi-vendor order, so the
 * margin is its own transfer with the deterministic idempotency key
 * `bundle-margin:{order_id}` and source_transaction from the order's charge.
 *
 * B2 cause leg: cause_pct% of the margin is credited to the beneficiary on
 * the mig-213 cause_ledger ('collected', order_id NULL — the partial unique
 * index uq_cause_ledger_collected_order covers chip-ins keyed by order_id,
 * and a bundle order can carry a chip-in too, so the bundle share must not
 * compete for that key; the note carries the order number). The existing
 * remit sweep / manual-check flow pays the org — works for check-method
 * beneficiaries with no Stripe account. Only the market's remainder moves
 * here.
 *
 * Concurrency: an atomic claim flips bundle_margin_transfer_id NULL →
 * 'pending' (0 rows = another caller won or it's already paid). A failure
 * after the claim leaves 'pending' + an error_logs row; recovery is manual
 * reconciliation (the same documented no-double-pay-over-completeness trade
 * as runCauseRemitSweep — remit.ts:30-36). v1 has NO automatic retry: that
 * is what makes a double ledger write or double transfer impossible.
 */

export type BundleMarginResult =
  | { status: 'paid'; marketCents: number; causeCents: number; transferId: string }
  | { status: 'already_paid' }
  | { status: 'payout_pending' }   // a prior attempt claimed but didn't finish — needs reconciliation
  | { status: 'nothing_to_pay' }   // not a bundle order, or zero margin
  | { status: 'not_handed_off' }
  | { status: 'awaiting_buyer_ack' } // two-part confirmation: buyer hasn't acknowledged the bundle yet
  | { status: 'not_paid' }         // no proven buyer payment — money must not move
  | { status: 'failed'; reason: string }

const PENDING_SENTINEL = 'pending'

export async function payBundleMargin(
  serviceClient: SupabaseClient,
  orderId: string
): Promise<BundleMarginResult> {
  const { data: order } = await observed(serviceClient
    .from('orders')
    .select('id, order_number, status, bundle_id, bundle_margin_cents, bundle_handed_off_at, bundle_margin_transfer_id, bundle_buyer_ack_at')
    .eq('id', orderId)
    .maybeSingle(), { table: 'orders' })

  if (!order || !order.bundle_id || !order.bundle_margin_cents || order.bundle_margin_cents <= 0) {
    return { status: 'nothing_to_pay' }
  }
  if (!order.bundle_handed_off_at) return { status: 'not_handed_off' }
  // Two-part confirmation (mig 246, owner decision 2026-09-06): the margin
  // moves only when BOTH parties have acted — the manager's handoff stamp
  // AND the buyer's bundle acknowledge — mirroring the per-item machine
  // where money moves on the second of buyer-ack/vendor-fulfill.
  if (!order.bundle_buyer_ack_at) return { status: 'awaiting_buyer_ack' }
  if (order.bundle_margin_transfer_id === PENDING_SENTINEL) return { status: 'payout_pending' }
  if (order.bundle_margin_transfer_id) return { status: 'already_paid' }

  // Payment proof before any money moves (VOR-1 mirror, fulfill/route.ts:100-105):
  // without a succeeded payment the transfer would come from the platform's own
  // balance. Bundle orders are webhook-flipped to paid; the payments row is the
  // backstop when the order-status flip raced.
  let paymentIntentId: string | null = null
  if (!['paid', 'completed'].includes(order.status as string)) {
    const { data: paidPayment } = await observed(serviceClient
      .from('payments')
      .select('stripe_payment_intent_id')
      .eq('order_id', orderId)
      .eq('status', 'succeeded')
      .maybeSingle(), { table: 'payments' })
    if (!paidPayment) return { status: 'not_paid' }
    paymentIntentId = (paidPayment.stripe_payment_intent_id as string) || null
  }

  const { data: bundle } = await observed(serviceClient
    .from('market_bundles')
    .select('id, market_id, name, cause_beneficiary_id, cause_pct')
    .eq('id', order.bundle_id)
    .maybeSingle(), { table: 'market_bundles' })
  if (!bundle) return { status: 'failed', reason: 'bundle row missing' }

  const { data: market } = await observed(serviceClient
    .from('markets')
    .select('id, name, stripe_account_id')
    .eq('id', bundle.market_id)
    .maybeSingle(), { table: 'markets' })
  if (!market?.stripe_account_id) {
    // Eligibility (Q4) requires the Connect account to create a bundle, so this
    // is a data anomaly worth a loud log, not a silent skip.
    await logError(new TracedError('ERR_BUNDLE_001',
      `Bundle margin payout blocked: market ${bundle.market_id} has no stripe_account_id (order ${orderId})`,
      { route: 'lib/bundles/margin-payout', method: 'POST' }))
    return { status: 'failed', reason: 'market has no Stripe account' }
  }

  // Atomic claim — the only writer that proceeds is the one that flips NULL→pending.
  const { data: claimed } = await observed(serviceClient
    .from('orders')
    .update({ bundle_margin_transfer_id: PENDING_SENTINEL })
    .eq('id', orderId)
    .is('bundle_margin_transfer_id', null)
    .select('id'), { table: 'orders', operation: 'update' })
  if (!claimed || claimed.length === 0) return { status: 'already_paid' }

  const { causeCents, marketCents } = splitMargin(
    order.bundle_margin_cents as number,
    bundle.cause_beneficiary_id ? (bundle.cause_pct as number | null) : null
  )

  // B2 cause leg FIRST (a ledger credit, no money movement — the remit sweep
  // pays it). Runs at most once: only the claim winner reaches this line, and
  // there is no retry path back into it.
  if (causeCents > 0 && bundle.cause_beneficiary_id) {
    const { error: ledgerErr } = await serviceClient.from('cause_ledger').insert({
      beneficiary_id: bundle.cause_beneficiary_id,
      order_id: null,
      amount_cents: causeCents,
      type: 'collected',
      note: `Bundle margin share — order ${order.order_number} ("${bundle.name}")`,
    })
    if (ledgerErr) {
      // Nothing has moved yet — release the claim so the payout can be re-run.
      await serviceClient.from('orders')
        .update({ bundle_margin_transfer_id: null })
        .eq('id', orderId)
        .eq('bundle_margin_transfer_id', PENDING_SENTINEL)
      await logError(new TracedError('ERR_BUNDLE_002',
        `Bundle cause-ledger write failed for order ${orderId}: ${ledgerErr.message}`,
        { route: 'lib/bundles/margin-payout', method: 'POST' }))
      return { status: 'failed', reason: 'cause ledger write failed' }
    }
  }

  // 100%-to-cause bundle: no market transfer to make — record and finish.
  if (marketCents === 0) {
    await serviceClient.from('orders')
      .update({ bundle_margin_transfer_id: 'cause-only' })
      .eq('id', orderId)
      .eq('bundle_margin_transfer_id', PENDING_SENTINEL)
    return { status: 'paid', marketCents: 0, causeCents, transferId: 'cause-only' }
  }

  // source_transaction ties the transfer to the buyer's charge (avoids
  // balance_insufficient on pending funds — same as transferToVendor).
  let chargeId: string | undefined
  if (!paymentIntentId) {
    const { data: payment } = await observed(serviceClient
      .from('payments')
      .select('stripe_payment_intent_id')
      .eq('order_id', orderId)
      .eq('status', 'succeeded')
      .maybeSingle(), { table: 'payments' })
    paymentIntentId = (payment?.stripe_payment_intent_id as string) || null
  }
  if (paymentIntentId) {
    chargeId = (await getChargeIdFromPaymentIntent(paymentIntentId)) || undefined
  }

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: marketCents,
        currency: 'usd',
        destination: market.stripe_account_id as string,
        ...(chargeId ? { source_transaction: chargeId } : {}),
        metadata: {
          type: 'bundle_margin',
          order_id: orderId,
          bundle_id: bundle.id as string,
          market_id: market.id as string,
          cause_cents: String(causeCents),
        },
      },
      { idempotencyKey: bundleMarginIdempotencyKey(orderId) }
    )

    await serviceClient.from('orders')
      .update({ bundle_margin_transfer_id: transfer.id })
      .eq('id', orderId)
      .eq('bundle_margin_transfer_id', PENDING_SENTINEL)

    return { status: 'paid', marketCents, causeCents, transferId: transfer.id }
  } catch (transferErr) {
    // Claim stays 'pending' ON PURPOSE: the cause ledger row (if any) already
    // exists, so re-entering the claim path would double-credit the cause.
    // Reconciliation query: orders WHERE bundle_margin_transfer_id = 'pending'.
    await logError(new TracedError('ERR_BUNDLE_003',
      `Bundle margin transfer failed for order ${orderId} (market ${market.id}): ${transferErr instanceof Error ? transferErr.message : String(transferErr)}`,
      { route: 'lib/bundles/margin-payout', method: 'POST' }))
    return { status: 'failed', reason: 'Stripe transfer failed — payout marked pending for reconciliation' }
  }
}
