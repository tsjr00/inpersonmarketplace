import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, logError, TracedError } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications/service'
import { FEES, proratedFlatFeeSimple } from '@/lib/pricing'
import { createRefund } from '@/lib/stripe/payments'
import { stripe } from '@/lib/stripe/config'
import { restoreInventory } from '@/lib/inventory'

/**
 * POST /api/vendor/events/[marketId]/cancel
 *
 * Vendor cancels their accepted event commitment.
 * Triggers:
 * 1. Update market_vendors response_status to 'cancelled'
 * 2. Remove event_vendor_listings for this vendor
 * 3. Notify admin
 * 4. Notify event organizer (email)
 * 5. If backup vendor exists, auto-escalate (notify backup, give 24hr to confirm)
 * 6. If cancellation is <72hr before event, flag for vendor score impact
 *
 * Body: { reason: string (required) }
 */

interface RouteContext {
  params: Promise<{ marketId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/events/[marketId]/cancel', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-event-cancel:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { marketId } = await context.params
    const body = await request.json()
    const { reason } = body

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'Please provide a reason for cancellation (at least 10 characters)' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    // Look up the market's vertical to scope the vendor profile query
    const { data: marketInfo } = await serviceClient
      .from('markets')
      .select('vertical_id')
      .eq('id', marketId)
      .single()

    if (!marketInfo) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Get vendor profile for this user IN this vertical
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, profile_data')
      .eq('user_id', user.id)
      .eq('vertical_id', marketInfo.vertical_id)
      .single()

    if (!vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found for this vertical' }, { status: 404 })
    }

    // Verify vendor has accepted this event
    const { data: marketVendor } = await serviceClient
      .from('market_vendors')
      .select('id, response_status')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (!marketVendor || marketVendor.response_status !== 'accepted') {
      return NextResponse.json(
        { error: 'You do not have an active commitment to this event' },
        { status: 400 }
      )
    }

    // Get event details for notifications + penalty check
    const { data: market } = await serviceClient
      .from('markets')
      .select('name, event_start_date, catering_request_id, vertical_id')
      .eq('id', marketId)
      .single()

    if (!market) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Check if cancellation is within 72hr penalty window
    const eventDate = market.event_start_date
      ? new Date(market.event_start_date + 'T00:00:00')
      : null
    const hoursUntilEvent = eventDate
      ? (eventDate.getTime() - Date.now()) / (1000 * 60 * 60)
      : Infinity
    const isLateCancellation = hoursUntilEvent < 72 && hoursUntilEvent > 0

    // 1. Update vendor status to cancelled
    await serviceClient
      .from('market_vendors')
      .update({
        response_status: 'cancelled',
        response_notes: `CANCELLED: ${reason.trim()}${isLateCancellation ? ' [LATE - within 72hr window]' : ''}`,
      })
      .eq('id', marketVendor.id)

    // 2. Remove event_vendor_listings for this vendor
    // First get the listing IDs so we can clean up listing_markets too
    const { data: vendorEventListings } = await serviceClient
      .from('event_vendor_listings')
      .select('listing_id')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)

    await serviceClient
      .from('event_vendor_listings')
      .delete()
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)

    // Also remove the listing_markets rows created for this event
    if (vendorEventListings && vendorEventListings.length > 0) {
      const cancelledListingIds = vendorEventListings.map(el => el.listing_id as string)
      await serviceClient
        .from('listing_markets')
        .delete()
        .eq('market_id', marketId)
        .in('listing_id', cancelledListingIds)
    }

    const profileData = vendorProfile.profile_data as Record<string, unknown>
    const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'A vendor'

    // 2b. EVT-5 FIX: cancel + refund this vendor's outstanding pre-orders.
    // Previously a withdrawing vendor's items stayed confirmed/ready — buyers
    // were never refunded or told, wave slots stayed consumed, and the cron's
    // no-show phase could later AUTO-PAY the withdrawn vendor for items they
    // never fulfilled (the paid-gate passes: the buyer really did pay).
    // Per-item refund math mirrors the reject route (subtotal + buyer % fee +
    // prorated flat fee); company-paid orders have no succeeded payment row,
    // so the refund step naturally skips them.
    const { data: vendorItems } = await serviceClient
      .from('order_items')
      .select(`
        id, order_id, quantity, subtotal_cents, listing_id,
        order:orders!inner(id, order_number, buyer_user_id, vertical_id, status, stripe_checkout_session_id),
        listing:listings(title)
      `)
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .in('status', ['pending', 'confirmed', 'ready'])
      .is('cancelled_at', null)

    let ordersCancelled = 0
    if (vendorItems && vendorItems.length > 0) {
      const affectedOrderIds = [...new Set(vendorItems.map(i => i.order_id as string))]
      const { data: allOrderItems } = await serviceClient
        .from('order_items')
        .select('order_id')
        .in('order_id', affectedOrderIds)
      const itemCounts = new Map<string, number>()
      for (const oi of allOrderItems || []) {
        itemCounts.set(oi.order_id as string, (itemCounts.get(oi.order_id as string) || 0) + 1)
      }
      const { data: succeededPayments } = await serviceClient
        .from('payments')
        .select('order_id, stripe_payment_intent_id')
        .in('order_id', affectedOrderIds)
        .eq('status', 'succeeded')
      const paymentByOrder = new Map(
        (succeededPayments || []).map(p => [p.order_id as string, p.stripe_payment_intent_id as string | null])
      )

      for (const item of vendorItems) {
        const itemOrder = (item as unknown as { order: { id: string; order_number?: string; buyer_user_id?: string; vertical_id?: string } }).order
        const totalItems = itemCounts.get(item.order_id as string) || 1
        const buyerPercentFee = Math.round((item.subtotal_cents as number) * (FEES.buyerFeePercent / 100))
        const itemFlatFee = proratedFlatFeeSimple(FEES.buyerFlatFeeCents, totalItems)
        const buyerPaidForItem = (item.subtotal_cents as number) + buyerPercentFee + itemFlatFee

        // Guarded cancel (H3 pattern) — a concurrent cancel path wins, skip
        const { data: cancelledRows } = await serviceClient
          .from('order_items')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by: 'vendor',
            cancellation_reason: 'Vendor withdrew from this event',
            refund_amount_cents: buyerPaidForItem,
          })
          .eq('id', item.id)
          .is('cancelled_at', null)
          .select('id')
        if (!cancelledRows || cancelledRows.length === 0) continue

        if (item.listing_id) {
          await restoreInventory(serviceClient, item.listing_id as string, (item.quantity as number) || 1)
        }

        const paymentIntentId = paymentByOrder.get(item.order_id as string)
        if (paymentIntentId) {
          try {
            await createRefund(paymentIntentId, item.id as string, buyerPaidForItem)
            await serviceClient
              .from('order_items')
              .update({ status: 'refunded' })
              .eq('id', item.id)
              .eq('status', 'cancelled')
          } catch (refundErr) {
            await logError(new TracedError('ERR_REFUND_001', `[vendor-event-cancel] Refund failed for item ${item.id}: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
              route: '/api/vendor/events/[marketId]/cancel', method: 'POST',
              orderItemId: item.id as string, amountCents: buyerPaidForItem,
            }))
          }
        }

        if (itemOrder?.buyer_user_id) {
          const itemTitle = (item as unknown as { listing?: { title?: string } }).listing?.title
          await sendNotification(itemOrder.buyer_user_id, 'order_cancelled_by_vendor', {
            vendorName,
            reason: 'The vendor has withdrawn from this event. Your payment for this item is being refunded.',
            ...(itemOrder.order_number ? { orderNumber: itemOrder.order_number } : {}),
            ...(itemTitle ? { itemTitle } : {}),
          }, itemOrder.vertical_id ? { vertical: itemOrder.vertical_id } : {})
        }
      }

      // Order-level cleanup: orders left with no live items get closed (with
      // the VOR-19 session-expire for still-pending orders) + wave slot freed
      for (const affectedOrderId of affectedOrderIds) {
        const { data: liveItems } = await serviceClient
          .from('order_items')
          .select('id')
          .eq('order_id', affectedOrderId)
          .is('cancelled_at', null)
        if (liveItems && liveItems.length > 0) continue

        const orderMeta = (vendorItems.find(i => i.order_id === affectedOrderId) as unknown as {
          order: { status?: string; stripe_checkout_session_id?: string | null }
        } | undefined)?.order
        let skipOrderCancel = false
        if (orderMeta?.status === 'pending' && orderMeta?.stripe_checkout_session_id) {
          try {
            await stripe.checkout.sessions.expire(orderMeta.stripe_checkout_session_id)
          } catch (expireErr) {
            await logError(new TracedError('ERR_CHECKOUT_005', `[vendor-event-cancel] Session expire failed for order ${affectedOrderId}: ${expireErr instanceof Error ? expireErr.message : String(expireErr)}`, {
              route: '/api/vendor/events/[marketId]/cancel', method: 'POST',
            }))
            skipOrderCancel = true // possibly race-paid — webhook finalizes
          }
        }
        if (!skipOrderCancel) {
          await serviceClient
            .from('orders')
            .update({ status: 'cancelled' })
            .eq('id', affectedOrderId)
            .not('status', 'in', '("cancelled","refunded","completed")')
          const { error: waveErr } = await serviceClient.rpc('free_wave_on_order_cancel', {
            p_order_id: affectedOrderId,
          })
          if (waveErr) console.error(`[vendor-event-cancel] free_wave error for order ${affectedOrderId}:`, waveErr.message)
          ordersCancelled++
        }
      }
    }

    // 2c. EVT-9 FIX: this vendor's capacity just left the event — shrink wave
    // capacity (and re-close over-committed waves) if this event uses waves.
    // recalculate_wave_capacity RAISEs if a counted vendor lacks a declared
    // per-wave cap (mig 130 no-silent-fallback rule) — log + continue.
    const { data: hasWaves } = await serviceClient
      .from('event_waves')
      .select('id')
      .eq('market_id', marketId)
      .limit(1)
    if (hasWaves && hasWaves.length > 0) {
      const { error: recalcErr } = await serviceClient.rpc('recalculate_wave_capacity', {
        p_market_id: marketId,
      })
      if (recalcErr) {
        await logError(new TracedError('ERR_DB_UNKNOWN', `[vendor-event-cancel] recalculate_wave_capacity failed for market ${marketId}: ${recalcErr.message}`, {
          route: '/api/vendor/events/[marketId]/cancel', method: 'POST',
        }))
      }
    }

    // 3. Notify admin
    const { data: admins } = await serviceClient
      .from('user_profiles')
      .select('user_id')
      .in('role', ['admin', 'platform_admin'])
      .is('deleted_at', null)
      .limit(5)

    if (admins) {
      for (const admin of admins) {
        await sendNotification(admin.user_id, 'catering_vendor_responded', {
          companyName: vendorName,
          responseAction: `cancelled${isLateCancellation ? ' (LATE)' : ''}`,
          eventDate: market.event_start_date || market.name,
        }, { vertical: market.vertical_id })
      }
    }

    // 4. Notify event organizer
    if (market.catering_request_id) {
      const { data: cReq } = await serviceClient
        .from('catering_requests')
        .select('id, contact_name, contact_email, vertical_id, organizer_user_id')
        .eq('id', market.catering_request_id)
        .single()

      if (cReq?.contact_email) {
        // Send email to organizer about cancellation
        try {
          const isFM = cReq.vertical_id === 'farmers_market'
          const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
          const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
          const accentColor = isFM ? '#2d5016' : '#ff5757'

          const { Resend } = await import('resend')
          const resend = new Resend(process.env.RESEND_API_KEY)

          await resend.emails.send({
            from: `${senderName} <updates@${senderDomain}>`,
            to: cReq.contact_email,
            subject: `Event Update: ${vendorName} has cancelled`,
            html: `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:${accentColor};margin:0 0 8px">Event Update</h2>
                <p style="color:#374151;margin:0 0 16px">Hi ${cReq.contact_name || 'there'},</p>
                <p style="color:#4b5563;line-height:1.6;margin:0 0 16px">
                  <strong>${vendorName}</strong> has cancelled their commitment to your event on <strong>${market.event_start_date}</strong>.
                </p>
                <p style="color:#4b5563;line-height:1.6;margin:0 0 16px">
                  Reason: "${reason.trim()}"
                </p>
                <p style="color:#4b5563;line-height:1.6;margin:0 0 20px">
                  We're checking for available backup vendors and will notify you if a replacement is found.
                </p>
                <p style="color:#6b7280;font-size:13px;margin:0;border-top:1px solid #e5e7eb;padding-top:16px">
                  Questions? Reply to this email.
                </p>
              </div>
            `,
          })
        } catch (emailErr) {
          console.error('[vendor-event-cancel] Failed to send organizer email:', emailErr)
        }
      }

      // Also send in-app notification if organizer has an account
      if (cReq?.organizer_user_id) {
        // M2 (closed 2026-08-13): this used to borrow the admin ACCEPT/DECLINE
        // template, which produced "X cancelled their commitment to the event
        // invitation for Y" — and before the T-08 key fix, "undefined …
        // undefined". event_vendor_responded_organizer now carries a
        // 'cancelled' branch: organizer-appropriate copy, the vendor's reason
        // attributed, and a link to THEIR event dashboard instead of the admin
        // panel.
        await sendNotification(cReq.organizer_user_id, 'event_vendor_responded_organizer', {
          vendorName,
          responseAction: 'cancelled',
          marketName: market.name,
          ...(reason?.trim() ? { responseNotes: reason.trim() } : {}),
          eventId: cReq.id as string,
        }, { vertical: cReq.vertical_id })
      }
    }

    // 5. Auto-escalate to backup vendor (if one exists)
    const { data: backups } = await serviceClient
      .from('market_vendors')
      .select('vendor_profile_id, backup_priority, vendor_profiles:vendor_profile_id(user_id)')
      .eq('market_id', marketId)
      .eq('is_backup', true)
      .order('backup_priority', { ascending: true, nullsFirst: false })
      .limit(1)

    if (backups && backups.length > 0) {
      const backup = backups[0]
      const backupVp = backup.vendor_profiles as unknown as { user_id: string } | null

      // Update backup: remove backup flag, set as invited (they need to re-confirm)
      await serviceClient
        .from('market_vendors')
        .update({
          is_backup: false,
          response_status: 'invited',
          response_notes: `Auto-escalated: replacing ${vendorName} who cancelled`,
          replaced_vendor_id: vendorProfile.id,
        })
        .eq('market_id', marketId)
        .eq('vendor_profile_id', backup.vendor_profile_id)

      // Notify backup vendor
      if (backupVp?.user_id) {
        await sendNotification(backupVp.user_id, 'catering_vendor_invited', {
          companyName: 'Event Opportunity — Backup Activated',
          headcount: 0,
          eventDate: market.event_start_date,
          eventAddress: '',
          vertical: market.vertical_id,
          marketId: marketId,
        }, { vertical: market.vertical_id })
      }
    }

    // 6. Late cancellation tracking — persist to vendor_quality_findings
    if (isLateCancellation) {
      console.warn(`[LATE_CANCEL] Vendor ${vendorProfile.id} (${vendorName}) cancelled event ${marketId} within 72hr window. Hours until event: ${Math.round(hoursUntilEvent)}`)
      const { error: findingErr } = await serviceClient.from('vendor_quality_findings').insert({
        vendor_profile_id: vendorProfile.id,
        finding_type: 'late_event_cancellation',
        severity: 'high',
        description: `Cancelled event within 72hr window. Hours until event: ${Math.round(hoursUntilEvent)}. Reason: ${reason.trim().slice(0, 200)}`,
        market_id: marketId,
      })
      if (findingErr) console.error('[late-cancel] Failed to persist finding:', findingErr)
    }

    return NextResponse.json({
      ok: true,
      message: 'Event commitment cancelled.',
      late_cancellation: isLateCancellation,
      backup_escalated: backups && backups.length > 0,
      buyer_items_cancelled: vendorItems?.length || 0,
      orders_closed: ordersCancelled,
    })
  })
}
