import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications/service'
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
    const { status, admin_notes } = body

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

    // Build update object
    const updates: Record<string, unknown> = {}
    if (status) updates.status = status
    if (admin_notes !== undefined) updates.admin_notes = admin_notes

    // On APPROVE: create event market + schedule via shared function
    if (status === 'approved' && cateringReq.status !== 'approved') {
      // Address required for approval — Stage 2 mandatory gate.
      // Stage 1 form makes address optional; admin/organizer must provide a real
      // address before the event can advance. The market created downstream uses
      // this address for vendor logistics.
      if (!cateringReq.address || !String(cateringReq.address).trim()) {
        return NextResponse.json(
          { error: 'Cannot approve event without a street address. Ask the organizer to add one via their dashboard.' },
          { status: 400 }
        )
      }

      const approval = await approveEventRequest(serviceClient, cateringReq)

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
        .select('order_id')
        .eq('market_id', cateringReq.market_id)

      const orderIds = [...new Set((orderItemRows || []).map(r => r.order_id as string))]

      const { data: buyerOrders } = orderIds.length > 0
        ? await serviceClient
            .from('orders')
            .select('buyer_user_id, order_number, id')
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

        // Mark buyer orders as cancelled (preserve completed/refunded/already-cancelled)
        await serviceClient
          .from('orders')
          .update({ status: 'cancelled' })
          .in('id', buyerOrders.map(o => o.id as string))
          .not('status', 'in', '("cancelled","refunded","completed")')
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
    if (status === 'completed' && cateringReq.market_id) {
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

