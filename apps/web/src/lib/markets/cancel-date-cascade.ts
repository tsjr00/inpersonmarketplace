import type { SupabaseClient } from '@supabase/supabase-js'
import { createRefund } from '@/lib/stripe/payments'
import { stripe } from '@/lib/stripe/config'
import { restoreInventory } from '@/lib/inventory'
import { TracedError, logError } from '@/lib/errors'
import { FEES, proratedFlatFeeSimple, calculateSmallOrderFee, calculateBoothRentalFees } from '@/lib/pricing'

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
 *   D. Park spot bookings    -> G3/PRK-16 (user decision 2026-07-18): PAID
 *      bookings for the date are cancelled + credited to booth_credits
 *      ('park_date_cancel', mig 201 — parks have no season settlement, so the
 *      grant is at cancel time; credit auto-applies at the truck's next
 *      booking via redeem_booth_credit). Barred bookings: cancelled, NO
 *      credit (forfeit stands). pending_payment/occurrences: cancelled (NOT
 *      'expired' — an operator cancellation must never count as a strike),
 *      no credit (never paid).
 *
 * Returns the recipient user-ids + counts so the route can fan out notifications.
 */

export interface CancelDateCascadeResult {
  refundedItemCount: number
  refundFailures: number
  buyerUserIds: string[]
  orderVendorNotifs: VendorOrderNotif[]
  boothRenterUserIds: string[]
  marketBoxCredited: number
  parkBookingsCancelled: number
  parkCreditNotifs: ParkCreditNotif[]
}

/** One notification per credited truck (amounts summed across its bookings that date). */
export type ParkCreditNotif = { vendorUserId: string; amountCents: number }

/** Sunday (YYYY-MM-DD) of the week containing the given YYYY-MM-DD date. */
export function weekStartSunday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay()) // back up to Sunday (getUTCDay 0=Sun)
  return dt.toISOString().slice(0, 10)
}

type OrderEmbed = { id: string; buyer_user_id: string | null; order_number: string | null }
type OrderItemRow = {
  id: string
  order_id: string
  listing_id: string | null
  quantity: number | null
  subtotal_cents: number
  vendor_profile_id: string | null
  order: OrderEmbed | OrderEmbed[] | null
}

/** One notification per (vendor, order) so the vendor can reconcile by order #. */
export type VendorOrderNotif = { vendorUserId: string; orderNumber: string }

/** One notification per (buyer, order) — G2 bar cascade needs the order # per buyer. */
export type BuyerOrderNotif = { buyerUserId: string; orderId: string; orderNumber: string }

/** A. Refund buyer product orders for the cancelled date (no vendor penalty).
 *  G2 (2026-07-18): optional vendorProfileId scopes the cascade to ONE truck's
 *  orders — used when the park operator BARS a single paid booking; market-day
 *  cancels pass no vendor and hit every order for the date, as before. */
async function refundProductOrders(
  service: SupabaseClient,
  marketId: string,
  overrideDate: string,
  reason: string,
  vendorProfileId?: string,
): Promise<{ refundedItemCount: number; refundFailures: number; buyerUserIds: Set<string>; vendorNotifs: VendorOrderNotif[]; buyerOrderNotifs: BuyerOrderNotif[] }> {
  const buyerUserIds = new Set<string>()
  // key = `${vendorProfileId}|${orderId}` → dedup multiple items, same vendor+order.
  const vendorOrderKeys = new Map<string, { vendorProfileId: string; orderNumber: string }>()
  // key = `${buyerUserId}|${orderId}` → one buyer notification per order.
  const buyerOrderKeys = new Map<string, BuyerOrderNotif>()
  let refundedItemCount = 0
  let refundFailures = 0

  let itemsQuery = service
    .from('order_items')
    .select('id, order_id, listing_id, quantity, subtotal_cents, vendor_profile_id, order:orders!inner ( id, buyer_user_id, order_number )')
    .eq('market_id', marketId)
    .eq('pickup_date', overrideDate)
    .is('cancelled_at', null)
    // order_item_status enum = pending|confirmed|ready|fulfilled|cancelled|refunded.
    // Refund pre-fulfillment items only. ('paid' is an ORDER status, not an
    // item status — including it threw an invalid-enum error that silently
    // returned 0 items, so cancellations refunded nobody.)
    .in('status', ['pending', 'confirmed', 'ready'])
  if (vendorProfileId) {
    itemsQuery = itemsQuery.eq('vendor_profile_id', vendorProfileId)
  }
  const { data: items, error: itemsErr } = await itemsQuery
  // Never silently no-op a refund lookup — surface the failure instead of
  // treating an errored query as "no items to refund".
  if (itemsErr) throw itemsErr

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
    // cancelled_by must satisfy order_items_cancelled_by_check ('buyer' |
    // 'vendor' | 'system'). We use 'system' for a market-day cancellation —
    // so 'system' here is NOT only cron-expiry; it ALSO covers a manager
    // cancelling the market day. The cancellation_reason ("Market day cancelled
    // by manager") is what distinguishes the two in the data.
    const { data: updated, error: updErr } = await service
      .from('order_items')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: 'system',
        cancellation_reason: reason,
        refund_amount_cents: buyerPaidForItem,
      })
      .eq('id', item.id)
      .is('cancelled_at', null)
      .select('id')
    // A failed flip (constraint/validation/etc.) MUST surface — never let it
    // look like an "already cancelled" skip, which is how the 'market' →
    // cancelled_by_check 400 silently produced "0 refunded".
    if (updErr) throw updErr
    if (!updated || updated.length === 0) continue // genuinely already cancelled

    refundedItemCount++

    if (item.listing_id) {
      await restoreInventory(service, item.listing_id, item.quantity || 1)
    }

    // Refund (skip pay-at-pickup orders with no succeeded payment).
    const { data: payment, error: payErr } = await service
      .from('payments')
      .select('stripe_payment_intent_id')
      .eq('order_id', item.order_id)
      .eq('status', 'succeeded')
      .maybeSingle()

    if (payErr) {
      // Surface a lookup failure as a logged refund failure — never let it
      // silently skip a refund on an item we've already marked cancelled.
      refundFailures++
      await logError(new TracedError('ERR_REFUND_001',
        `Cancel-date payment lookup failed for order ${item.order_id}: ${payErr.message}`,
        { route: '/api/market-manager/[marketId]/cancel-date', method: 'POST', orderItemId: item.id, orderId: item.order_id }))
    } else if (payment?.stripe_payment_intent_id) {
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
    if (ord?.buyer_user_id) {
      buyerUserIds.add(ord.buyer_user_id)
      buyerOrderKeys.set(`${ord.buyer_user_id}|${item.order_id}`, {
        buyerUserId: ord.buyer_user_id,
        orderId: item.order_id,
        orderNumber: ord?.order_number ? String(ord.order_number) : '',
      })
    }
    // The vendor who would have fulfilled this order is notified too (their
    // order vanished through no fault of theirs — mirrors how buyer-cancel
    // notifies the vendor, WITH the order # so they can reconcile orders +
    // inventory). Reliability metric stays untouched. Deduped per vendor+order.
    if (item.vendor_profile_id) {
      vendorOrderKeys.set(`${item.vendor_profile_id}|${item.order_id}`, {
        vendorProfileId: item.vendor_profile_id,
        orderNumber: ord?.order_number ? String(ord.order_number) : '',
      })
    }
  }

  // Roll up any fully-cancelled orders + free event-wave slots.
  for (const oid of orderIds) {
    const { data: remaining } = await service
      .from('order_items')
      .select('id')
      .eq('order_id', oid)
      .is('cancelled_at', null)
    if (!remaining || remaining.length === 0) {
      const { data: ord } = await service
        .from('orders')
        .select('status, stripe_checkout_session_id, tip_amount, subtotal_cents, vertical_id')
        .eq('id', oid)
        .maybeSingle()

      // MGR-3b (VOR-19 class, site 7): a still-pending order has a live Stripe
      // session — expire it BEFORE cancelling so a stale checkout tab can't pay
      // a dead order. If expire throws, the session may already be complete
      // (payment landing in a race) — log and leave the order for the webhook/
      // success path to finalize (CHK-18 pattern, mirrors vendor-reject).
      let skipOrderCancel = false
      if (ord?.status === 'pending' && ord?.stripe_checkout_session_id) {
        try {
          await stripe.checkout.sessions.expire(ord.stripe_checkout_session_id as string)
        } catch (expireErr) {
          await logError(new TracedError('ERR_CHECKOUT_005',
            `Session expire failed cancelling last item of pending order ${oid} (session ${ord.stripe_checkout_session_id}): ${expireErr instanceof Error ? expireErr.message : String(expireErr)}`,
            { route: '/api/market-manager/[marketId]/cancel-date', method: 'POST' }))
          skipOrderCancel = true
        }
      }

      if (!skipOrderCancel) {
        // MGR-3: guarded flip — never clobber a refunded/completed order that a
        // racing webhook finalized between the per-item pass and this rollup.
        await service
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', oid)
          .in('status', ['pending', 'paid'])
      }

      // MGR-3a (VOR-16/VOR-5B decision, site 6 — user extended 2026-07-16): the
      // cascade killed the order's LAST live item, so also refund the order-level
      // tip + small-order fee. FULL port (unlike buyer-cancel's tip-only): this
      // file's per-item refunds cover subtotal + % fee + prorated FLAT fee only —
      // no small-order-fee share (contrast cancellation-fees.ts:72-73). Small fee
      // recomputed from the charge-time inputs; the deterministic `-order-fees`
      // key dedups cross-path races at Stripe.
      const orderTipCents = (ord?.tip_amount as number | null) || 0
      const orderSmallFeeCents = calculateSmallOrderFee((ord?.subtotal_cents as number) || 0, ord?.vertical_id as string | undefined)
      const orderFeeRefundCents = orderTipCents + orderSmallFeeCents
      if (orderFeeRefundCents > 0) {
        const { data: feePayment } = await service
          .from('payments')
          .select('stripe_payment_intent_id')
          .eq('order_id', oid)
          .eq('status', 'succeeded')
          .maybeSingle()
        if (feePayment?.stripe_payment_intent_id) {
          try {
            await createRefund(feePayment.stripe_payment_intent_id, `${oid}-order-fees`, orderFeeRefundCents)
          } catch (feeRefundErr) {
            await logError(new TracedError('ERR_REFUND_001',
              `Order-level tip/fee refund failed on market-day cancellation of order ${oid}: ${feeRefundErr instanceof Error ? feeRefundErr.message : String(feeRefundErr)}`,
              { route: '/api/market-manager/[marketId]/cancel-date', method: 'POST', orderId: oid, amountCents: orderFeeRefundCents }))
          }
        }
      }

      const { error: waveErr } = await service.rpc('free_wave_on_order_cancel', { p_order_id: oid })
      if (waveErr) console.error('[cancel-date] free_wave_on_order_cancel:', waveErr.message)
    }
  }

  // Resolve each affected vendor profile → user id; emit one notif per (vendor, order).
  const vendorNotifs: VendorOrderNotif[] = []
  const profileIds = [...new Set([...vendorOrderKeys.values()].map((v) => v.vendorProfileId))]
  if (profileIds.length > 0) {
    const { data: vps } = await service
      .from('vendor_profiles')
      .select('id, user_id')
      .in('id', profileIds)
    const userByProfile = new Map<string, string>()
    for (const vp of vps ?? []) {
      if (vp.user_id) userByProfile.set(vp.id as string, vp.user_id as string)
    }
    for (const { vendorProfileId, orderNumber } of vendorOrderKeys.values()) {
      const uid = userByProfile.get(vendorProfileId)
      if (uid) vendorNotifs.push({ vendorUserId: uid, orderNumber })
    }
  }

  return { refundedItemCount, refundFailures, buyerUserIds, vendorNotifs, buyerOrderNotifs: [...buyerOrderKeys.values()] }
}

/**
 * G2 (2026-07-18, user decision): when the park operator BARS a truck's paid
 * booking, cancel + refund that truck's buyer orders for that (market, date).
 * Full reuse of the market-day cascade machinery scoped to one vendor —
 * guarded per-item cancels, inventory restore, Stripe refunds w/ logError,
 * session-expire + guarded order flips + tip/small-fee rollup on fully-dead
 * orders, wave freeing. The caller sends the buyer notifications.
 */
export async function runBarredBookingOrderCascade(
  service: SupabaseClient,
  params: { marketId: string; bookingDate: string; vendorProfileId: string; reason: string },
): Promise<{ refundedItemCount: number; refundFailures: number; buyerOrderNotifs: BuyerOrderNotif[] }> {
  const { marketId, bookingDate, vendorProfileId, reason } = params
  const refunds = await refundProductOrders(service, marketId, bookingDate, reason, vendorProfileId)
  return {
    refundedItemCount: refunds.refundedItemCount,
    refundFailures: refunds.refundFailures,
    buyerOrderNotifs: refunds.buyerOrderNotifs,
  }
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

/**
 * D. G3/PRK-16 (user decision 2026-07-18): cancel the date's park spot
 * bookings; PAID + un-barred ones earn a booth-credit for another day.
 *
 * - Credit = what the truck would pay TODAY for that spot-day: the booking's
 *   snapshotted base price × the park's CURRENT operator_keep_pct fee split
 *   (calculateBoothRentalFees(...).vendorPaysCents). PRK-10-family drift
 *   caveat accepted — mirrors FM's settlement recompute.
 * - Idempotent: the mig-201 partial unique (one 'park_date_cancel' grant per
 *   booking, ever) turns a cascade re-run's insert into a 23505 no-op.
 * - Pre-migration-safe: an insert failing on the CHECK/unknown column (mig
 *   201 not applied) logs + skips the grant; the booking is still cancelled.
 * - Status goes to 'cancelled', NEVER 'expired' — the strike engine counts
 *   'expired' occurrences as missed prepay; an operator cancellation must
 *   not strike the truck.
 */
async function creditParkSpotBookings(
  service: SupabaseClient,
  marketId: string,
  overrideDate: string,
  reason: string,
): Promise<{ parkBookingsCancelled: number; parkCreditNotifs: ParkCreditNotif[] }> {
  const { data: bookings, error: bookingsErr } = await service
    .from('park_spot_bookings')
    .select('id, vendor_profile_id, price_cents, status, manager_barred_at')
    .eq('market_id', marketId)
    .eq('booking_date', overrideDate)
    .in('status', ['pending_payment', 'paid'])
  // Surface a lookup failure — never treat an errored query as "no bookings".
  if (bookingsErr) throw bookingsErr
  if (!bookings || bookings.length === 0) {
    return { parkBookingsCancelled: 0, parkCreditNotifs: [] }
  }

  const { data: market } = await service
    .from('markets')
    .select('operator_keep_pct')
    .eq('id', marketId)
    .maybeSingle()
  const keepPct = (market?.operator_keep_pct as number | null) ?? undefined

  let parkBookingsCancelled = 0
  const creditByVendor = new Map<string, number>()

  for (const b of bookings) {
    // Guarded flip — only the request that wins cancels (re-runs skip).
    const { data: flipped, error: flipErr } = await service
      .from('park_spot_bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', b.id)
      .in('status', ['pending_payment', 'paid'])
      .select('id')
    if (flipErr) {
      await logError(new TracedError('ERR_REFUND_001',
        `Park date-cancel: booking flip failed for ${b.id}: ${flipErr.message}`,
        { route: '/api/market-manager/[marketId]/cancel-date', method: 'POST', bookingId: b.id }))
      continue
    }
    if (!flipped || flipped.length === 0) continue // already cancelled (re-run)
    parkBookingsCancelled++

    // Credit only PAID, un-barred bookings (barred = forfeit stands;
    // pending_payment = never paid).
    if (b.status !== 'paid' || b.manager_barred_at) continue

    const creditCents = calculateBoothRentalFees(b.price_cents as number, keepPct).vendorPaysCents
    if (creditCents <= 0) continue

    const { error: grantErr } = await service.from('booth_credits').insert({
      vendor_profile_id: b.vendor_profile_id,
      market_id: marketId,
      amount_cents: creditCents,
      source: 'park_date_cancel',
      related_park_booking_id: b.id,
      note: `Park date ${overrideDate} cancelled by the operator — ${reason}`,
    })
    if (grantErr) {
      if (grantErr.code === '23505') continue // already granted (re-run) — the index doing its job
      // CHECK violation / unknown column = mig 201 not applied yet, or a real
      // failure — either way it must be visible: the truck is owed a credit.
      await logError(new TracedError('ERR_REFUND_001',
        `Park date-cancel credit grant failed for booking ${b.id} (${creditCents}¢ owed to vendor ${b.vendor_profile_id}): ${grantErr.message}`,
        { route: '/api/market-manager/[marketId]/cancel-date', method: 'POST', bookingId: b.id, amountCents: creditCents }))
      continue
    }
    creditByVendor.set(
      b.vendor_profile_id as string,
      (creditByVendor.get(b.vendor_profile_id as string) || 0) + creditCents
    )
  }

  // Resolve credited vendors → user ids for the route's notification fan-out.
  const parkCreditNotifs: ParkCreditNotif[] = []
  if (creditByVendor.size > 0) {
    const { data: vps } = await service
      .from('vendor_profiles')
      .select('id, user_id')
      .in('id', [...creditByVendor.keys()])
    for (const vp of vps ?? []) {
      const amount = creditByVendor.get(vp.id as string)
      if (vp.user_id && amount) {
        parkCreditNotifs.push({ vendorUserId: vp.user_id as string, amountCents: amount })
      }
    }
  }

  return { parkBookingsCancelled, parkCreditNotifs }
}

export async function runCancelDateCascade(
  service: SupabaseClient,
  params: { marketId: string; overrideDate: string; reason: string },
): Promise<CancelDateCascadeResult> {
  const { marketId, overrideDate, reason } = params

  const refunds = await refundProductOrders(service, marketId, overrideDate, reason)
  const boothRenterUserIds = await findAffectedBoothRenters(service, marketId, overrideDate)
  const marketBoxCredited = await creditMarketBoxPickups(service, marketId, overrideDate, reason)
  const parks = await creditParkSpotBookings(service, marketId, overrideDate, reason)

  return {
    refundedItemCount: refunds.refundedItemCount,
    refundFailures: refunds.refundFailures,
    buyerUserIds: [...refunds.buyerUserIds],
    orderVendorNotifs: refunds.vendorNotifs,
    boothRenterUserIds: [...boothRenterUserIds],
    marketBoxCredited,
    parkBookingsCancelled: parks.parkBookingsCancelled,
    parkCreditNotifs: parks.parkCreditNotifs,
  }
}
