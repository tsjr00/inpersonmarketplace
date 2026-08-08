import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole, verifyAdminScope } from '@/lib/auth/admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing, logError, TracedError } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications/service'
import { stripe } from '@/lib/stripe/config'
import { createRefund } from '@/lib/stripe/payments'
import { approveEventRequest, autoMatchAndInvite } from '@/lib/events/event-actions'
import { runEventCompletionEffects, sendOrganizerStatusEmail } from '@/lib/events/complete-event'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/admin/events/[id]
 *
 * Update catering request status. On approval, auto-creates event market + token.
 *
 * Event Lifecycle Statuses:
 *   new        — Request received, not yet reviewed by admin
 *   reviewing  — Admin is evaluating viability (scoring, logistics, budget check)
 *   approved   — Passes viability check; market + token created; ready to invite vendors
 *   declined   — Request doesn't meet platform criteria (unrealistic budget, scope, etc.)
 *   cancelled  — Organizer or admin cancelled before or during event
 *   ready      — Enough vendors confirmed; event page shareable with organizer
 *   active     — Event day (orders being fulfilled)
 *   review     — Post-event; feedback collection window (~7 days)
 *   completed  — Settled; all vendor payouts processed
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/[id]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(
      `admin:${clientIp}`,
      rateLimits.admin
    )
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { id } = await context.params
    const body = await request.json()
    const { status, admin_notes, address, city, state, zip, event_date } = body

    const validStatuses = [
      'new',       // Request received, not yet reviewed
      'reviewing', // Admin evaluating viability
      'approved',  // Passes viability check, market+token created, ready to invite vendors
      'declined',  // Doesn't meet criteria
      'cancelled', // Organizer or admin cancelled
      'ready',     // Enough vendors confirmed, event page shareable
      'active',    // Event day
      'review',    // Post-event, feedback collection
      'completed', // Settled, payouts done
    ]
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      )
    }

    const serviceClient = createServiceClient()

    // Fetch current request
    const { data: cateringReq, error: fetchError } = await serviceClient
      .from('catering_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !cateringReq) {
      return NextResponse.json(
        { error: 'Catering request not found' },
        { status: 404 }
      )
    }

    // S4-2: scope to the event's vertical — platform admin any; vertical admin
    // only their own vertical's events (they handle their events, not platform).
    const scope = await verifyAdminScope(cateringReq.vertical_id as string)
    if (!scope?.authorized) {
      return NextResponse.json({ error: "Not authorized for this event's vertical" }, { status: 403 })
    }

    // Build update object
    const updates: Record<string, unknown> = {}
    if (status) updates.status = status
    if (admin_notes !== undefined) updates.admin_notes = admin_notes

    // Admin may supply the street address (added 2026-08-08). Approval below
    // refuses without one, and previously NOTHING on the admin side could set
    // it — the admin could talk to the organizer on the phone and still have no
    // way to record what they were told. Accepting it here means an admin can
    // unstick an event in one PATCH, address and approval together.
    if (address !== undefined) {
      const trimmed = typeof address === 'string' ? address.trim() : ''
      if (!trimmed) {
        return NextResponse.json(
          { error: 'Address cannot be set to blank' },
          { status: 400 }
        )
      }
      updates.address = trimmed.slice(0, 500)
    }

    // City / state / zip / date — the fields approval COPIES into the markets
    // row, with event_date also deciding the market's schedule weekday
    // (event-actions.ts:126-159). Editable here only while no market exists.
    // After that, writing them would change the request but not the market the
    // vendors and shoppers actually see — a silent desync, worse than refusing.
    // Correcting an approved event needs the market updated too; that is a
    // separate build, logged in backlog.md.
    const locationEdits: Record<string, unknown> = {}
    if (city !== undefined) {
      const c = String(city ?? '').trim()
      if (!c) return NextResponse.json({ error: 'City cannot be blank' }, { status: 400 })
      locationEdits.city = c.slice(0, 100)
    }
    if (state !== undefined) {
      const s = String(state ?? '').trim().toUpperCase()
      if (s.length !== 2) return NextResponse.json({ error: 'State must be a 2-letter code' }, { status: 400 })
      locationEdits.state = s
    }
    if (zip !== undefined) {
      const z = String(zip ?? '').trim()
      if (!/^\d{5}(-\d{4})?$/.test(z)) return NextResponse.json({ error: 'Zip must be 5 digits, or 5+4' }, { status: 400 })
      locationEdits.zip = z
    }
    if (event_date !== undefined) {
      const d = String(event_date ?? '')
      const parsed = new Date(d + 'T00:00:00')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (isNaN(parsed.getTime()) || parsed < today) {
        return NextResponse.json({ error: 'Event date must be today or in the future' }, { status: 400 })
      }
      locationEdits.event_date = d
    }
    if (Object.keys(locationEdits).length > 0) {
      if (cateringReq.market_id) {
        return NextResponse.json(
          {
            error: `This event is already approved, so ${Object.keys(locationEdits).join(', ')} cannot be changed here — the live event market would keep the old values. Cancel and re-create the event, or ask for the market to be corrected directly.`,
          },
          { status: 400 }
        )
      }
      Object.assign(updates, locationEdits)
    }

    // On APPROVE: create event market + schedule via shared function
    if (status === 'approved' && cateringReq.status !== 'approved') {
      // Address required for approval. The market created downstream uses it for
      // vendor logistics, so this gate stays — but it now honors an address
      // supplied in THIS request. Checking only the stored row would have made
      // "set the address and approve" a two-call dance that silently failed on
      // the first call.
      const effectiveAddress = (updates.address as string | undefined)
        ?? (cateringReq.address as string | null)
      if (!effectiveAddress || !String(effectiveAddress).trim()) {
        return NextResponse.json(
          { error: 'Cannot approve event without a street address. Add one in the Street address field, or ask the organizer to add it from their event dashboard.' },
          { status: 400 }
        )
      }

      // Pass the effective values, not the stale row — otherwise approving in
      // the same call that fixes the location would build the market from the
      // old data. `locationEdits` is empty unless this PATCH supplied them.
      const approval = await approveEventRequest(serviceClient, {
        ...cateringReq,
        ...locationEdits,
        address: effectiveAddress,
      })

      if (!approval.success) {
        return NextResponse.json(
          { error: approval.error || 'Failed to create event market' },
          { status: 500 }
        )
      }

      updates.event_token = approval.event_token
      updates.market_id = approval.market_id
      if (approval.access_code) {
        updates.access_code = approval.access_code
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      )
    }

    const { data: updated, error: updateError } = await serviceClient
      .from('catering_requests')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) {
      console.error('[admin/catering] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update catering request' },
        { status: 500 }
      )
    }

    // On APPROVED: auto-invite vendors for full-service events + notify organizer
    if (status === 'approved' && cateringReq.status !== 'approved' && updated.market_id) {
      // T3-1: Auto-invite vendors (full-service events only — self-service handles this in event-requests route)
      if (updated.service_level !== 'self_service') {
        autoMatchAndInvite(serviceClient, updated, updated.market_id as string).catch(err =>
          console.error('[admin/events] Auto-invite failed:', err)
        )
      }

      // T3-3: Notify organizer that we're working on their event
      if (updated.contact_email) {
        sendOrganizerStatusEmail(
          updated.contact_name,
          updated.contact_email,
          updated.company_name,
          updated.event_date,
          updated.vertical_id,
          'approved',
          "We're matching vendors to your event. You'll hear from us as soon as they're confirmed."
        ).catch(err => console.error('[admin/events] Approved email error:', err))
      }

      // If organizer has an account, also send in-app notification
      if (updated.organizer_user_id) {
        sendNotification(updated.organizer_user_id, 'event_confirmed', {
          companyName: updated.company_name,
          eventDate: updated.event_date,
        }, { vertical: updated.vertical_id }).catch(() => {})
      }
    }

    // On READY: auto-generate waves if not already generated + notify organizer
    if (status === 'ready' && updated.market_id) {
      // T2-3: Auto-generate waves for wave-ordering events
      if (updated.payment_model === 'company_paid' || updated.wave_ordering_enabled) {
        const { data: existingWaves } = await serviceClient
          .from('event_waves')
          .select('id')
          .eq('market_id', updated.market_id)
          .limit(1)

        if (!existingWaves || existingWaves.length === 0) {
          const { generateEventWaves } = await import('@/lib/events/wave-generation')
          generateEventWaves(serviceClient, {
            marketId: updated.market_id as string,
            eventStartTime: updated.event_start_time || '11:00:00',
            eventEndTime: updated.event_end_time || '14:00:00',
          }).catch(err => console.error('[admin/events] Auto wave generation failed:', err))
        }
      }
    }

    if (status === 'ready' && updated.event_token && updated.contact_email && !updated.selection_email_sent_at) {
      const { getAppUrl } = await import('@/lib/environment')
      const eventPageUrl = `${getAppUrl(updated.vertical_id)}/${updated.vertical_id}/events/${updated.event_token}`
      // Count confirmed vendors
      const { count: vendorCount } = await serviceClient
        .from('market_vendors')
        .select('id', { count: 'exact', head: true })
        .eq('market_id', updated.market_id)
        .eq('response_status', 'accepted')

      // Send via email to organizer (not an app user — use direct email)
      sendEventConfirmedEmail(
        updated.contact_name,
        updated.contact_email,
        updated.company_name,
        updated.event_date,
        vendorCount || 0,
        eventPageUrl,
        updated.vertical_id
      ).catch(err => console.error('[admin/catering] Event confirmed email error:', err))
    }

    // On CANCELLED or DECLINED: clean up listing_markets + notify buyers + cancel orders
    if ((status === 'cancelled' || status === 'declined') && cateringReq.market_id) {
      const { data: eventListings } = await serviceClient
        .from('event_vendor_listings')
        .select('listing_id')
        .eq('market_id', cateringReq.market_id)
      if (eventListings && eventListings.length > 0) {
        const listingIds = eventListings.map(el => el.listing_id as string)
        await serviceClient
          .from('listing_markets')
          .delete()
          .eq('market_id', cateringReq.market_id)
          .in('listing_id', listingIds)
      }

      // Notify buyers who have orders at this event and cancel their orders.
      // Resolve order IDs via order_items.market_id (orders.market_id does not
      // exist; the link from event/market to orders is per-item). Earlier
      // attempts queried .from('orders').eq('market_id', ...) which silently
      // returned null, causing the entire cancel flow to no-op.
      const { data: orderItemRows } = await serviceClient
        .from('order_items')
        .select('order_id, status')
        .eq('market_id', cateringReq.market_id)

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
            vendorName: cateringReq.company_name,
            companyName: cateringReq.company_name,
            eventDate: cateringReq.event_date,
            reason: status === 'cancelled'
              ? 'This event has been cancelled. If you paid via card, a refund will be processed.'
              : 'This event has been declined. If you paid via card, a refund will be processed.',
            orderNumber: buyerOrder?.order_number as string,
            orderId: buyerOrder?.id as string,
          }, { vertical: cateringReq.vertical_id }).catch(err =>
            console.error(`[admin/events] Buyer cancel notification failed for ${buyerId}:`, err)
          )
        })
        await Promise.all(buyerNotifications)

        // EVT-4 FIX (mirrors the organizer cancel route): the buyer notice above
        // promises a refund. Per order: pending+session → sessions.expire first
        // (skip the order if expire throws — possibly race-paid, webhook will
        // finalize); Stripe-paid → refund the REMAINING refundable balance;
        // fulfilled-item orders skip auto-refund and log for manual review.
        // Items are then cancelled (guarded) so cron Phases 4/7 can't pay
        // vendors for no-shows at a cancelled event.
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
              await logError(new TracedError('ERR_CHECKOUT_005', `[admin/events cancel] Session expire failed for order ${order.id} (session ${order.stripe_checkout_session_id}): ${expireErr instanceof Error ? expireErr.message : String(expireErr)}`, {
                route: '/api/admin/events/[id]', method: 'PATCH',
              }))
              continue // possibly race-paid — leave this order for the webhook
            }
          }
          cancellableOrderIds.push(order.id as string)

          const paymentIntentId = paymentByOrder.get(order.id as string)
          if (paymentIntentId) {
            if (fulfilledOrderIds.has(order.id as string)) {
              await logError(new TracedError('ERR_REFUND_001', `[admin/events cancel] Order ${order.id} has fulfilled items — auto-refund skipped, needs manual review`, {
                route: '/api/admin/events/[id]', method: 'PATCH', orderId: order.id,
              }))
            } else {
              try {
                await createRefund(paymentIntentId, `${order.id}-event-cancel`)
              } catch (refundErr) {
                await logError(new TracedError('ERR_REFUND_001', `[admin/events cancel] Refund failed for order ${order.id}: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
                  route: '/api/admin/events/[id]', method: 'PATCH', orderId: order.id,
                }))
              }
            }
          }
        }

        if (cancellableOrderIds.length > 0) {
          await serviceClient
            .from('order_items')
            .update({
              status: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancelled_by: 'system',
              cancellation_reason: status === 'declined' ? 'Event declined' : 'Event cancelled',
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

          // Free wave slots for all cancelled event orders (organizer-route parity)
          for (const cancelledOrderId of cancellableOrderIds) {
            const { error: waveErr } = await serviceClient.rpc('free_wave_on_order_cancel', {
              p_order_id: cancelledOrderId,
            })
            if (waveErr) console.error(`[admin/events cancel] free_wave error for order ${cancelledOrderId}:`, waveErr.message)
          }
        }
      }

      // EVT-10 FIX: notify accepted vendors — previously NO path informed
      // vendors of an admin cancel/decline (the organizer route notifies, this
      // one didn't). user_id resolved via the join; sendNotification's first
      // arg is a USER id, not a vendor_profile id.
      const { data: cancelVendors } = await serviceClient
        .from('market_vendors')
        .select('vendor_profile_id, vendor_profiles!inner(user_id)')
        .eq('market_id', cateringReq.market_id)
        .eq('response_status', 'accepted')

      if (cancelVendors && cancelVendors.length > 0) {
        await Promise.all(cancelVendors.flatMap(v => {
          const vp = v.vendor_profiles as unknown as { user_id?: string } | { user_id?: string }[] | null
          const vendorUserId = (Array.isArray(vp) ? vp[0]?.user_id : vp?.user_id) as string | undefined
          if (!vendorUserId) return []
          return [sendNotification(vendorUserId, 'event_cancelled_vendor', {
            companyName: cateringReq.company_name,
            eventDate: cateringReq.event_date,
          }, { vertical: cateringReq.vertical_id }).catch(err =>
            console.error(`[admin/events] Vendor cancel notification failed for ${v.vendor_profile_id}:`, err)
          )]
        }))
      }

      // T3-2: Notify organizer on decline (and on admin-initiated cancel)
      if (updated.contact_email) {
        const reason = status === 'declined'
          ? (updated.admin_notes || "We weren't able to accommodate your event at this time. Please reach out if you'd like to discuss alternatives.")
          : 'Your event has been cancelled.'
        sendOrganizerStatusEmail(
          updated.contact_name,
          updated.contact_email,
          updated.company_name,
          updated.event_date,
          updated.vertical_id,
          status,
          reason
        ).catch(err => console.error(`[admin/events] ${status} email error:`, err))
      }
    }

    // On COMPLETED: fire the shared completion effects (feedback, settlement,
    // unfulfilled vendor + vertical-admin notices, organizer email, cleanup).
    // Same path the auto-complete cron uses (expire-orders Phase 15.5).
    // EVT-14 FIX: prior-status guard (mirrors the approve guard at :114) — a
    // re-PATCH carrying status:'completed' (e.g. saving admin_notes) was
    // re-firing the effects, duplicating notifications to every buyer+vendor.
    if (status === 'completed' && cateringReq.status !== 'completed' && cateringReq.market_id) {
      await runEventCompletionEffects(serviceClient, {
        market_id: cateringReq.market_id as string,
        vertical_id: cateringReq.vertical_id as string,
        company_name: (updated.company_name as string | null) ?? null,
        contact_name: (updated.contact_name as string | null) ?? null,
        contact_email: (updated.contact_email as string | null) ?? null,
        event_date: (updated.event_date as string | null) ?? null,
      })
    }

    return NextResponse.json({ request: updated })
  })
}

async function sendEventConfirmedEmail(
  contactName: string,
  contactEmail: string,
  companyName: string,
  eventDate: string,
  vendorCount: number,
  eventPageUrl: string,
  verticalId: string
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const isFM = verticalId === 'farmers_market'
  const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
  const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
  const accentColor = isFM ? '#2d5016' : '#ff5757'
  const vendorLabel = isFM ? 'vendor' : 'food truck'

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: `${senderName} <updates@${senderDomain}>`,
      to: contactEmail,
      subject: `Your event is confirmed — ${vendorCount} ${vendorLabel}${vendorCount > 1 ? 's' : ''} ready!`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${accentColor};margin:0 0 8px">Your event is confirmed!</h2>
          <p style="color:#374151;margin:0 0 16px;font-size:16px">Hi ${contactName},</p>
          <p style="color:#4b5563;line-height:1.6;margin:0 0 16px">
            Great news &mdash; <strong>${vendorCount} ${vendorLabel}${vendorCount > 1 ? 's are' : ' is'}</strong> confirmed for your
            ${companyName} event on <strong>${eventDate}</strong>.
          </p>
          <p style="color:#4b5563;line-height:1.6;margin:0 0 20px">
            Share the link below with your team so they can browse menus and pre-order:
          </p>
          <div style="text-align:center;margin:0 0 24px">
            <a href="${eventPageUrl}" style="display:inline-block;padding:14px 28px;background:${accentColor};color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px">
              View Event Page
            </a>
          </div>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin:0 0 20px">
            <p style="margin:0;font-size:13px;color:#6b7280;word-break:break-all">${eventPageUrl}</p>
          </div>
          <p style="color:#6b7280;font-size:13px;margin:0;border-top:1px solid #e5e7eb;padding-top:16px">
            Questions? Reply to this email and our team will help.
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[admin/catering] Failed to send event confirmed email:', err)
  }
}

