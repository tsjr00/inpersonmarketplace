/**
 * Event completion side-effects — the single source of truth for what happens
 * when a catering event moves to `completed`. Called by BOTH the admin PATCH
 * (`/api/admin/events/[id]`) and the auto-complete cron (expire-orders Phase 15.5).
 *
 * All notification sends are awaited (not fire-and-forget): on Vercel the
 * function is torn down after the response, so un-awaited async work can be
 * killed mid-flight. sendNotification never throws, so awaiting is safe.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification, sendNotificationBatch } from '@/lib/notifications/service'

export interface EventCompletionInput {
  market_id: string
  vertical_id: string
  company_name: string | null
  contact_name: string | null
  contact_email: string | null
  event_date: string | null
}

/**
 * Fire every completion effect for an event market: unfulfilled-order notices
 * (vendors + vertical admins), buyer feedback requests, vendor settlement
 * summaries, the organizer "completed" email, and listing_markets cleanup.
 *
 * The caller is responsible for flipping status → completed (status-guarded)
 * BEFORE calling this, so these effects fire exactly once.
 */
export async function runEventCompletionEffects(
  serviceClient: SupabaseClient,
  event: EventCompletionInput,
): Promise<void> {
  const marketId = event.market_id
  const verticalId = event.vertical_id

  // 1. Unfulfilled orders → notify vendors + vertical admins
  const { data: unfulfilledItems } = await serviceClient
    .from('order_items')
    .select('id, status, vendor_profile_id, listing:listings(title)')
    .eq('market_id', marketId)
    .not('status', 'in', '("fulfilled","completed","cancelled")')

  if (unfulfilledItems && unfulfilledItems.length > 0) {
    const vendorUnfulfilled: Record<string, string[]> = {}
    for (const item of unfulfilledItems) {
      const vid = item.vendor_profile_id as string
      if (!vendorUnfulfilled[vid]) vendorUnfulfilled[vid] = []
      const listing = item.listing as unknown as { title: string } | null
      vendorUnfulfilled[vid].push(listing?.title || 'Unknown item')
    }

    // Notify each vendor with unfulfilled orders. Payload is per-vendor
    // (orderCount differs), so sends stay individual — but resolve all the
    // vendor user_ids in ONE query instead of a per-vendor N+1.
    const unfulfilledVendorIds = Object.keys(vendorUnfulfilled)
    const { data: vps } = await serviceClient
      .from('vendor_profiles')
      .select('id, user_id')
      .in('id', unfulfilledVendorIds)
    const userByVendor = new Map((vps ?? []).map((v) => [v.id as string, (v.user_id as string | null) ?? null]))
    for (const [vendorId, items] of Object.entries(vendorUnfulfilled)) {
      const uid = userByVendor.get(vendorId)
      if (uid) {
        await sendNotification(uid, 'event_force_completed_with_unfulfilled', {
          marketName: event.company_name || 'Event',
          orderCount: items.length,
        }, { vertical: verticalId })
      }
    }

    // Notify the vertical's admins so a human can follow up (uniform payload → batch).
    const { data: vAdmins } = await serviceClient
      .from('vertical_admins')
      .select('user_id')
      .eq('vertical_id', verticalId)
    const adminUserIds = (vAdmins || [])
      .map((va) => (va as { user_id?: string }).user_id)
      .filter((id): id is string => !!id)
    await sendNotificationBatch(adminUserIds, 'event_completed_with_unfulfilled_admin', {
      marketName: event.company_name || 'Event',
      orderCount: unfulfilledItems.length,
    }, { vertical: verticalId })

    console.warn(`[complete-event] market ${marketId} completed with ${unfulfilledItems.length} unfulfilled order item(s)`)
  }

  // 2. Buyer feedback requests + 3. vendor settlement summaries
  await sendEventFeedbackNotifications(serviceClient, marketId, verticalId).catch(
    (err) => console.error('[complete-event] Feedback notification error:', err)
  )
  await sendEventSettlementNotifications(serviceClient, marketId, verticalId, event.company_name || 'Event').catch(
    (err) => console.error('[complete-event] Settlement notification error:', err)
  )

  // 4. Organizer "completed" email
  if (event.contact_email) {
    await sendOrganizerStatusEmail(
      event.contact_name || '',
      event.contact_email,
      event.company_name || 'your event',
      event.event_date || '',
      verticalId,
      'completed',
      'Your event is complete! Thank you for choosing us. We hope your attendees enjoyed the experience.'
    ).catch((err) => console.error('[complete-event] Completed email error:', err))
  }

  // 5. Clean up listing_markets rows created for this event
  const { data: eventListings } = await serviceClient
    .from('event_vendor_listings')
    .select('listing_id')
    .eq('market_id', marketId)
  if (eventListings && eventListings.length > 0) {
    const listingIds = eventListings.map((el) => el.listing_id as string)
    await serviceClient
      .from('listing_markets')
      .delete()
      .eq('market_id', marketId)
      .in('listing_id', listingIds)
  }
}

export async function sendEventFeedbackNotifications(
  serviceClient: SupabaseClient,
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

  const { data: market } = await serviceClient
    .from('markets')
    .select('name')
    .eq('id', marketId)
    .single()

  const marketName = market?.name || 'the event'

  // EVT-16 / NOT-2: uniform payload for every buyer → one bulk-prefetch batch
  // instead of a per-buyer send loop (an event can have hundreds of attendees).
  await sendNotificationBatch(
    Array.from(buyerIds),
    'event_feedback_request',
    { marketName, vertical: verticalId },
    { vertical: verticalId }
  )
}

export async function sendEventSettlementNotifications(
  serviceClient: SupabaseClient,
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

    const { data: vendorItems } = await serviceClient
      .from('order_items')
      .select('id, subtotal_cents, vendor_payout_cents')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', mv.vendor_profile_id)
      .in('status', ['fulfilled', 'completed'])

    const orderCount = vendorItems?.length || 0
    const payoutCents = (vendorItems || []).reduce((sum, item) => sum + (item.vendor_payout_cents || item.subtotal_cents || 0), 0)

    await sendNotification(vp.user_id, 'event_settlement_summary', {
      marketName,
      orderCount,
      payoutAmount: (payoutCents / 100).toFixed(2),
    }, { vertical: verticalId })
  }
}

export async function sendOrganizerStatusEmail(
  contactName: string,
  contactEmail: string,
  companyName: string,
  eventDate: string,
  verticalId: string,
  eventStatus: string,
  message: string
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const isFM = verticalId === 'farmers_market'
  const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
  const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
  const accentColor = isFM ? '#2d5016' : '#ff5757'

  const subjectMap: Record<string, string> = {
    approved: `Event update — we're finding vendors for ${companyName}`,
    declined: `Event update — ${companyName}`,
    cancelled: `Event cancelled — ${companyName}`,
    completed: `Event complete — ${companyName} on ${eventDate}`,
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: `${senderName} <updates@${senderDomain}>`,
      to: contactEmail,
      subject: subjectMap[eventStatus] || `Event update — ${companyName}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${accentColor};margin:0 0 8px">${companyName}</h2>
          <p style="color:#374151;margin:0 0 16px;font-size:16px">Hi ${contactName || 'there'},</p>
          <p style="color:#4b5563;line-height:1.6;margin:0 0 16px">
            ${message}
          </p>
          <p style="color:#9ca3af;font-size:13px;margin:16px 0 0;border-top:1px solid #e5e7eb;padding-top:16px">
            Event date: ${eventDate}
          </p>
          <p style="color:#6b7280;font-size:13px;margin:8px 0 0">
            Questions? Reply to this email and our team will help.
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error(`[complete-event] Failed to send ${eventStatus} email to organizer:`, err)
  }
}
