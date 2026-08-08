import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, logError, TracedError } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications/service'
import { stripe } from '@/lib/stripe/config'
import { createRefund } from '@/lib/stripe/payments'
import { eventRefColumn } from '@/lib/events/event-ref'

/**
 * POST /api/events/[token]/cancel
 *
 * Organizer cancels their own event. Authenticated via organizer_user_id
 * on catering_requests (not admin role).
 *
 * Cleanup: status → cancelled, listing_markets deleted, admin + vendors notified.
 *
 * ⚠ The [token] segment accepts EITHER an event_token OR a catering_requests.id
 * (see lib/events/event-ref.ts). Cancel was unreachable for a pre-approval event
 * — no token, no route — which is half of why an addressless event could not be
 * escaped. Auth below is organizer-based and unchanged; the token was never the
 * credential here.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/cancel', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-cancel:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    // Auth required
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Sign in to manage your event' }, { status: 401 })
    }

    const { token } = await params
    const serviceClient = createServiceClient()

    // Fetch event and verify organizer ownership
    const { data: event, error: fetchError } = await serviceClient
      .from('catering_requests')
      .select('id, market_id, organizer_user_id, contact_email, company_name, vertical_id, status, event_date')
      .eq(eventRefColumn(token), token)
      .maybeSingle()

    if (fetchError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Verify the authenticated user is the organizer
    if (event.organizer_user_id !== user.id) {
      // Fallback: check if user's email matches contact_email (for events created before organizer_user_id was set)
      const userEmail = user.email?.toLowerCase()
      const contactEmail = event.contact_email?.toLowerCase()
      if (!userEmail || !contactEmail || userEmail !== contactEmail) {
        return NextResponse.json({ error: 'Only the event organizer can cancel this event' }, { status: 403 })
      }
    }

    // Don't allow cancelling already-terminal statuses
    if (['completed', 'cancelled', 'declined'].includes(event.status)) {
      return NextResponse.json(
        { error: `Event is already ${event.status} and cannot be cancelled` },
        { status: 400 }
      )
    }

    // Update status to cancelled
    const { error: updateError } = await serviceClient
      .from('catering_requests')
      .update({ status: 'cancelled' })
      .eq('id', event.id)

    if (updateError) {
      console.error('[event-cancel] Status update failed:', updateError)
      return NextResponse.json({ error: 'Failed to cancel event' }, { status: 500 })
    }

    // Clean up listing_markets rows (same as admin cancel)
    if (event.market_id) {
      const { data: eventListings } = await serviceClient
        .from('event_vendor_listings')
        .select('listing_id')
        .eq('market_id', event.market_id)

      if (eventListings && eventListings.length > 0) {
        const listingIds = eventListings.map(el => el.listing_id as string)
        await serviceClient
          .from('listing_markets')
          .delete()
          .eq('market_id', event.market_id)
          .in('listing_id', listingIds)
      }

      // Deactivate the market
      await serviceClient
        .from('markets')
        .update({ active: false })
        .eq('id', event.market_id)

      // Notify accepted vendors.
      // EVT-10 FIX: sendNotification's first arg is a USER id — this fan-out
      // passed vendor_profile_id, so no vendor ever received the cancellation
      // notice (the send fails silently by design). Resolve user_id via the
      // vendor_profiles join (broadcast route pattern).
      const { data: acceptedVendors } = await serviceClient
        .from('market_vendors')
        .select('vendor_profile_id, vendor_profiles!inner(user_id)')
        .eq('market_id', event.market_id)
        .eq('response_status', 'accepted')

      if (acceptedVendors && acceptedVendors.length > 0) {
        const vendorNotifications = acceptedVendors.flatMap(v => {
          const vp = v.vendor_profiles as unknown as { user_id?: string } | { user_id?: string }[] | null
          const vendorUserId = (Array.isArray(vp) ? vp[0]?.user_id : vp?.user_id) as string | undefined
          if (!vendorUserId) return []
          return [sendNotification(vendorUserId, 'event_cancelled_vendor', {
            companyName: event.company_name,
            eventDate: event.event_date,
          }, { vertical: event.vertical_id }).catch(err =>
            console.error(`[event-cancel] Vendor notification failed for ${v.vendor_profile_id}:`, err)
          )]
        })
        await Promise.all(vendorNotifications)
      }

      // Notify buyers who have orders at this event.
      // Resolve order IDs via order_items.market_id (orders.market_id does not
      // exist; the link from event/market to orders is per-item). Earlier
      // attempts queried .from('orders').eq('market_id', ...) which silently
      // returned null, causing the entire cancel flow to no-op.
      const { data: orderItemRows } = await serviceClient
        .from('order_items')
        .select('order_id, status')
        .eq('market_id', event.market_id)

      const orderIds = [...new Set((orderItemRows || []).map(r => r.order_id as string))]

      const { data: buyerOrders } = orderIds.length > 0
        ? await serviceClient
            .from('orders')
            .select('buyer_user_id, order_number, id, status, stripe_checkout_session_id, payment_method')
            .in('id', orderIds)
            .not('status', 'in', '("cancelled","refunded","completed")')
        : { data: [] }

      if (buyerOrders && buyerOrders.length > 0) {
        const uniqueBuyerIds = [...new Set(buyerOrders.map(o => o.buyer_user_id as string))]
        const buyerNotifications = uniqueBuyerIds.map(buyerId => {
          const buyerOrder = buyerOrders.find(o => o.buyer_user_id === buyerId)
          return sendNotification(buyerId, 'order_cancelled_by_vendor', {
            vendorName: event.company_name,
            companyName: event.company_name,
            eventDate: event.event_date,
            reason: 'The event has been cancelled by the organizer. If you paid via card, a refund will be processed.',
            orderNumber: buyerOrder?.order_number as string,
            orderId: buyerOrder?.id as string,
          }, { vertical: event.vertical_id }).catch(err =>
            console.error(`[event-cancel] Buyer notification failed for ${buyerId}:`, err)
          )
        })
        await Promise.all(buyerNotifications)

        // EVT-4 FIX: the buyer notification above PROMISES a refund, but this
        // flow previously cancelled orders without refunding, without expiring
        // pending sessions, and without cancelling order_items (leaving paid
        // items eligible for the cron's no-show vendor payout). Now, per order:
        // pending+session → expire first (skip the order if expire throws — it
        // may be race-paid; the webhook finalizes it); Stripe-paid → refund the
        // REMAINING refundable balance (earlier per-item refunds are already
        // netted out by Stripe); orders with fulfilled items skip auto-refund
        // and log for manual review instead (a full refund would claw back
        // money for goods already handed over).
        const fulfilledOrderIds = new Set(
          (orderItemRows || []).filter(r => r.status === 'fulfilled').map(r => r.order_id as string)
        )
        const { data: eventPayments } = await serviceClient
          .from('payments')
          .select('order_id, stripe_payment_intent_id')
          .in('order_id', buyerOrders.map(o => o.id as string))
          .eq('status', 'succeeded')
        const paymentByOrder = new Map(
          (eventPayments || []).map(p => [p.order_id as string, p.stripe_payment_intent_id as string | null])
        )

        const cancellableOrderIds: string[] = []
        for (const order of buyerOrders) {
          if (order.status === 'pending' && order.stripe_checkout_session_id) {
            try {
              await stripe.checkout.sessions.expire(order.stripe_checkout_session_id as string)
            } catch (expireErr) {
              await logError(new TracedError('ERR_CHECKOUT_005', `[event-cancel] Session expire failed for order ${order.id} (session ${order.stripe_checkout_session_id}): ${expireErr instanceof Error ? expireErr.message : String(expireErr)}`, {
                route: '/api/events/[token]/cancel', method: 'POST',
              }))
              continue // possibly race-paid — leave this order for the webhook
            }
          }
          cancellableOrderIds.push(order.id as string)

          const paymentIntentId = paymentByOrder.get(order.id as string)
          if (paymentIntentId) {
            if (fulfilledOrderIds.has(order.id as string)) {
              await logError(new TracedError('ERR_REFUND_001', `[event-cancel] Order ${order.id} has fulfilled items — auto-refund skipped, needs manual review`, {
                route: '/api/events/[token]/cancel', method: 'POST', orderId: order.id,
              }))
            } else {
              try {
                await createRefund(paymentIntentId, `${order.id}-event-cancel`)
              } catch (refundErr) {
                await logError(new TracedError('ERR_REFUND_001', `[event-cancel] Refund failed for order ${order.id}: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
                  route: '/api/events/[token]/cancel', method: 'POST', orderId: order.id,
                }))
              }
            }
          }
        }

        if (cancellableOrderIds.length > 0) {
          // Cancel the items (guarded) so cron Phases 4/7 can never treat a
          // cancelled event's items as payable no-shows
          await serviceClient
            .from('order_items')
            .update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancelled_by: 'system',
              cancellation_reason: 'Event cancelled by organizer',
            })
            .in('order_id', cancellableOrderIds)
            .is('cancelled_at', null)
            .in('status', ['pending', 'confirmed', 'ready'])

          // Mark buyer orders as cancelled (preserve completed/refunded/already-cancelled)
          await serviceClient
            .from('orders')
            .update({ status: 'cancelled' })
            .in('id', cancellableOrderIds)
            .not('status', 'in', '("cancelled","refunded","completed")')

          // T2-5: Free wave slots for all cancelled event orders
          for (const cancelledOrderId of cancellableOrderIds) {
            const { error: waveErr } = await serviceClient.rpc('free_wave_on_order_cancel', {
              p_order_id: cancelledOrderId,
            })
            if (waveErr) console.error(`[event-cancel] free_wave error for order ${cancelledOrderId}:`, waveErr.message)
          }
        }
      }
    }

    // Notify admin via email
    try {
      const apiKey = process.env.RESEND_API_KEY
      if (apiKey) {
        const { Resend } = await import('resend')
        const resend = new Resend(apiKey)
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@815enterprises.com'
        const isFM = event.vertical_id === 'farmers_market'
        const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
        const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'

        await resend.emails.send({
          from: `${senderName} <updates@${senderDomain}>`,
          to: adminEmail,
          subject: `[Event Cancelled] ${event.company_name}`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
              <h2 style="color:#dc2626;margin:0 0 16px">Event Cancelled by Organizer</h2>
              <p><strong>${event.company_name}</strong> has been cancelled by the event organizer.</p>
              <p>Contact: ${event.contact_email}</p>
              <p style="color:#737373;font-size:13px">Listing-market links have been cleaned up. Accepted vendors have been notified.</p>
            </div>
          `,
        })
      }
    } catch (err) {
      console.error('[event-cancel] Admin email failed:', err)
    }

    return NextResponse.json({ ok: true })
  })
}
