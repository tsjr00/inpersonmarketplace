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
import { approveEventRequest } from '@/lib/events/event-actions'

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
      const approval = await approveEventRequest(serviceClient, cateringReq)

      if (!approval.success) {
        return NextResponse.json(
          { error: approval.error || 'Failed to create event market' },
          { status: 500 }
        )
      }

      updates.event_token = approval.event_token
      updates.market_id = approval.market_id
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

    // On READY: notify organizer that event is confirmed with shareable link
    if (status === 'ready' && updated.event_token && updated.contact_email) {
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

    // On CANCELLED or DECLINED: clean up listing_markets rows (same as completed cleanup)
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
    }

    // On COMPLETED: check for unfulfilled orders, then send feedback + settlement
    if (status === 'completed' && cateringReq.market_id) {
      // Check for orders not yet fulfilled — warn admin + notify vendors
      const { data: unfulfilledItems } = await serviceClient
        .from('order_items')
        .select('id, status, vendor_profile_id, listing:listings(title)')
        .eq('market_id', cateringReq.market_id)
        .not('status', 'in', '("fulfilled","completed","cancelled")')

      if (unfulfilledItems && unfulfilledItems.length > 0) {
        // Group by vendor for targeted notifications
        const vendorUnfulfilled: Record<string, string[]> = {}
        for (const item of unfulfilledItems) {
          const vid = item.vendor_profile_id as string
          if (!vendorUnfulfilled[vid]) vendorUnfulfilled[vid] = []
          const listing = item.listing as unknown as { title: string } | null
          vendorUnfulfilled[vid].push(listing?.title || 'Unknown item')
        }

        // Notify each vendor with unfulfilled orders
        for (const [vendorId, items] of Object.entries(vendorUnfulfilled)) {
          const { data: vp } = await serviceClient
            .from('vendor_profiles')
            .select('user_id')
            .eq('id', vendorId)
            .single()

          if (vp?.user_id) {
            await sendNotification(vp.user_id as string, 'event_settlement_summary', {
              marketName: `${cateringReq.company_name || 'Event'} — ${items.length} unfulfilled order${items.length > 1 ? 's' : ''} need attention`,
              orderCount: items.length,
            }, { vertical: cateringReq.vertical_id })
          }
        }

        // Warn admin in the response (event still moves to completed — admin chose this)
        console.warn(`[admin/events] Event ${id} marked completed with ${unfulfilledItems.length} unfulfilled order items`)
      }

      // Fire-and-forget — don't block the response
      sendEventFeedbackNotifications(serviceClient, cateringReq.market_id, cateringReq.vertical_id).catch(
        (err) => console.error('[admin/catering] Feedback notification error:', err)
      )
      // Notify accepted vendors that settlement is complete
      sendEventSettlementNotifications(serviceClient, cateringReq.market_id, cateringReq.vertical_id, updated.company_name).catch(
        (err) => console.error('[admin/catering] Settlement notification error:', err)
      )
      // Clean up listing_markets rows created for this event (Option B cleanup)
      // These were inserted when vendors accepted the invitation
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
    }

    return NextResponse.json({ request: updated })
  })
}

async function sendEventFeedbackNotifications(
  serviceClient: ReturnType<typeof createServiceClient>,
  marketId: string,
  verticalId: string
) {
  // Find all unique buyers who ordered from this event market
  const { data: orderItems } = await serviceClient
    .from('order_items')
    .select('orders!inner(buyer_user_id)')
    .eq('market_id', marketId)
    .not('status', 'in', '("cancelled")')

  if (!orderItems || orderItems.length === 0) return

  const buyerIds = new Set<string>()
  for (const item of orderItems) {
    const order = item.orders as unknown as { buyer_user_id: string }
    buyerIds.add(order.buyer_user_id)
  }

  // Get the market name for the notification
  const { data: market } = await serviceClient
    .from('markets')
    .select('name')
    .eq('id', marketId)
    .single()

  const marketName = market?.name || 'the event'

  // Send feedback request to each buyer
  for (const buyerId of buyerIds) {
    await sendNotification(
      buyerId,
      'event_feedback_request',
      {
        marketName,
        vertical: verticalId,
      },
      { vertical: verticalId }
    )
  }
}

async function sendEventSettlementNotifications(
  serviceClient: ReturnType<typeof createServiceClient>,
  marketId: string,
  verticalId: string,
  companyName: string
) {
  // Get accepted vendors for this event
  const { data: acceptedVendors } = await serviceClient
    .from('market_vendors')
    .select('vendor_profile_id, vendor_profiles:vendor_profile_id(user_id)')
    .eq('market_id', marketId)
    .eq('response_status', 'accepted')

  if (!acceptedVendors || acceptedVendors.length === 0) return

  const { data: market } = await serviceClient
    .from('markets')
    .select('name')
    .eq('id', marketId)
    .single()

  const marketName = market?.name || companyName || 'Event'

  for (const mv of acceptedVendors) {
    const vp = mv.vendor_profiles as unknown as { user_id: string } | null
    if (!vp?.user_id) continue

    // Count this vendor's fulfilled orders at this event
    const { count: orderCount } = await serviceClient
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId)
      .eq('vendor_profile_id', mv.vendor_profile_id)
      .in('status', ['fulfilled', 'completed'])

    await sendNotification(vp.user_id, 'event_settlement_summary', {
      marketName,
      orderCount: orderCount || 0,
    }, { vertical: verticalId })
  }
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
