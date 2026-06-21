import type { SupabaseClient } from '@supabase/supabase-js'
import { createRefund } from '@/lib/stripe/payments'
import { restoreInventory } from '@/lib/inventory'
import { TracedError, logError } from '@/lib/errors'
import { FEES, proratedFlatFeeSimple } from '@/lib/pricing'

/**
 * Phase C — cancel-a-market-day cascade.
 *
 * Run with the SERVICE client AFTER the route has authenticated + isMarketManager
 * -gated. Three independent paths for everything tied to the cancelled (market, date):
 *
 *   A. Buyer product orders  -> auto-refund the full buyer-paid amount.
 *      Mirrors the vendor-reject cascade (refund + inventory restore + status flips)
 *      EXCEPT it never calls increment_vendor_cancelled — a market-day cancellation
 *      is the manager's/weather's doing, not the vendor's, so vendor reliability is
 *      untouched. cancelled_by = 'market'.
 *   B. Paid booth renters    -> identified for notification only. The credit/reschedule
 *      disposition lives on the market_date_overrides row (no money movement; feeds
 *      Phase E's cancelled-day counter).
 *   C. Market-box pickups    -> credited via the existing vendor_skip_week RPC
 *      (skip + makeup-extension + extend-by-one-week). vendor_skip_week notifies the
 *      subscriber itself (market_box_skip), so no extra MB notification here.
 *
 * Returns the recipient user-ids + counts so the route can fan out notifications.
 */

export interface CancelDateCascadeResult {
  refundedItemCount: number
  refundFailures: number
  buyerUserIds: string[]
  boothRenterUserIds: string[]
  marketBoxCredited: number
}

/** Sunday (YYYY-MM-DD) of the week containing the given YYYY-MM-DD date. */
export function weekStartSunday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay()) // back up to Sunday (getUTCDay 0=Sun)
  return dt.toISOString().slice(0, 10)
}

type OrderItemRow = {
  id: string
  order_id: string
  listing_id: string | null
  quantity: number | null
  subtotal_cents: number
  order: { id: string; buyer_user_id: string | null } | { id: string; buyer_user_id: string | null }[] | null
}

/** A. Refund buyer product orders for the cancelled date (no vendor penalty). */
async function refundProductOrders(
  service: SupabaseClient,
  marketId: string,
  overrideDate: string,
  reason: string,
): Promise<{ refundedItemCount: number; refundFailures: number; buyerUserIds: Set<string> }> {
  const buyerUserIds = new Set<string>()
  let refundedItemCount = 0
  let refundFailures = 0

  const { data: items } = await service
    .from('order_items')
    .select('id, order_id, listing_id, quantity, subtotal_cents, order:orders!inner ( id, buyer_user_id )')
    .eq('market_id', marketId)
    .eq('pickup_date', overrideDate)
    .is('cancelled_at', null)
    .in('status', ['pending', 'paid', 'confirmed', 'ready'])

  const rows = (items ?? []) as OrderItemRow[]
  // Count items per order once (prorated flat-fee denominator = ALL items in the order).
  const orderIds = [...new Set(rows.map((r) => r.order_id))]
  const itemsPerOrder = new Map<string, number>()
  for (const oid of orderIds) {
    const { count } = await service
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', oid)
    itemsPerOrder.set(oid, count ?? 1)
  }

  for (const item of rows) {
    const totalItems = itemsPerOrder.get(item.order_id) ?? 1
    const buyerPercentFee = Math.round(item.subtotal_cents * (FEES.buyerFeePercent / 100))
    const itemFlatFee = proratedFlatFeeSimple(FEES.buyerFlatFeeCents, totalItems)
    const buyerPaidForItem = item.subtotal_cents + buyerPercentFee + itemFlatFee

    // Conditional update — only the request that wins the race proceeds.
    const { data: updated } = await service
      .from('order_items')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'market',
        cancellation_reason: reason,
        refund_amount_cents: buyerPaidForItem,
      })
      .eq('id', item.id)
      .is('cancelled_at', null)
      .select('id')
    if (!updated || updated.length === 0) continue // already cancelled concurrently

    refundedItemCount++

    if (item.listing_id) {
      await restoreInventory(service, item.listing_id, item.quantity || 1)
    }

    // Refund (skip pay-at-pickup orders with no succeeded payment).
    const { data: payment } = await service
      .from('payments')
      .select('stripe_payment_intent_id')
      .eq('order_id', item.order_id)
      .eq('status', 'succeeded')
      .maybeSingle()

    if (payment?.stripe_payment_intent_id) {
      try {
        await createRefund(payment.stripe_payment_intent_id, item.id, buyerPaidForItem)
        await service.from('order_items').update({ status: 'refunded' }).eq('id', item.id)
      } catch (refundError) {
        refundFailures++
        await logError(new TracedError('ERR_REFUND_001',
          `Stripe refund failed for market-day cancellation: ${refundError instanceof Error ? refundError.message : String(refundError)}`,
          { route: '/api/market-manager/[marketId]/cancel-date', method: 'POST', orderItemId: item.id, orderId: item.order_id, amountCents: buyerPaidForItem }))
      }
    }

    const ord = Array.isArray(item.order) ? item.order[0] : item.order
    if (ord?.buyer_user_id) buyerUserIds.add(ord.buyer_user_id)
  }

  // Roll up any fully-cancelled orders + free event-wave slots.
  for (const oid of orderIds) {
    const { data: remaining } = await service
      .from('order_items')
      .select('id')
      .eq('order_id', oid)
      .is('cancelled_at', null)
    if (!remaining || remaining.length === 0) {
      await service.from('orders').update({ status: 'cancelled' }).eq('id', oid)
      const { error: waveErr } = await service.rpc('free_wave_on_order_cancel', { p_order_id: oid })
      if (waveErr) console.error('[cancel-date] free_wave_on_order_cancel:', waveErr.message)
    }
  }

  return { refundedItemCount, refundFailures, buyerUserIds }
}

/** B. Paid booth renters whose rented week contains the cancelled date. */
async function findAffectedBoothRenters(
  service: SupabaseClient,
  marketId: string,
  overrideDate: string,
): Promise<Set<string>> {
  const userIds = new Set<string>()
  const { data: renters } = await service
    .from('weekly_booth_rentals')
    .select('vendor_profiles!inner ( user_id )')
    .eq('market_id', marketId)
    .eq('status', 'paid')
    .eq('week_start_date', weekStartSunday(overrideDate))

  type RenterRow = { vendor_profiles: { user_id: string | null } | { user_id: string | null }[] | null }
  for (const r of (renters ?? []) as RenterRow[]) {
    const vp = Array.isArray(r.vendor_profiles) ? r.vendor_profiles[0] : r.vendor_profiles
    if (vp?.user_id) userIds.add(vp.user_id)
  }
  return userIds
}

/** C. Credit market-box pickups on the cancelled date via vendor_skip_week. */
async function creditMarketBoxPickups(
  service: SupabaseClient,
  marketId: string,
  overrideDate: string,
  reason: string,
): Promise<number> {
  let credited = 0
  // MB pickups link to a market via offering.pickup_market_id.
  const { data: pickups } = await service
    .from('market_box_pickups')
    .select('id, is_extension, subscription:market_box_subscriptions!inner ( status, offering:market_box_offerings!inner ( pickup_market_id ) )')
    .eq('scheduled_date', overrideDate)
    .in('status', ['scheduled', 'ready'])

  type PickupRow = {
    id: string
    is_extension: boolean | null
    subscription: { status: string; offering: { pickup_market_id: string } | { pickup_market_id: string }[] } | { status: string; offering: unknown }[] | null
  }

  for (const p of (pickups ?? []) as PickupRow[]) {
    const sub = Array.isArray(p.subscription) ? p.subscription[0] : p.subscription
    if (!sub || sub.status !== 'active') continue
    const off = Array.isArray(sub.offering) ? sub.offering[0] : sub.offering
    if (!off || (off as { pickup_market_id: string }).pickup_market_id !== marketId) continue
    if (p.is_extension) continue // vendor_skip_week rejects extension pickups (already makeups)

    const { error } = await service.rpc('vendor_skip_week', { p_pickup_id: p.id, p_reason: reason })
    if (error) {
      console.error('[cancel-date] vendor_skip_week failed for pickup', p.id, error.message)
      continue
    }
    credited++
  }
  return credited
}

export async function runCancelDateCascade(
  service: SupabaseClient,
  params: { marketId: string; overrideDate: string; reason: string },
): Promise<CancelDateCascadeResult> {
  const { marketId, overrideDate, reason } = params

  const refunds = await refundProductOrders(service, marketId, overrideDate, reason)
  const boothRenterUserIds = await findAffectedBoothRenters(service, marketId, overrideDate)
  const marketBoxCredited = await creditMarketBoxPickups(service, marketId, overrideDate, reason)

  return {
    refundedItemCount: refunds.refundedItemCount,
    refundFailures: refunds.refundFailures,
    buyerUserIds: [...refunds.buyerUserIds],
    boothRenterUserIds: [...boothRenterUserIds],
    marketBoxCredited,
  }
}
