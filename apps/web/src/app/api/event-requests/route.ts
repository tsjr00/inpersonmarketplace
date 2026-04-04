import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIp,
  rateLimits,
  rateLimitResponse,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors/with-error-tracing'
import { approveEventRequest, autoMatchAndInvite } from '@/lib/events/event-actions'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/event-requests', 'POST', async () => {
    // Rate limit: submit preset (10/60s per IP)
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(
      `catering-request:${clientIp}`,
      rateLimits.submit
    )
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const body = await request.json()
    const {
      company_name,
      contact_name,
      contact_email,
      contact_phone,
      event_type,
      payment_model,
      event_date,
      event_end_date,
      event_start_time,
      event_end_time,
      headcount,
      expected_meal_count,
      total_food_budget_cents,
      per_meal_budget_cents,
      has_competing_vendors,
      competing_food_options,
      is_ticketed,
      estimated_dwell_hours,
      children_present,
      is_themed,
      theme_description,
      estimated_spend_per_attendee_cents,
      preferred_vendor_categories,
      address,
      city,
      state,
      zip,
      cuisine_preferences,
      dietary_notes,
      budget_notes,
      beverages_provided,
      dessert_provided,
      vendor_count,
      setup_instructions,
      additional_notes,
      is_recurring,
      recurring_frequency,
      service_level,
      vendor_preferences,
      vertical,
      cutoff_hours,
      event_allow_day_of_orders,
      vendor_stay_policy,
    } = body

    // Validate vertical
    const allowedVerticals = ['food_trucks', 'farmers_market']
    const verticalId = allowedVerticals.includes(vertical) ? vertical : 'food_trucks'

    // Validate required fields
    if (
      !company_name ||
      !contact_name ||
      !contact_email ||
      !event_date ||
      !headcount ||
      !city ||
      !state
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validate event_date is not in the past
    const eventDateObj = new Date(event_date + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (isNaN(eventDateObj.getTime()) || eventDateObj < today) {
      return NextResponse.json(
        { error: 'Event date must be today or in the future' },
        { status: 400 }
      )
    }

    // Validate headcount
    const hc = parseInt(headcount, 10)
    if (isNaN(hc) || hc < 10 || hc > 5000) {
      return NextResponse.json(
        { error: 'Headcount must be between 10 and 5000' },
        { status: 400 }
      )
    }

    // Prevent vendor-as-organizer conflict: vendors must use a different email to request events
    const supabaseService = createServiceClient()
    const { data: conflictingVendor } = await supabaseService
      .from('vendor_profiles')
      .select('id')
      .eq('vertical_id', verticalId)
      .eq('status', 'approved')
      .filter('profile_data->>email', 'ilike', contact_email.toLowerCase().trim())
      .limit(1)
      .maybeSingle()

    if (conflictingVendor) {
      return NextResponse.json(
        { error: "It looks like you're already a vendor on this platform. To request an event as an organizer, please use a different email address. This keeps your vendor account and event organizer role separate." },
        { status: 400 }
      )
    }

    // Content moderation on text fields
    const { checkFields } = await import('@/lib/content-moderation')
    const modCheck = checkFields({
      company_name: company_name,
      contact_name: contact_name,
      cuisine_preferences: cuisine_preferences,
      dietary_notes: dietary_notes,
      budget_notes: budget_notes,
      setup_instructions: setup_instructions,
      additional_notes: additional_notes,
      theme_description: theme_description,
      competing_food_options: competing_food_options,
    })
    if (!modCheck.passed) {
      return NextResponse.json({ error: modCheck.reason }, { status: 400 })
    }

    // Use service client (public form, no auth required)
    const supabase = createServiceClient()

    // Validate new structured fields
    const validEventTypes = ['corporate_lunch', 'team_building', 'grand_opening', 'festival', 'private_party', 'other']
    const validPaymentModels = ['company_paid', 'attendee_paid', 'hybrid']
    const validRecurringFreqs = ['weekly', 'biweekly', 'monthly', 'quarterly']

    const { data: insertedRow, error: insertError } = await supabase
      .from('catering_requests')
      .insert({
        vertical_id: verticalId,
        company_name: String(company_name).slice(0, 200),
        contact_name: String(contact_name).slice(0, 200),
        contact_email: String(contact_email).toLowerCase().slice(0, 320),
        contact_phone: contact_phone
          ? String(contact_phone).slice(0, 30)
          : null,
        event_type: event_type && validEventTypes.includes(event_type) ? event_type : null,
        payment_model: payment_model && validPaymentModels.includes(payment_model) ? payment_model : null,
        event_date,
        event_end_date: event_end_date || null,
        event_start_time: event_start_time || null,
        event_end_time: event_end_time || null,
        headcount: hc,
        expected_meal_count: expected_meal_count ? Math.min(Math.max(parseInt(expected_meal_count, 10) || 0, 0), 5000) : null,
        total_food_budget_cents: total_food_budget_cents ? Math.max(parseInt(total_food_budget_cents, 10) || 0, 0) : null,
        per_meal_budget_cents: per_meal_budget_cents ? Math.max(parseInt(per_meal_budget_cents, 10) || 0, 0) : null,
        has_competing_vendors: !!has_competing_vendors,
        competing_food_options: has_competing_vendors && competing_food_options ? String(competing_food_options).slice(0, 500) : null,
        is_ticketed: !!is_ticketed,
        estimated_dwell_hours: estimated_dwell_hours ? Math.min(Math.max(parseFloat(estimated_dwell_hours) || 0, 0), 24) : null,
        children_present: !!children_present,
        is_themed: !!is_themed,
        theme_description: is_themed && theme_description ? String(theme_description).slice(0, 500) : null,
        estimated_spend_per_attendee_cents: estimated_spend_per_attendee_cents ? Math.max(parseInt(estimated_spend_per_attendee_cents, 10) || 0, 0) : null,
        preferred_vendor_categories: Array.isArray(preferred_vendor_categories) ? preferred_vendor_categories : null,
        address: String(address).slice(0, 500),
        city: String(city).slice(0, 100),
        state: String(state).slice(0, 50),
        zip: String(zip).slice(0, 10),
        cuisine_preferences: cuisine_preferences
          ? String(cuisine_preferences).slice(0, 500)
          : null,
        dietary_notes: dietary_notes
          ? String(dietary_notes).slice(0, 500)
          : null,
        budget_notes: budget_notes
          ? String(budget_notes).slice(0, 500)
          : null,
        beverages_provided: !!beverages_provided,
        dessert_provided: !!dessert_provided,
        vendor_count: vendor_count ? Math.min(parseInt(vendor_count, 10) || 2, 20) : 2,
        setup_instructions: setup_instructions
          ? String(setup_instructions).slice(0, 1000)
          : null,
        additional_notes: additional_notes
          ? String(additional_notes).slice(0, 2000)
          : null,
        is_recurring: !!is_recurring,
        recurring_frequency: is_recurring && recurring_frequency && validRecurringFreqs.includes(recurring_frequency)
          ? recurring_frequency : null,
        service_level: service_level === 'self_service' ? 'self_service' : 'full_service',
        vendor_preferences: Array.isArray(vendor_preferences) ? vendor_preferences : null,
        vendor_stay_policy: ['may_leave_when_sold_out', 'stay_full_event', 'vendor_discretion'].includes(vendor_stay_policy)
          ? vendor_stay_policy : null,
      })
      .select('id')
      .single()

    if (insertError || !insertedRow) {
      console.error('[catering-requests] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save your request. Please try again.' },
        { status: 500 }
      )
    }

    const requestId = (insertedRow as { id: string }).id
    const isSelfService = service_level === 'self_service'

    // Self-service: auto-approve → auto-match → auto-invite (no admin involvement)
    if (isSelfService) {
      const requestData = {
        id: requestId,
        vertical_id: verticalId,
        company_name: String(company_name),
        event_date,
        event_end_date: event_end_date || null,
        event_start_time: event_start_time || null,
        event_end_time: event_end_time || null,
        headcount: hc,
        expected_meal_count: expected_meal_count ? parseInt(expected_meal_count, 10) : null,
        address: String(address),
        city: String(city),
        state: String(state),
        zip: String(zip),
        vendor_count: vendor_count ? Math.min(parseInt(vendor_count, 10) || 2, 20) : 2,
        cuisine_preferences: cuisine_preferences ? String(cuisine_preferences) : null,
        event_type: event_type || null,
        payment_model: payment_model || null,
        children_present: !!children_present,
        contact_email: String(contact_email).toLowerCase().trim(),
        cutoff_hours: cutoff_hours ? Math.min(Math.max(parseInt(cutoff_hours, 10) || 24, 12), 168) : 24,
        event_allow_day_of_orders: !!event_allow_day_of_orders,
      }

      // Step 1: Auto-approve (create market + token + schedule)
      const approval = await approveEventRequest(supabase, requestData)

      if (approval.success && approval.market_id && approval.event_token) {
        // Update the catering request with approval data
        await supabase
          .from('catering_requests')
          .update({
            status: 'approved',
            market_id: approval.market_id,
            event_token: approval.event_token,
          })
          .eq('id', requestId)

        // Step 2: Auto-match and invite vendors
        const inviteResult = await autoMatchAndInvite(supabase, requestData, approval.market_id)

        // Track when auto-invites were sent (for cron threshold check)
        if (inviteResult.invited > 0) {
          await supabase
            .from('catering_requests')
            .update({ auto_invite_sent_at: new Date().toISOString() })
            .eq('id', requestId)
        }

        console.log(`[self-service] Event ${requestId}: approved, ${inviteResult.invited} vendors invited (${inviteResult.matched} matched)`)
      } else {
        console.error(`[self-service] Event ${requestId}: auto-approval failed:`, approval.error)
        // Request stays as 'new' — admin will need to handle manually
      }
    }

    // Send emails (both service levels get confirmation)
    // Full service: admin gets notification to review
    // Self service: admin gets FYI notification, organizer gets "invitations sent" message
    await Promise.all([
      sendAdminEmail(
        String(company_name),
        String(contact_name),
        String(contact_email),
        contact_phone ? String(contact_phone) : '',
        event_date,
        hc,
        String(address),
        String(city),
        String(state),
        verticalId,
        isSelfService
      ),
      sendOrganizerConfirmation(
        String(contact_name),
        String(contact_email),
        String(company_name),
        event_date,
        hc,
        String(city),
        String(state),
        verticalId,
        isSelfService
      ),
    ])

    // Get preliminary vendor match count for confirmation screen
    const { count: matchCount } = await supabaseService
      .from('vendor_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('vertical_id', verticalId)
      .eq('status', 'approved')
      .eq('event_approved', true)
      .is('deleted_at', null)

    const vendorWord = verticalId === 'farmers_market' ? 'vendors' : 'food trucks'

    return NextResponse.json({
      ok: true,
      match_count: matchCount || 0,
      message: isSelfService
        ? (verticalId === 'farmers_market'
          ? "Your event request is live! We're notifying qualified vendors now. You'll hear back within 48 hours."
          : "Your event request is live! We're notifying qualified food trucks now. You'll hear back within 48 hours.")
        : `We found ${matchCount || 0} qualified ${vendorWord} in your area. Sign in to your event dashboard to refine your matches and start planning.`,
    })
  })
}

async function sendAdminEmail(
  companyName: string,
  contactName: string,
  contactEmail: string,
  contactPhone: string,
  eventDate: string,
  headcount: number,
  address: string,
  city: string,
  state: string,
  verticalId: string,
  isSelfService: boolean = false
) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL
  const apiKey = process.env.RESEND_API_KEY
  if (!adminEmail || !apiKey) return

  const isFM = verticalId === 'farmers_market'
  const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
  const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
  const accentColor = isFM ? '#2d5016' : '#ff5757'
  const requestType = isFM ? 'Pop-Up Market Request' : 'Event Request'

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: `${senderName} <updates@${senderDomain}>`,
      to: adminEmail,
      subject: `${isSelfService ? '[Self-Service] ' : ''}New ${requestType}: ${companyName} (${headcount} people)`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${accentColor};margin:0 0 16px">New ${requestType}</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;width:140px">Company</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(companyName)}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Contact</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(contactName)}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee"><a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a></td></tr>
            ${contactPhone ? `<tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Phone</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(contactPhone)}</td></tr>` : ''}
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Event Date</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(eventDate)}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Headcount</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${headcount} people</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Location</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(address)}, ${escapeHtml(city)}, ${escapeHtml(state)}</td></tr>
          </table>
          <p style="margin-top:16px;color:#737373;font-size:13px">Review this request in the admin dashboard.</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[catering-requests] Failed to send admin email:', err)
  }
}

async function sendOrganizerConfirmation(
  contactName: string,
  contactEmail: string,
  companyName: string,
  eventDate: string,
  headcount: number,
  city: string,
  state: string,
  verticalId: string,
  isSelfService: boolean = false
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const isFM = verticalId === 'farmers_market'
  const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
  const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
  const accentColor = isFM ? '#2d5016' : '#ff5757'
  const serviceName = isFM ? 'Farmers Marketing' : "Food Truck'n"
  const eventType = isFM ? 'Market event' : 'Food truck event'
  const vendorWord = isFM ? 'vendors' : 'food trucks'
  const { getAppUrl } = await import('@/lib/environment')
  const signupUrl = `${getAppUrl(verticalId)}/${verticalId}/signup?ref=event&email=${encodeURIComponent(contactEmail)}`

  const selfServiceBodyFT = `
    <p style="color:#4b5563;line-height:1.7;margin:0 0 16px">
      Thank you for choosing Food Truck'n to help with your event.
    </p>
    <p style="color:#4b5563;line-height:1.7;margin:0 0 16px">
      Our system is matching your request with qualified food trucks right now based on the event details you provided and confirming their interest and availability. As available trucks respond you will be updated. We aim to have all available trucks respond within 48 hours and then present you with the menu options and details of the available trucks.
    </p>
    <p style="color:#4b5563;line-height:1.7;margin:0 0 16px">
      Please create an account using the link below so you can see your event details before they are published, and you can start sharing your event page. On your user dashboard you will find a section titled &ldquo;My Events&rdquo; that will have all the information you need to make your final selections for which truck you want at your event. Please watch your inbox as well as your in-app notifications for additional information.
    </p>
  `

  const selfServiceBodyFM = `
    <p style="color:#4b5563;line-height:1.7;margin:0 0 16px">
      Thank you for choosing Farmers Marketing to help with your event.
    </p>
    <p style="color:#4b5563;line-height:1.7;margin:0 0 16px">
      Our system is matching your request with qualified vendors right now based on the event details you provided and confirming their interest and availability. As available vendors respond you will be updated. We aim to have all available vendors respond within 48 hours and then present you with information about the items they will offer at the popup market, as well as details about their space &amp; setup needs.
    </p>
    <p style="color:#4b5563;line-height:1.7;margin:0 0 16px">
      Please create an account using the link below so you can see your event details before they are published, and you can start sharing your event page. On your user dashboard you will find a section titled &ldquo;My Events&rdquo; that will have all the information you need to make your final selections for which vendors you want at your event. Please watch your inbox as well as your in-app notifications for additional information.
    </p>
  `

  const managedBody = `
    <p style="color:#4b5563;line-height:1.7;margin:0 0 16px">
      Thank you for choosing ${serviceName} to help with your event. Our team will review your request and personally coordinate ${vendorWord} selection, logistics, and day-of support.
    </p>
    <ol style="color:#4b5563;line-height:1.8;padding-left:20px;margin:0 0 20px">
      <li>Our team reviews your request (typically within 24 hours)</li>
      <li>We match event-approved ${vendorWord} to your needs</li>
      <li>You&rsquo;ll receive vendor recommendations with details and pricing</li>
      <li>Once confirmed, your guests can pre-order online for a seamless experience</li>
    </ol>
  `

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: `${senderName} <updates@${senderDomain}>`,
      to: contactEmail,
      subject: `We received your ${eventType} request — ${companyName}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${accentColor};margin:0 0 8px">We received your request!</h2>
          <p style="color:#374151;margin:0 0 20px;font-size:16px">Hi ${escapeHtml(contactName)},</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 20px">
            <table style="border-collapse:collapse;width:100%">
              <tr><td style="padding:6px 0;font-weight:600;color:#374151;width:120px">Company</td><td style="padding:6px 0;color:#4b5563">${escapeHtml(companyName)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;color:#374151">Event Date</td><td style="padding:6px 0;color:#4b5563">${escapeHtml(eventDate)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;color:#374151">Headcount</td><td style="padding:6px 0;color:#4b5563">${headcount} people</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;color:#374151">Location</td><td style="padding:6px 0;color:#4b5563">${escapeHtml(city)}, ${escapeHtml(state)}</td></tr>
            </table>
          </div>
          ${isSelfService ? (isFM ? selfServiceBodyFM : selfServiceBodyFT) : managedBody}
          <div style="text-align:center;margin:0 0 20px">
            <a href="${signupUrl}" style="display:inline-block;padding:12px 32px;background:${accentColor};color:white;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px">
              Create Your Account
            </a>
          </div>
          <p style="color:#6b7280;font-size:13px;margin:0;border-top:1px solid #e5e7eb;padding-top:16px">
            Questions? Reply to this email or visit our <a href="https://${isFM ? 'farmersmarketing.app' : 'foodtruckn.app'}/${verticalId}/support" style="color:${accentColor}">support page</a>.
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[catering-requests] Failed to send organizer confirmation:', err)
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
