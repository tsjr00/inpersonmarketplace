import type { SupabaseClient } from '@supabase/supabase-js'
import { refundEventFeePayment } from '@/lib/stripe/event-fee-payments'
import { sendNotification } from '@/lib/notifications/service'
import { logError, TracedError } from '@/lib/errors'

/**
 * Event cancelled → give every paying vendor their fee back (Event Vendor
 * Fees Phase 5, merged into the Backup bench Phase 3 pass, 2026-08-16).
 *
 * Called by BOTH event-cancel paths — the organizer's own cancel route and
 * the admin status change — after the event's status flip succeeds.
 *
 * Per row:
 *   paid            → full refund WITH transfer reversal + vendor notice.
 *                     Failures log and continue (one vendor's refund failing
 *                     must not strand the rest); the row keeps status 'paid'
 *                     so the money state stays truthful and the error log
 *                     carries the retry.
 *   pending_payment → released (their checkout is now pointless).
 *   covered         → released (no money ever moved for a covered spot).
 *   forfeited       → UNTOUCHED. The forfeit predates the event's death and
 *                     the organizer keeps the waiver lever (event+14d) for it.
 *
 * Returns counts for the caller's response/logging.
 */
export async function refundAllEventFeePayments(
  serviceClient: SupabaseClient,
  marketId: string,
  vertical: string,
  route: string
): Promise<{ refunded: number; failed: number; released: number }> {
  const { data: rows } = await serviceClient
    .from('event_vendor_fee_payments')
    .select('id, vendor_profile_id, vendor_pays_cents, status, stripe_payment_intent_id, vendor_profiles:vendor_profile_id(user_id)')
    .eq('market_id', marketId)
    .in('status', ['pending_payment', 'paid', 'covered'])

  let refunded = 0
  let failed = 0
  let released = 0

  const releasable = (rows || []).filter(r => r.status !== 'paid')
  if (releasable.length > 0) {
    await serviceClient
      .from('event_vendor_fee_payments')
      .update({ status: 'released' })
      .in('id', releasable.map(r => r.id as string))
      .in('status', ['pending_payment', 'covered'])
    released = releasable.length
  }

  const { data: marketRow } = await serviceClient
    .from('markets')
    .select('name')
    .eq('id', marketId)
    .maybeSingle()
  const marketName = (marketRow?.name as string) || 'the event'

  for (const row of (rows || []).filter(r => r.status === 'paid')) {
    try {
      if (!row.stripe_payment_intent_id) throw new Error('paid row has no payment intent id')
      await refundEventFeePayment({
        paymentIntentId: row.stripe_payment_intent_id as string,
        paymentId: row.id as string,
        reason: 'event_cancelled',
      })
      await serviceClient
        .from('event_vendor_fee_payments')
        .update({
          status: 'refunded',
          refunded_at: new Date().toISOString(),
          refund_reason: 'event_cancelled',
        })
        .eq('id', row.id)
        .eq('status', 'paid')
      refunded++

      const vendorUserId = (row.vendor_profiles as unknown as { user_id?: string } | null)?.user_id
      if (vendorUserId) {
        await sendNotification(vendorUserId, 'event_fee_refunded_vendor', {
          marketName,
          marketId,
          amountCents: row.vendor_pays_cents as number,
          feeRefundReason: 'event_cancelled',
          dedupRef: `${row.id}-event-cancelled`,
        }, { vertical })
      }
    } catch (refundErr) {
      failed++
      await logError(new TracedError('ERR_REFUND_001', `[event-fee-refunds] Refund failed for payment ${row.id} at market ${marketId}: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
        route, method: 'POST',
        amountCents: row.vendor_pays_cents as number,
      }))
    }
  }

  return { refunded, failed, released }
}
