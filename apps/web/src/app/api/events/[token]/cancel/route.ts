import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications/service'

/**
 * POST /api/events/[token]/cancel
 *
 * Organizer cancels their own event. Authenticated via organizer_user_id
 * on catering_requests (not admin role).
 *
 * Cleanup: status → cancelled, listing_markets deleted, admin + vendors notified.
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
      .select('id, market_id, organizer_user_id, contact_email, company_name, vertical_id, status')
      .eq('event_token', token)
      .single()

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

      // Notify accepted vendors
      const { data: acceptedVendors } = await serviceClient
        .from('market_vendors')
        .select('vendor_profile_id')
        .eq('market_id', event.market_id)
        .eq('response_status', 'accepted')

      if (acceptedVendors && acceptedVendors.length > 0) {
        const vendorNotifications = acceptedVendors.map(v =>
          sendNotification(v.vendor_profile_id, 'catering_vendor_responded', {
            companyName: event.company_name,
            responseAction: 'has been cancelled by the organizer',
            eventDate: event.company_name,
          }, { vertical: event.vertical_id }).catch(err =>
            console.error(`[event-cancel] Vendor notification failed for ${v.vendor_profile_id}:`, err)
          )
        )
        await Promise.all(vendorNotifications)
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
