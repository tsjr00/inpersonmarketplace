import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, logError, TracedError, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications/service'
import { FEES, proratedFlatFeeSimple } from '@/lib/pricing'
import { createRefund } from '@/lib/stripe/payments'
import { refundEventFeePayment } from '@/lib/stripe/event-fee-payments'
import { decideFeeOutcome, waivableUntil } from '@/lib/events/fee-cancellation'
import { liftEventBlackouts } from '@/lib/events/blackouts'
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
    const { data: marketInfo } = await observed(serviceClient
      .from('markets')
      .select('vertical_id')
      .eq('id', marketId)
      .single(), { table: 'markets' })

    if (!marketInfo) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Get vendor profile for this user IN this vertical
    const { data: vendorProfile } = await observed(supabase
      .from('vendor_profiles')
      .select('id, profile_data')
      .eq('user_id', user.id)
      .eq('vertical_id', marketInfo.vertical_id)
      .single(), { table: 'vendor_profiles' })

    if (!vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found for this vertical' }, { status: 404 })
    }

    // Verify vendor has accepted this event
    const { data: marketVendor } = await observed(serviceClient
      .from('market_vendors')
      .select('id, response_status')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single(), { table: 'market_vendors' })

    if (!marketVendor || marketVendor.response_status !== 'accepted') {
      return NextResponse.json(
        { error: 'You do not have an active commitment to this event' },
        { status: 400 }
      )
    }

    // Get event details for notifications + penalty check
    const { data: market } = await observed(serviceClient
      .from('markets')
      .select('name, event_start_date, catering_request_id, vertical_id, headcount, city, state')
      .eq('id', marketId)
      .single(), { table: 'markets' })

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

    // 1. Update vendor status to cancelled.
    // MUST fail loudly (owner-approved fix 2026-08-16): before mig 233 widened
    // the response_status CHECK, this write violated the constraint and failed
    // SILENTLY — the vendor stayed 'accepted' while listings were deleted,
    // buyers refunded, and a backup promoted (half-cancellation). Aborting here
    // stops the cascade before any side effect.
    const { error: statusErr } = await serviceClient
      .from('market_vendors')
      .update({
        response_status: 'cancelled',
        response_notes: `CANCELLED: ${reason.trim()}${isLateCancellation ? ' [LATE - within 72hr window]' : ''}`,
      })
      .eq('id', marketVendor.id)

    if (statusErr) {
      await logError(new TracedError('ERR_DB_UNKNOWN', `[vendor-event-cancel] Status update failed for market_vendors ${marketVendor.id}: ${statusErr.message}`, {
        route: '/api/vendor/events/[marketId]/cancel', method: 'POST',
      }))
      return NextResponse.json(
        { error: 'Cancellation could not be recorded. Please try again or contact support.' },
        { status: 500 }
      )
    }

    // 1a. R3-4: they are no longer going — give back the day at whichever
    // location they had paused for this event (mig 238 blackouts lifted).
    {
      const { error: liftErr } = await liftEventBlackouts(serviceClient, marketId, vendorProfile.id)
      if (liftErr) console.error('[vendor-event-cancel] blackout lift failed:', liftErr)
    }

    // 1b. EVENT VENDOR FEE money (Backup bench Phase 3, 2026-08-16 —
    // decisions.md "Backup vendors — model decided"). Bands from
    // lib/events/fee-cancellation.ts:
    //   ≥72h out → full refund WITH transfer reversal (the organizer's ~93.5%
    //              comes back before the vendor is repaid), no stain.
    //   <72h     → fee FORFEITED instantly. No money moves (the split happened
    //              at pay time; forfeiting = not refunding). Organizer gets the
    //              waiver lever — in-app + email with the vendor's reason.
    // pending/covered rows are simply released: a leaving vendor's unpaid
    // checkout must not block a future attempt, and a covered backup who
    // cancels frees the forfeited pot to cover the NEXT backup.
    let feeOutcome: 'refunded' | 'forfeited' | null = null
    {
      const { data: feeRows } = await observed(serviceClient
        .from('event_vendor_fee_payments')
        .select('id, status, vendor_pays_cents, stripe_payment_intent_id')
        .eq('market_id', marketId)
        .eq('vendor_profile_id', vendorProfile.id)
        .in('status', ['pending_payment', 'paid', 'covered']), { table: 'event_vendor_fee_payments' })

      const releasable = (feeRows || []).filter(r => r.status !== 'paid')
      if (releasable.length > 0) {
        await serviceClient
          .from('event_vendor_fee_payments')
          .update({ status: 'released' })
          .in('id', releasable.map(r => r.id as string))
          .in('status', ['pending_payment', 'covered'])
      }

      const paidRow = (feeRows || []).find(r => r.status === 'paid')
      if (paidRow) {
        const outcome = decideFeeOutcome(hoursUntilEvent)
        if (outcome === 'refund') {
          try {
            if (!paidRow.stripe_payment_intent_id) throw new Error('paid row has no payment intent id')
            await refundEventFeePayment({
              paymentIntentId: paidRow.stripe_payment_intent_id as string,
              paymentId: paidRow.id as string,
              reason: 'vendor_cancelled_early',
            })
            await serviceClient
              .from('event_vendor_fee_payments')
              .update({
                status: 'refunded',
                refunded_at: new Date().toISOString(),
                refund_reason: 'vendor_cancelled_early',
                cancel_requested_at: new Date().toISOString(),
                cancel_reason: reason.trim(),
              })
              .eq('id', paidRow.id)
              .eq('status', 'paid')
            feeOutcome = 'refunded'
            await sendNotification(user.id, 'event_fee_refunded_vendor', {
              marketName: market.name,
              marketId,
              amountCents: paidRow.vendor_pays_cents as number,
              feeRefundReason: 'early_cancel',
              dedupRef: `${paidRow.id}-early-cancel`,
            }, { vertical: market.vertical_id })
          } catch (refundErr) {
            // Refund failed: leave the row 'paid' with the cancel stamps so the
            // money state stays truthful and the error log carries the retry.
            await serviceClient
              .from('event_vendor_fee_payments')
              .update({
                cancel_requested_at: new Date().toISOString(),
                cancel_reason: reason.trim(),
              })
              .eq('id', paidRow.id)
            await logError(new TracedError('ERR_REFUND_001', `[vendor-event-cancel] Fee refund failed for payment ${paidRow.id}: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
              route: '/api/vendor/events/[marketId]/cancel', method: 'POST',
              amountCents: paidRow.vendor_pays_cents as number,
            }))
          }
        } else {
          await serviceClient
            .from('event_vendor_fee_payments')
            .update({
              status: 'forfeited',
              forfeited_at: new Date().toISOString(),
              cancel_requested_at: new Date().toISOString(),
              cancel_reason: reason.trim(),
            })
            .eq('id', paidRow.id)
            .eq('status', 'paid')
          feeOutcome = 'forfeited'
          await sendNotification(user.id, 'event_fee_forfeited_vendor', {
            marketName: market.name,
            marketId,
            amountCents: paidRow.vendor_pays_cents as number,
            dedupRef: `${paidRow.id}-forfeit`,
          }, { vertical: market.vertical_id })

          // Waiver lever → organizer (in-app + email via 'standard' urgency).
          if (market.catering_request_id && market.event_start_date) {
            const { data: crOrganizer } = await observed(serviceClient
              .from('catering_requests')
              .select('id, organizer_user_id')
              .eq('id', market.catering_request_id)
              .maybeSingle(), { table: 'catering_requests' })
            if (crOrganizer?.organizer_user_id) {
              const deadline = waivableUntil(market.event_start_date as string)
              await sendNotification(crOrganizer.organizer_user_id as string, 'event_fee_waiver_requested_organizer', {
                vendorName: (vendorProfile.profile_data as Record<string, unknown>)?.business_name as string
                  || (vendorProfile.profile_data as Record<string, unknown>)?.farm_name as string || 'A vendor',
                marketName: market.name,
                amountCents: paidRow.vendor_pays_cents as number,
                reason: reason.trim(),
                waivableUntil: deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                eventId: crOrganizer.id as string,
                dedupRef: `${paidRow.id}-waiver-ask`,
              }, { vertical: market.vertical_id })
            }
          }
        }
      }
    }

    // 2. Remove event_vendor_listings for this vendor
    // First get the listing IDs so we can clean up listing_markets too
    const { data: vendorEventListings } = await observed(serviceClient
      .from('event_vendor_listings')
      .select('listing_id')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfile.id), { table: 'event_vendor_listings' })

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
    const { data: vendorItems } = await observed(serviceClient
      .from('order_items')
      .select(`
        id, order_id, quantity, subtotal_cents, listing_id,
        order:orders!inner(id, order_number, buyer_user_id, vertical_id, status, stripe_checkout_session_id),
        listing:listings(title)
      `)
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .in('status', ['pending', 'confirmed', 'ready'])
      .is('cancelled_at', null), { table: 'order_items' })

    let ordersCancelled = 0
    if (vendorItems && vendorItems.length > 0) {
      const affectedOrderIds = [...new Set(vendorItems.map(i => i.order_id as string))]
      const { data: allOrderItems } = await observed(serviceClient
        .from('order_items')
        .select('order_id')
        .in('order_id', affectedOrderIds), { table: 'order_items' })
      const itemCounts = new Map<string, number>()
      for (const oi of allOrderItems || []) {
        itemCounts.set(oi.order_id as string, (itemCounts.get(oi.order_id as string) || 0) + 1)
      }
      const { data: succeededPayments } = await observed(serviceClient
        .from('payments')
        .select('order_id, stripe_payment_intent_id')
        .in('order_id', affectedOrderIds)
        .eq('status', 'succeeded'), { table: 'payments' })
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
        const { data: cancelledRows } = await observed(serviceClient
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
          .select('id'), { table: 'order_items', operation: 'update' })
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
        const { data: liveItems } = await observed(serviceClient
          .from('order_items')
          .select('id')
          .eq('order_id', affectedOrderId)
          .is('cancelled_at', null), { table: 'order_items' })
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
    const { data: hasWaves } = await observed(serviceClient
      .from('event_waves')
      .select('id')
      .eq('market_id', marketId)
      .limit(1), { table: 'event_waves' })
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
    const { data: admins } = await observed(serviceClient
      .from('user_profiles')
      .select('user_id')
      .in('role', ['admin', 'platform_admin'])
      .is('deleted_at', null)
      .limit(5), { table: 'user_profiles' })

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
      const { data: cReq } = await observed(serviceClient
        .from('catering_requests')
        .select('id, contact_name, contact_email, vertical_id, organizer_user_id')
        .eq('id', market.catering_request_id)
        .single(), { table: 'catering_requests' })

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

    // 5. Auto-escalate to backup vendor (if one exists).
    // Phase 3 (2026-08-16): standby-opted-in vendors go FIRST (they said yes
    // to being asked — mig 232), then declared backup_priority order.
    const { data: backups } = await observed(serviceClient
      .from('market_vendors')
      .select('vendor_profile_id, backup_priority, standby_opted_in_at, vendor_profiles:vendor_profile_id(user_id)')
      .eq('market_id', marketId)
      .eq('is_backup', true)
      .order('standby_opted_in_at', { ascending: true, nullsFirst: false })
      .order('backup_priority', { ascending: true, nullsFirst: false })
      .limit(1), { table: 'market_vendors' })

    if (backups && backups.length > 0) {
      const backup = backups[0]
      const backupVp = backup.vendor_profiles as unknown as { user_id: string } | null

      // Update backup: remove backup flag, set as invited (they need to
      // re-confirm). organizer_selected_at is stamped because the backup steps
      // into a SELECTED spot — it arms the fee pay button on acceptance when
      // the spot is not covered (e.g. the defector was refunded, not forfeited).
      await serviceClient
        .from('market_vendors')
        .update({
          is_backup: false,
          response_status: 'invited',
          response_notes: `Auto-escalated: replacing ${vendorName} who cancelled`,
          replaced_vendor_id: vendorProfile.id,
          organizer_selected_at: new Date().toISOString(),
        })
        .eq('market_id', marketId)
        .eq('vendor_profile_id', backup.vendor_profile_id)

      // Covered spot (owner model: "the defector's forfeited spot fee covers
      // the activated backup's spot + the penalty amount becomes their step-in
      // bonus" — free spot IS the bonus, no cash moves). Claim an UNCLAIMED
      // forfeited pot at this event: forfeited, and not already covering a
      // live 'covered' row. The covered row holds capacity (RPCs count it as
      // occupying, mig 233) and the pay gate treats it as already paid.
      // Always search — not only THIS cancellation's forfeit: an earlier
      // defector's pot may still be unclaimed (their backup declined and the
      // covered row was released).
      let coveredAmountCents: number | null = null
      {
        const { data: forfeits } = await observed(serviceClient
          .from('event_vendor_fee_payments')
          .select('id, fee_cents, vendor_pays_cents, organizer_receives_cents, platform_keeps_cents, catering_request_id')
          .eq('market_id', marketId)
          .eq('status', 'forfeited'), { table: 'event_vendor_fee_payments' })
        const { data: liveCovered } = await observed(serviceClient
          .from('event_vendor_fee_payments')
          .select('covering_payment_id')
          .eq('market_id', marketId)
          .eq('status', 'covered'), { table: 'event_vendor_fee_payments' })
        const claimedPotIds = new Set((liveCovered || []).map(r => r.covering_payment_id as string))
        const pot = (forfeits || []).find(f => !claimedPotIds.has(f.id as string))

        // Never give a vendor two live rows (unique index): skip if the backup
        // already holds a paid/pending/covered row at this event.
        const { data: backupLiveRows } = pot
          ? await serviceClient
              .from('event_vendor_fee_payments')
              .select('id')
              .eq('market_id', marketId)
              .eq('vendor_profile_id', backup.vendor_profile_id)
              .in('status', ['pending_payment', 'paid', 'covered'])
          : { data: null }

        if (pot && (!backupLiveRows || backupLiveRows.length === 0)) {
          const { error: coverErr } = await serviceClient
            .from('event_vendor_fee_payments')
            .insert({
              catering_request_id: pot.catering_request_id,
              market_id: marketId,
              vendor_profile_id: backup.vendor_profile_id,
              fee_cents: pot.fee_cents,
              vendor_pays_cents: pot.vendor_pays_cents,
              organizer_receives_cents: pot.organizer_receives_cents,
              platform_keeps_cents: pot.platform_keeps_cents,
              status: 'covered',
              covering_payment_id: pot.id,
            })
          if (coverErr) {
            await logError(new TracedError('ERR_DB_UNKNOWN', `[vendor-event-cancel] Covered-spot insert failed for backup ${backup.vendor_profile_id}: ${coverErr.message}`, {
              route: '/api/vendor/events/[marketId]/cancel', method: 'POST',
            }))
          } else {
            coveredAmountCents = pot.vendor_pays_cents as number
          }
        }
      }

      // Notify backup vendor
      if (backupVp?.user_id) {
        // B1 (2026-08-15): was headcount: 0 + empty address — the promoted
        // backup was invited to an event with no size and no place. Real
        // headcount + the same city/state masking the admin invite uses
        // (invited ≠ accepted, so no street address).
        await sendNotification(backupVp.user_id, 'catering_vendor_invited', {
          companyName: 'Event Opportunity — Backup Activated',
          headcount: (market.headcount as number) || 0,
          eventDate: market.event_start_date,
          eventAddress: [market.city, market.state].filter(Boolean).join(', '),
          vertical: market.vertical_id,
          marketId: marketId,
        }, { vertical: market.vertical_id })

        if (coveredAmountCents !== null) {
          await sendNotification(backupVp.user_id, 'event_backup_spot_covered', {
            marketName: market.name,
            marketId,
            amountCents: coveredAmountCents,
            dedupRef: `${marketId}-${backup.vendor_profile_id}-covered`,
          }, { vertical: market.vertical_id })
        }
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
      // Phase 3: 'refunded' | 'forfeited' | null (no paid fee existed)
      fee_outcome: feeOutcome,
      backup_escalated: backups && backups.length > 0,
      buyer_items_cancelled: vendorItems?.length || 0,
      orders_closed: ordersCancelled,
    })
  })
}
