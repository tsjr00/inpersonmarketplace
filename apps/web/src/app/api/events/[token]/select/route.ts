import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors/with-error-tracing'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications/service'

/**
 * GET /api/events/[token]/select
 *
 * Loads event details + interested vendors for the organizer selection page.
 * Token-based access (no auth required — organizer may not have an account yet).
 * Only works for self-service events in 'ready' status (48hr threshold passed).
 *
 * POST /api/events/[token]/select
 *
 * Organizer submits their selected vendors. Triggers:
 * 1. Update selected vendors' market_vendors status
 * 2. Notify selected vendors to connect their catering menus
 * 3. Send organizer the event page link
 */

interface RouteContext {
  params: Promise<{ token: string }>
}

// GET — Load event + interested vendors for selection page
export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/select', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-select:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { token } = await context.params
    const serviceClient = createServiceClient()

    // Find the catering request by token
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('id, company_name, contact_name, contact_email, event_date, event_start_time, event_end_time, headcount, vendor_count, city, state, vertical_id, market_id, status, service_level')
      .eq('event_token', token)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (event.service_level !== 'self_service') {
      return NextResponse.json({ error: 'This event is managed by our team' }, { status: 403 })
    }

    // Allow selection in 'approved' or 'ready' status
    if (!['approved', 'ready'].includes(event.status)) {
      return NextResponse.json({ error: 'This event is not accepting selections at this time' }, { status: 400 })
    }

    if (!event.market_id) {
      return NextResponse.json({ error: 'Event not yet set up' }, { status: 400 })
    }

    // Get accepted vendors with profile data
    const { data: marketVendors } = await serviceClient
      .from('market_vendors')
      .select('vendor_profile_id, response_status, vendor_profiles:vendor_profile_id(id, profile_data, profile_image_url, average_rating, rating_count, tier, pickup_lead_minutes)')
      .eq('market_id', event.market_id)
      .eq('response_status', 'accepted')

    if (!marketVendors || marketVendors.length === 0) {
      return NextResponse.json({
        event: {
          id: event.id,
          event_date: event.event_date,
          headcount: event.headcount,
          vendor_count: event.vendor_count,
          city: event.city,
          state: event.state,
          status: event.status,
        },
        vendors: [],
      })
    }

    // Get catering listings for each vendor
    const vendorIds = marketVendors.map(mv => mv.vendor_profile_id)
    const { data: listings } = await serviceClient
      .from('listings')
      .select('vendor_profile_id, title, price_cents, category, listing_data')
      .in('vendor_profile_id', vendorIds)
      .eq('status', 'published')
      .is('deleted_at', null)

    // Build per-vendor listing data
    const vendorListings: Record<string, Array<{ title: string; price_cents: number }>> = {}
    const vendorCategories: Record<string, string[]> = {}
    const vendorPrices: Record<string, number[]> = {}

    if (listings) {
      for (const l of listings) {
        const vid = l.vendor_profile_id as string
        const ld = l.listing_data as Record<string, unknown> | null
        const isCatering = ld?.event_menu_item === true

        if (!vendorCategories[vid]) vendorCategories[vid] = []
        if (l.category && !vendorCategories[vid].includes(l.category as string)) {
          vendorCategories[vid].push(l.category as string)
        }

        if (!vendorPrices[vid]) vendorPrices[vid] = []
        if (l.price_cents) vendorPrices[vid].push(l.price_cents as number)

        if (isCatering) {
          if (!vendorListings[vid]) vendorListings[vid] = []
          vendorListings[vid].push({
            title: l.title as string,
            price_cents: (l.price_cents || 0) as number,
          })
        }
      }
    }

    const vendors = marketVendors.map(mv => {
      const vp = mv.vendor_profiles as unknown as {
        id: string
        profile_data: Record<string, unknown>
        profile_image_url: string | null
        average_rating: number | null
        rating_count: number
        tier: string
        pickup_lead_minutes: number
      } | null

      const pd = vp?.profile_data || {}
      const vid = mv.vendor_profile_id as string
      const prices = vendorPrices[vid] || []
      const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null

      return {
        vendor_profile_id: vid,
        business_name: (pd.business_name as string) || (pd.farm_name as string) || 'Vendor',
        cuisine_categories: vendorCategories[vid] || [],
        avg_price_cents: avgPrice,
        average_rating: vp?.average_rating || null,
        rating_count: vp?.rating_count || 0,
        tier: vp?.tier || 'free',
        pickup_lead_minutes: vp?.pickup_lead_minutes || 30,
        profile_image_url: vp?.profile_image_url || null,
        catering_items: vendorListings[vid] || [],
      }
    })

    return NextResponse.json({
      event: {
        id: event.id,
        event_date: event.event_date,
        headcount: event.headcount,
        vendor_count: event.vendor_count,
        city: event.city,
        state: event.state,
        status: event.status,
      },
      vendors,
    })
  })
}

// POST — Organizer submits truck selections
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/select', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-select-submit:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { token } = await context.params
    const serviceClient = createServiceClient()

    const body = await request.json()
    const {
      selected_vendor_ids,
      share_contact,
      organizer_contact_name,
      organizer_contact_phone,
      organizer_contact_email,
    } = body

    if (!Array.isArray(selected_vendor_ids) || selected_vendor_ids.length === 0) {
      return NextResponse.json({ error: 'Please select at least one vendor' }, { status: 400 })
    }

    const uniqueVendorIds = [...new Set(selected_vendor_ids as string[])]

    // Find the event
    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('id, company_name, contact_name, contact_email, event_date, headcount, vendor_count, city, state, vertical_id, market_id, event_token, status, service_level, vendor_preferences')
      .eq('event_token', token)
      .single()

    if (!event || event.service_level !== 'self_service') {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (!['approved', 'ready'].includes(event.status)) {
      return NextResponse.json({ error: 'Selections are no longer being accepted' }, { status: 400 })
    }

    if (!event.market_id) {
      return NextResponse.json({ error: 'Event not set up' }, { status: 400 })
    }

    if (uniqueVendorIds.length > event.vendor_count) {
      return NextResponse.json({ error: `Maximum ${event.vendor_count} vendors allowed` }, { status: 400 })
    }

    // Verify all selected vendors are actually accepted for this event
    const { data: validVendors } = await serviceClient
      .from('market_vendors')
      .select('vendor_profile_id')
      .eq('market_id', event.market_id)
      .eq('response_status', 'accepted')
      .in('vendor_profile_id', uniqueVendorIds)

    if (!validVendors || validVendors.length !== uniqueVendorIds.length) {
      return NextResponse.json({ error: 'One or more selected vendors are not available' }, { status: 400 })
    }

    // Mark non-selected accepted vendors as 'not_selected' (they stay as backups)
    const { data: allAccepted } = await serviceClient
      .from('market_vendors')
      .select('vendor_profile_id')
      .eq('market_id', event.market_id)
      .eq('response_status', 'accepted')

    if (allAccepted) {
      const notSelectedIds = allAccepted
        .map(mv => mv.vendor_profile_id as string)
        .filter(id => !uniqueVendorIds.includes(id))

      if (notSelectedIds.length > 0) {
        // Keep as accepted but mark as backup (they can still be escalated)
        await serviceClient
          .from('market_vendors')
          .update({ is_backup: true })
          .eq('market_id', event.market_id)
          .in('vendor_profile_id', notSelectedIds)
      }
    }

    // Update event status + store organizer contact preferences
    const updateData: Record<string, unknown> = { status: 'ready' }
    if (share_contact) {
      // Store organizer contact info in vendor_preferences JSONB for vendor access
      updateData.vendor_preferences = {
        ...(typeof event.vendor_preferences === 'object' && event.vendor_preferences ? event.vendor_preferences : {}),
        organizer_contact: {
          shared: true,
          name: organizer_contact_name || null,
          phone: organizer_contact_phone || null,
          email: organizer_contact_email || null,
        },
      }
    }
    // Atomic update — prevents double-submit from concurrent tabs
    const { data: updatedEvent } = await serviceClient
      .from('catering_requests')
      .update(updateData)
      .eq('id', event.id)
      .in('status', ['approved', 'ready'])
      .select('id')

    if (!updatedEvent || updatedEvent.length === 0) {
      return NextResponse.json({ error: 'Selections have already been submitted' }, { status: 409 })
    }

    // Notify selected vendors — prompt them to connect catering listings
    for (const vendorId of uniqueVendorIds) {
      const { data: vp } = await serviceClient
        .from('vendor_profiles')
        .select('user_id')
        .eq('id', vendorId)
        .single()

      if (vp?.user_id) {
        await sendNotification(vp.user_id as string, 'catering_vendor_invited', {
          companyName: 'Event Confirmed',
          headcount: event.headcount,
          eventDate: event.event_date,
          eventAddress: `${event.city}, ${event.state}`,
          vertical: event.vertical_id,
          marketId: event.market_id,
        }, { vertical: event.vertical_id })
      }
    }

    // Send organizer the event page link
    const { getAppUrl } = await import('@/lib/environment')
    const eventPageUrl = `${getAppUrl(event.vertical_id)}/${event.vertical_id}/events/${event.event_token}`

    // Generate QR code for event page URL
    let qrCodeDataUrl = ''
    try {
      const QRCode = await import('qrcode')
      qrCodeDataUrl = await QRCode.toDataURL(eventPageUrl, { width: 200, margin: 1 })
    } catch (qrErr) {
      console.error('[event-select] QR code generation failed:', qrErr)
    }

    // Get accepted vendor cuisine types for marketing copy
    const acceptedVendorData = validVendors || []
    // Build cuisine list from vendor categories (we already have this data)
    const cuisineTypes = new Set<string>()
    for (const vId of uniqueVendorIds) {
      // Quick lookup from the vendors we already fetched in GET
      const { data: vListings } = await serviceClient
        .from('listings')
        .select('category')
        .eq('vendor_profile_id', vId)
        .eq('status', 'published')
        .is('deleted_at', null)
        .limit(20)

      if (vListings) {
        for (const l of vListings) {
          if (l.category) cuisineTypes.add(l.category as string)
        }
      }
    }
    const cuisineList = Array.from(cuisineTypes).slice(0, 5).join(', ') || 'a variety of food options'

    // Send confirmation email with QR code + marketing kit
    try {
      const isFM = event.vertical_id === 'farmers_market'
      const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
      const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
      const accentColor = isFM ? '#2d5016' : '#ff5757'
      const vendorLabel = isFM ? 'vendor' : 'food truck'

      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)

      await resend.emails.send({
        from: `${senderName} <updates@${senderDomain}>`,
        to: event.contact_email,
        subject: `Your event is confirmed — ${uniqueVendorIds.length} ${vendorLabel}${uniqueVendorIds.length > 1 ? 's' : ''} ready!`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:${accentColor};margin:0 0 8px">Your Event Is Confirmed!</h2>
            <p style="color:#374151;margin:0 0 16px">Hi ${event.contact_name || 'there'},</p>
            <p style="color:#4b5563;line-height:1.6;margin:0 0 20px">
              Your ${uniqueVendorIds.length} selected ${vendorLabel}${uniqueVendorIds.length > 1 ? 's are' : ' is'} confirmed for
              <strong>${event.event_date}</strong>. They&rsquo;re connecting their menus to your event page now.
            </p>

            <!-- Event Page Link + QR Code -->
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:0 0 24px;text-align:center">
              <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#374151">Share this with your guests:</p>
              ${qrCodeDataUrl ? `<img src="${qrCodeDataUrl}" alt="QR Code" style="width:160px;height:160px;margin:0 auto 12px;display:block" />` : ''}
              <a href="${eventPageUrl}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;margin:0 0 8px">
                View Event Page
              </a>
              <p style="margin:8px 0 0;font-size:12px;color:#6b7280;word-break:break-all">${eventPageUrl}</p>
            </div>

            <!-- Marketing Kit -->
            <h3 style="color:${accentColor};margin:0 0 12px;font-size:16px">Your Event Marketing Kit</h3>
            <p style="color:#6b7280;font-size:13px;margin:0 0 16px">Copy and use the text below to promote your event. The more people who pre-order, the faster the service and the better the experience for everyone.</p>

            <!-- Email Template -->
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 16px">
              <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin:0 0 8px">EMAIL TO STAFF / ATTENDEES</div>
              <div style="font-size:13px;color:#374151;line-height:1.6">
                <p style="margin:0 0 8px"><strong>Subject:</strong> Food at our upcoming event — pre-order now!</p>
                <p style="margin:0 0 8px">We&rsquo;ve arranged ${vendorLabel}s for our event on ${event.event_date} featuring ${cuisineList}.</p>
                <p style="margin:0 0 8px"><strong>Pre-order your meal ahead of time and skip the line!</strong> Browse menus, pick what you want, and it&rsquo;ll be ready when you arrive. More time enjoying the event, less time waiting.</p>
                <p style="margin:0">Order here: ${eventPageUrl}</p>
              </div>
            </div>

            <!-- Social Media Blurb -->
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 16px">
              <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin:0 0 8px">SOCIAL MEDIA POST</div>
              <div style="font-size:13px;color:#374151;line-height:1.6">
                <p style="margin:0">${isFM ? 'Fresh food vendors' : 'Food trucks'} at our event on ${event.event_date}! Pre-order your meal and skip the line &rarr; ${eventPageUrl}</p>
              </div>
            </div>

            <!-- Signage Text -->
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 16px">
              <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin:0 0 8px">DAY-OF SIGNAGE (near ${vendorLabel} area)</div>
              <div style="font-size:13px;color:#374151;line-height:1.6">
                <p style="margin:0 0 4px;font-size:16px;font-weight:700">Skip the line!</p>
                <p style="margin:0">Scan the QR code or visit the link to pre-order your meal. Faster service, more time to enjoy the event.</p>
              </div>
            </div>

            <!-- Tips -->
            <h3 style="color:${accentColor};margin:0 0 8px;font-size:14px">Tips for Maximum Pre-Orders</h3>
            <ul style="color:#4b5563;line-height:1.8;padding-left:20px;margin:0 0 20px;font-size:13px">
              <li>Share the link 3-5 days before the event for best results</li>
              <li>Include the QR code on any printed materials or digital signage</li>
              <li>Highlight the benefit: &ldquo;Pre-order and skip the line!&rdquo;</li>
              <li>For ticketed events: include the link in ticket confirmation emails</li>
              <li>Post a reminder the day before: &ldquo;Last chance to pre-order!&rdquo;</li>
            </ul>

            <p style="color:#6b7280;font-size:13px;margin:0;border-top:1px solid #e5e7eb;padding-top:16px">
              Questions? Reply to this email.
            </p>
          </div>
        `,
      })
    } catch (emailErr) {
      console.error('[event-select] Failed to send confirmation email:', emailErr)
    }

    return NextResponse.json({
      ok: true,
      message: 'Vendors confirmed! Event page link sent to your email.',
      event_page_url: eventPageUrl,
    })
  })
}
