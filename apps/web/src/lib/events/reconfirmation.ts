import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { sendNotification } from '@/lib/notifications/service'
import { observed } from '@/lib/errors'

/**
 * B3 — attendee re-confirmation after a consequential event change (owner spec
 * 2026-08-08; implementation approved 2026-08-15; mig 230).
 *
 * Called from BOTH consequential-change sites (organizer details PATCH, admin
 * [id] PATCH) right after their accepted-vendor notifications: stamps every
 * live order at the event market as awaiting confirmation and sends the FIRST
 * ping (email + in-app — the spec's "email on the first and last only"; the
 * +48h reminder is in-app only and lives in /api/cron/event-reconfirm).
 *
 * Per combined ORDER, not per item (owner: they are confirming "I am still
 * coming", not re-picking food) — safe because event items are always ordered
 * alone (the multi-market cart rule), so an order touching an event market
 * belongs to that market entirely.
 *
 * Re-asking: a NEW consequential change clears reconfirmed_at and the ping
 * stamps but KEEPS the token, so links in older emails still land on the
 * current question.
 */
export async function requestEventReconfirmation(
  serviceClient: SupabaseClient,
  opts: {
    marketId: string
    changeSummary: string
    eventDate: string
    vertical: string
  }
): Promise<number> {
  // Same live-item filter as the consequence gate that decided this change
  // needs re-confirmation (details route) — the two must agree on who counts.
  const { data: items } = await observed(serviceClient
    .from('order_items')
    .select('order_id')
    .eq('market_id', opts.marketId)
    .not('status', 'in', '("cancelled","refunded")'), { table: 'order_items' })

  const orderIds = [...new Set((items || []).map(i => i.order_id as string))]
  if (orderIds.length === 0) return 0

  const { data: orders } = await observed(serviceClient
    .from('orders')
    .select('id, buyer_user_id, order_number, reconfirm_token')
    .in('id', orderIds)
    .neq('status', 'cancelled'), { table: 'orders' })

  let stamped = 0
  for (const order of orders || []) {
    const token = (order.reconfirm_token as string | null) || randomUUID()
    const { error } = await serviceClient
      .from('orders')
      .update({
        reconfirm_required_at: new Date().toISOString(),
        reconfirm_token: token,
        reconfirmed_at: null,
        reconfirm_reminder_sent_at: null,
        reconfirm_final_sent_at: null,
      })
      .eq('id', order.id)
    if (error) continue
    stamped++

    if (order.buyer_user_id) {
      await sendNotification(order.buyer_user_id as string, 'order_reconfirm_request', {
        orderNumber: (order.order_number as string) || (order.id as string).slice(0, 8),
        changeSummary: opts.changeSummary,
        eventDate: opts.eventDate,
        reconfirmToken: token,
        dedupRef: `${order.id}-reconfirm-first`,
      }, { vertical: opts.vertical })
    }
  }

  return stamped
}
