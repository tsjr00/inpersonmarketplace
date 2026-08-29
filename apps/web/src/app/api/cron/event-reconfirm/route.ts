import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, TracedError, logError, observed } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications/service'
import { createRefund } from '@/lib/stripe/payments'
import { restoreInventory } from '@/lib/inventory'
import { hoursUntilEvent } from '@/lib/events/change-window'

/**
 * B3 — hourly re-confirmation sweep (owner spec 2026-08-08; mig 230).
 *
 * Runs HOURLY (vercel.json) — deliberately not on the daily expire-orders
 * cron: the refund deadline is the market's CUTOFF, and with a 24h cutoff a
 * daily sweep could refund a full day late, i.e. at event start — the exact
 * outcome the owner's spec forbids ("refunding at start means the vendor
 * already bought and prepped").
 *
 * Three phases over orders awaiting confirmation (stamped by
 * requestEventReconfirmation, unanswered, not refunded):
 *   1. +48h REMINDER — in-app only ('info' urgency; the spec's "email on the
 *      first and last only").
 *   2. FINAL ping when the refund deadline is ≤24h away — email + in-app.
 *   3. REFUND at the deadline (hoursUntil ≤ cutoff_hours): full Stripe refund
 *      (remaining balance — covers items, fees, tip, chip-in), items
 *      cancelled, inventory restored, wave slots freed, buyer notified.
 *
 * Idempotence: each phase stamps a column and the refund claims the order
 * with a guarded UPDATE first, so an overlapping run cannot double-send or
 * double-refund.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const REMINDER_AFTER_HOURS = 48
const FINAL_PING_RUNWAY_HOURS = 24

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cron/event-reconfirm', 'GET', async () => {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error('CRON_SECRET not configured')
      return NextResponse.json({ error: 'Not configured' }, { status: 500 })
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const now = new Date()
    let reminders = 0
    let finals = 0
    let refunds = 0
    let errors = 0

    // The working set — bounded by the partial index from mig 230.
    const { data: pending } = await observed(supabase
      .from('orders')
      .select('id, buyer_user_id, order_number, vertical_id, reconfirm_token, reconfirm_required_at, reconfirm_reminder_sent_at, reconfirm_final_sent_at, total_cents')
      .not('reconfirm_required_at', 'is', null)
      .is('reconfirmed_at', null)
      .is('reconfirm_refunded_at', null)
      .neq('status', 'cancelled')
      .limit(500), { table: 'orders' })

    if (!pending || pending.length === 0) {
      return NextResponse.json({ ok: true, reminders, finals, refunds, errors })
    }

    // Event facts per order, batched: order → market → catering request.
    const orderIds = pending.map(o => o.id as string)
    const { data: items } = await observed(supabase
      .from('order_items')
      .select('order_id, market_id')
      .in('order_id', orderIds), { table: 'order_items' })

    const marketByOrder = new Map<string, string>()
    for (const it of items || []) {
      if (!marketByOrder.has(it.order_id as string)) {
        marketByOrder.set(it.order_id as string, it.market_id as string)
      }
    }

    const marketIds = [...new Set([...marketByOrder.values()])]
    const { data: markets } = await observed(supabase
      .from('markets')
      .select('id, timezone, cutoff_hours, catering_request_id')
      .in('id', marketIds), { table: 'markets' })

    const crIds = (markets || []).map(m => m.catering_request_id as string).filter(Boolean)
    const { data: crs } = await observed(supabase
      .from('catering_requests')
      .select('id, event_date, event_start_time')
      .in('id', crIds), { table: 'catering_requests' })

    const crById = new Map((crs || []).map(c => [c.id as string, c]))
    const marketById = new Map((markets || []).map(m => [m.id as string, m]))

    // Succeeded payment per order, prefetched (expire-orders F6 pattern).
    const { data: payments } = await observed(supabase
      .from('payments')
      .select('order_id, stripe_payment_intent_id')
      .in('order_id', orderIds)
      .eq('status', 'succeeded'), { table: 'payments' })
    const paymentByOrder = new Map((payments || []).map(p => [p.order_id as string, p]))

    for (const order of pending) {
      const marketId = marketByOrder.get(order.id as string)
      const market = marketId ? marketById.get(marketId) : undefined
      const cr = market?.catering_request_id ? crById.get(market.catering_request_id as string) : undefined
      if (!market || !cr) continue

      const hoursUntil = hoursUntilEvent(
        cr.event_date as string | null,
        cr.event_start_time as string | null,
        (market.timezone as string | null) ?? null,
        now
      )
      if (hoursUntil === null) continue

      const cutoffHours = (market.cutoff_hours as number | null) ?? 24
      const vertical = order.vertical_id as string
      const notifBase = {
        orderNumber: (order.order_number as string) || (order.id as string).slice(0, 8),
        reconfirmToken: order.reconfirm_token as string,
        eventDate: (cr.event_date as string) || '',
        changeSummary: 'the details',
      }

      try {
        // ── Phase 3: refund at the deadline ──
        if (hoursUntil <= cutoffHours) {
          // Claim the order first — the guard makes a concurrent run a no-op.
          const { data: claimed } = await observed(supabase
            .from('orders')
            .update({ reconfirm_refunded_at: now.toISOString() })
            .eq('id', order.id)
            .is('reconfirm_refunded_at', null)
            .is('reconfirmed_at', null)
            .select('id'), { table: 'orders', operation: 'update' })
          if (!claimed || claimed.length === 0) continue

          // Full remaining refund — items, fees, tip, chip-in in one stroke
          // (event items are always ordered alone, so the whole order is this
          // event). Deterministic key dedups retries.
          const payment = paymentByOrder.get(order.id as string)
          if (payment?.stripe_payment_intent_id) {
            try {
              await createRefund(payment.stripe_payment_intent_id as string, `${order.id}-reconfirm`)
            } catch (refundErr) {
              errors++
              await logError(new TracedError('ERR_REFUND_001', `[event-reconfirm] Stripe refund failed for unconfirmed order: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
                route: '/api/cron/event-reconfirm', method: 'GET',
                orderId: order.id as string, amountCents: (order.total_cents as number) || 0,
              }))
              // Keep going: the order is claimed and cancelled either way;
              // the refund needs manual admin attention via error_logs.
            }
          }

          const { data: cancelledItems } = await observed(supabase
            .from('order_items')
            .update({
              status: 'cancelled',
              cancelled_at: now.toISOString(),
              cancelled_by: 'system',
              cancellation_reason: 'Order not re-confirmed after the event changed',
            })
            .eq('order_id', order.id)
            .is('cancelled_at', null)
            .select('listing_id, quantity'), { table: 'order_items', operation: 'update' })

          for (const ci of cancelledItems || []) {
            if (ci.listing_id) {
              await restoreInventory(supabase, ci.listing_id as string, (ci.quantity as number) || 1)
            }
          }

          await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)

          // Free the wave slot (T2-5 pattern — reject + event-cancel do the same).
          const { error: waveErr } = await supabase.rpc('free_wave_on_order_cancel', {
            p_order_id: order.id,
          })
          if (waveErr) console.error(`[event-reconfirm] free_wave error for order ${order.id}:`, waveErr.message)

          if (order.buyer_user_id) {
            await sendNotification(order.buyer_user_id as string, 'order_refunded', {
              orderNumber: notifBase.orderNumber,
              amountCents: (order.total_cents as number) || 0,
              dedupRef: `${order.id}-reconfirm-refund`,
            }, { vertical })
          }
          refunds++
          continue
        }

        // ── Phase 2: final ping, 24h before the deadline ──
        if (hoursUntil <= cutoffHours + FINAL_PING_RUNWAY_HOURS && !order.reconfirm_final_sent_at) {
          await supabase
            .from('orders')
            .update({ reconfirm_final_sent_at: now.toISOString() })
            .eq('id', order.id)
          if (order.buyer_user_id) {
            await sendNotification(order.buyer_user_id as string, 'order_reconfirm_request', {
              ...notifBase,
              isFinal: true,
              dedupRef: `${order.id}-reconfirm-final`,
            }, { vertical })
          }
          finals++
          continue
        }

        // ── Phase 1: +48h reminder ──
        const requiredAt = new Date(order.reconfirm_required_at as string)
        if (
          !order.reconfirm_reminder_sent_at &&
          now.getTime() - requiredAt.getTime() >= REMINDER_AFTER_HOURS * 3600 * 1000
        ) {
          await supabase
            .from('orders')
            .update({ reconfirm_reminder_sent_at: now.toISOString() })
            .eq('id', order.id)
          if (order.buyer_user_id) {
            await sendNotification(order.buyer_user_id as string, 'order_reconfirm_reminder', {
              ...notifBase,
              dedupRef: `${order.id}-reconfirm-reminder`,
            }, { vertical })
          }
          reminders++
        }
      } catch (err) {
        errors++
        await logError(new TracedError('ERR_DB_UNKNOWN', `[event-reconfirm] sweep failed for order ${order.id}: ${err instanceof Error ? err.message : String(err)}`, {
          route: '/api/cron/event-reconfirm', method: 'GET', orderId: order.id as string,
        }))
      }
    }

    return NextResponse.json({ ok: true, reminders, finals, refunds, errors })
  })
}
