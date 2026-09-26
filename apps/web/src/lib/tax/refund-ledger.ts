/**
 * Refund-side tax LEDGER I/O — the one place that reads and writes
 * `order_item_tax_reversals` (mig 260). Batch 3 step 8, plan
 * `apps/web/.claude/tax_build_review_research.md` ("2026-09-26 — FULL CODE
 * RE-READ", items 1–5).
 *
 * The math stays in refund-tax.ts (pure). This module wraps it with the two
 * facts only the database knows — how much of an item's tax has ALREADY been
 * reversed by earlier refunds, and whether a given Stripe refund has already
 * been recorded — and writes the append-only row the monthly return subtracts
 * (reports/route.ts `generateTaxListSupplement`).
 *
 * Rules every call site relies on:
 *  - READ BEFORE THE REFUND, and a failed read THROWS. The read happens before
 *    the item is cancelled and before Stripe is called, so a thrown error
 *    aborts cleanly with nothing moved. Guessing "0 already reversed" on a
 *    flaky read could refund the same tax twice; guessing "everything
 *    reversed" would short the buyer. Neither is acceptable — loud stop.
 *  - WRITE AFTER STRIPE SUCCEEDS, and a failed write NEVER THROWS. The buyer
 *    has their money; a ledger problem is a filing problem for us to fix from
 *    error_logs, never a reason to fail the refund that already happened.
 *  - `refundRef` is the Stripe refund id (re_…) at EVERY site. UNIQUE
 *    (order_item_id, refund_ref) then makes a retried route AND the
 *    charge.refunded webhook (which fires for our own refunds too) converge
 *    on one row: the second writer gets 23505 and reports `duplicate`. The
 *    webhook also uses `taxReversalRecorded` to tell our refunds from ones
 *    made by hand in the Stripe dashboard (owner Q2).
 *  - A zero reversal (exempt item, pre-tax order, nothing left under the cap)
 *    writes NO row — the ledger holds reversals, not attempts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logError, TracedError, observed } from '@/lib/errors'
import {
  taxReversalForItem,
  type ItemTaxSnapshot,
  type RefundPortion,
  type TaxReversal,
} from './refund-tax'

export const TAX_REVERSAL_LEDGER = 'order_item_tax_reversals'
/** Owner Q2: "reversal OWED" rows for partial refunds made by hand in the Stripe dashboard (mig 260). */
export const TAX_REVERSAL_QUEUE = 'order_tax_reversal_queue'

/** Mirrors the mig-260 CHECK on reversal_kind. */
export type TaxReversalKind = 'item_refund' | 'order_refund' | 'dashboard_refund'

/** Sum of tax already reversed for this item across every earlier refund. Throws on a read failure (see header). */
export async function alreadyReversedCents(service: SupabaseClient, orderItemId: string): Promise<number> {
  const { data, error } = await observed(service
    .from(TAX_REVERSAL_LEDGER)
    .select('tax_cents')
    .eq('order_item_id', orderItemId), { table: TAX_REVERSAL_LEDGER })
  if (error) throw new TracedError('ERR_REFUND_001', `Tax reversal ledger read failed for order item ${orderItemId}: ${error.message}`)
  return (data ?? []).reduce((sum, row) => sum + ((row as { tax_cents: number | null }).tax_cents ?? 0), 0)
}

/**
 * The reversal a refund of `portion` of this item owes the buyer today —
 * the snapshot math capped by what the ledger says was already reversed.
 * Call BEFORE cancelling the item, so `refund_amount_cents` can be stored
 * tax-inclusive and the Stripe amount can include it.
 */
export async function taxReversalForOrderItem(
  service: SupabaseClient,
  orderItemId: string,
  snapshot: ItemTaxSnapshot,
  portion: RefundPortion
): Promise<TaxReversal> {
  // A row that never carried tax needs no ledger round-trip.
  if ((snapshot.tax_amount_cents ?? 0) <= 0) return taxReversalForItem(snapshot, portion, 0)
  const already = await alreadyReversedCents(service, orderItemId)
  return taxReversalForItem(snapshot, portion, already)
}

export interface RecordTaxReversalInput {
  orderItemId: string
  orderId: string
  kind: TaxReversalKind
  /** The Stripe refund id (re_…) — the same id at every site, see header. */
  refundRef: string
  reversal: TaxReversal
  /** For the error log when the write fails (lib code has no breadcrumb trail). */
  route: string
}

export type RecordTaxReversalOutcome = 'recorded' | 'duplicate' | 'skipped' | 'failed'

/** Append one ledger row AFTER the Stripe refund succeeded. Never throws. */
export async function recordTaxReversal(service: SupabaseClient, input: RecordTaxReversalInput): Promise<RecordTaxReversalOutcome> {
  const { reversal } = input
  if (reversal.taxCents <= 0) return 'skipped'

  const { error } = await service.from(TAX_REVERSAL_LEDGER).insert({
    order_item_id: input.orderItemId,
    order_id: input.orderId,
    reversal_kind: input.kind,
    refund_ref: input.refundRef,
    taxable_amount_cents: reversal.taxableAmountCents,
    tax_cents: reversal.taxCents,
    tax_jurisdictions: reversal.jurisdictions,
    tax_rate_version: reversal.rateVersion,
  })
  if (!error || error.code === '23505') {
    // Self-healing (owner 2026-09-26): if the charge.refunded webhook beat this
    // write and, unable to recognise the refund as ours, queued it as a
    // dashboard refund "owed" an admin allocation, close that queue row now —
    // the ledger row IS the allocation. Best effort; never affects the outcome.
    const { error: queueErr } = await service
      .from(TAX_REVERSAL_QUEUE)
      .update({ resolved_at: new Date().toISOString(), note: 'resolved automatically: the refund was made in-app and its tax reversal is in the ledger' })
      .eq('stripe_refund_id', input.refundRef)
      .is('resolved_at', null)
    if (queueErr) {
      await logError(new TracedError('ERR_REFUND_001',
        `Tax reversal queue self-heal failed for refund ${input.refundRef}: ${queueErr.message} — an admin may see an already-handled refund on the queue`,
        { route: input.route, method: 'POST', orderId: input.orderId }))
    }
    return error ? 'duplicate' : 'recorded'
  }

  // The buyer already has the money. This row is what the return needs —
  // say exactly what to re-enter so the error-log review can do it by hand.
  await logError(new TracedError('ERR_REFUND_001',
    `Tax reversal ledger write failed for order item ${input.orderItemId} (refund ${input.refundRef}, ${reversal.taxCents}¢ of tax reversed): ${error.message} — the row must be entered by hand before the ${reversal.rateVersion ?? 'current'} return is filed`,
    { route: input.route, method: 'POST', orderItemId: input.orderItemId, orderId: input.orderId, amountCents: reversal.taxCents }))
  return 'failed'
}

export interface OrderTaxReversalSummary {
  /** Live (un-cancelled) items the order had at refund time. */
  items: number
  recorded: number
  duplicate: number
  skipped: number
  failed: number
}

/**
 * A WHOLE-payment refund (event cancelled, order not re-confirmed, a payment
 * that landed on a dead order, a full dashboard refund): Stripe already
 * returned everything, so nothing about the amount changes here — this only
 * writes the return's ledger rows: one per item still live on the order,
 * each the item's full remaining reversal, all keyed by the ONE Stripe
 * refund id. Items cancelled earlier by a per-item path are excluded — their
 * tax already went back under their own refund id; the cap covers any item
 * that was partly reversed before.
 *
 * Runs AFTER Stripe succeeded, so it never throws: a read or write failure
 * is logged (with the refund id, so the rows can be entered by hand) and the
 * refund stands.
 */
export async function recordOrderTaxReversals(
  service: SupabaseClient,
  input: { orderId: string; refundRef: string; kind: TaxReversalKind; route: string }
): Promise<OrderTaxReversalSummary> {
  const summary: OrderTaxReversalSummary = { items: 0, recorded: 0, duplicate: 0, skipped: 0, failed: 0 }
  try {
    const { data: items, error } = await observed(service
      .from('order_items')
      .select('id, tax_amount_cents, taxable_amount_cents, tax_jurisdictions, tax_rate_version')
      .eq('order_id', input.orderId)
      .is('cancelled_at', null), { table: 'order_items' })
    if (error) throw new TracedError('ERR_REFUND_001', `order_items read failed: ${error.message}`)
    const rows = (items ?? []) as Array<{ id: string } & ItemTaxSnapshot>
    summary.items = rows.length
    for (const row of rows) {
      const reversal = await taxReversalForOrderItem(service, row.id, row, { kind: 'full' })
      const outcome = await recordTaxReversal(service, {
        orderItemId: row.id, orderId: input.orderId, kind: input.kind, refundRef: input.refundRef,
        reversal, route: input.route,
      })
      summary[outcome]++
    }
  } catch (err) {
    await logError(new TracedError('ERR_REFUND_001',
      `Tax reversal ledger rows for order ${input.orderId} (whole-payment refund ${input.refundRef}) could not be written: ${err instanceof Error ? err.message : String(err)} — enter the order's remaining item reversals by hand before the return is filed`,
      { route: input.route, method: 'POST', orderId: input.orderId }))
    summary.failed++
  }
  return summary
}

/** Has ANY ledger row been written for this Stripe refund? Throws on a read failure. */
export async function taxReversalRecorded(service: SupabaseClient, refundRef: string): Promise<boolean> {
  const { data, error } = await observed(service
    .from(TAX_REVERSAL_LEDGER)
    .select('id')
    .eq('refund_ref', refundRef)
    .limit(1), { table: TAX_REVERSAL_LEDGER })
  if (error) throw new TracedError('ERR_REFUND_001', `Tax reversal ledger lookup failed for refund ${refundRef}: ${error.message}`)
  return !!data && data.length > 0
}
