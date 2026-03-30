import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/vendor/events/[marketId]/message
 *
 * Vendor sends a message to the event organizer via platform relay.
 * The message is sent as an email FROM the platform (not from vendor's personal email).
 * This keeps the organizer's email private if they didn't opt into direct contact sharing.
 *
 * Body: { message: string (required, 10-1000 chars) }
 */

interface RouteContext {
  params: Promise<{ marketId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/events/[marketId]/message', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-event-msg:${clientIp}`, { limit: 5, windowSeconds: 3600 })
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { marketId } = await context.params
    const body = await request.json()
    const { message } = body

    if (!message || typeof message !== 'string' || message.trim().length < 10 || message.trim().length > 1000) {
      return NextResponse.json(
        { error: 'Message must be between 10 and 1000 characters' },
        { status: 400 }
      )
    }

    // Content moderation
    const { isProfane } = await import('@/lib/content-moderation')
    if (isProfane(message)) {
      return NextResponse.json({ error: 'Message contains inappropriate language. Please revise.' }, { status: 400 })
    }

    // Get vendor profile
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, profile_data')
      .eq('user_id', user.id)
      .single()

    if (!vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    const serviceClient = createServiceClient()

    // Verify vendor is accepted for this event
    const { data: marketVendor } = await serviceClient
      .from('market_vendors')
      .select('response_status')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (!marketVendor || marketVendor.response_status !== 'accepted') {
      return NextResponse.json(
        { error: 'You must be an accepted vendor for this event to send messages' },
        { status: 403 }
      )
    }

    // Get event details + organizer contact
    const { data: market } = await serviceClient
      .from('markets')
      .select('name, catering_request_id, vertical_id')
      .eq('id', marketId)
      .single()

    if (!market?.catering_request_id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { data: cReq } = await serviceClient
      .from('catering_requests')
      .select('contact_email, contact_name, event_date')
      .eq('id', market.catering_request_id)
      .single()

    if (!cReq?.contact_email) {
      return NextResponse.json({ error: 'Event organizer contact not available' }, { status: 404 })
    }

    const profileData = vendorProfile.profile_data as Record<string, unknown>
    const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'A food truck vendor'

    // Send the message via email relay
    const isFM = market.vertical_id === 'farmers_market'
    const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
    const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
    const accentColor = isFM ? '#2d5016' : '#ff5757'

    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)

      await resend.emails.send({
        from: `${senderName} <updates@${senderDomain}>`,
        to: cReq.contact_email,
        subject: `Message from ${vendorName} about your event`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:${accentColor};margin:0 0 8px">Message from a Vendor</h2>
            <p style="color:#374151;margin:0 0 16px">Hi ${cReq.contact_name || 'there'},</p>
            <p style="color:#4b5563;margin:0 0 8px">
              <strong>${vendorName}</strong> sent you a message about your event on <strong>${cReq.event_date}</strong>:
            </p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 20px">
              <p style="margin:0;color:#374151;line-height:1.6;white-space:pre-wrap">${message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            </div>
            <p style="color:#6b7280;font-size:13px;margin:0;border-top:1px solid #e5e7eb;padding-top:16px">
              This message was sent through ${senderName}. Reply to this email if you&rsquo;d like to respond.
            </p>
          </div>
        `,
      })
    } catch (emailErr) {
      console.error('[vendor-event-message] Failed to send relay email:', emailErr)
      return NextResponse.json({ error: 'Failed to send message. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: 'Message sent to event organizer.',
    })
  })
}
