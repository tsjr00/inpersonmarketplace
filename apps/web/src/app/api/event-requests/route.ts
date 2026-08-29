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
import { leadTimeStatus, tooSoonMessage } from '@/lib/events/lead-time'
import { term } from '@/lib/vertical/terminology'
import { observed } from '@/lib/errors'

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
      company_max_per_attendee_cents,
      event_setting,
      // Set by the client when the chosen date falls inside the rushed window.
      // Not persisted — its only job is to prove the organizer saw the warning.
      rushed_acknowledged,
    } = body

    // Validate vertical
    const allowedVerticals = ['food_trucks', 'farmers_market']
    const verticalId = allowedVerticals.includes(vertical) ? vertical : 'food_trucks'

    // Validate required fields.
    // `address` is REQUIRED as of 2026-08-08. It was optional here while
    // api/admin/events/[id] refused to approve without it — a field required
    // downstream but optional upstream, with no editor in between, which is the
    // exact shape that produced the "stuck event" deadlock. Optional-here is now
    // closed; the editor gap is closed separately (lib/events/event-ref.ts).
    if (
      !company_name ||
      !contact_name ||
      !contact_email ||
      !event_type ||
      !event_date ||
      !event_start_time ||
      !event_end_time ||
      !headcount ||
      !address ||
      !String(address).trim() ||
      !city ||
      !state ||
      !zip ||
      !event_setting ||
      !preferred_vendor_categories ||
      !Array.isArray(preferred_vendor_categories) ||
      preferred_vendor_categories.length === 0
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

    // Validate event_setting value
    if (!['indoor', 'outdoor', 'either'].includes(event_setting)) {
      return NextResponse.json(
        { error: 'event_setting must be indoor, outdoor, or either' },
        { status: 400 }
      )
    }

    // Validate event_type value
    const validEventTypeValues = ['corporate_lunch', 'team_building', 'grand_opening', 'festival', 'private_party', 'other']
    if (!validEventTypeValues.includes(event_type)) {
      return NextResponse.json(
        { error: 'Invalid event_type' },
        { status: 400 }
      )
    }

    // Validate event time range
    {
      const startParts = String(event_start_time).split(':').map(Number)
      const endParts = String(event_end_time).split(':').map(Number)
      if (startParts.length < 2 || endParts.length < 2 || startParts.some(isNaN) || endParts.some(isNaN)) {
        return NextResponse.json(
          { error: 'Invalid event time format' },
          { status: 400 }
        )
      }
      const startMin = startParts[0] * 60 + startParts[1]
      const endMin = endParts[0] * 60 + endParts[1]
      if (endMin <= startMin) {
        return NextResponse.json(
          { error: 'Event end time must be after start time' },
          { status: 400 }
        )
      }
    }

    // ── Event date: minimum lead time, two thresholds ──
    //
    // Replaces a bare "not in the past" check. See lib/events/lead-time.ts for
    // why: lead time is a revenue lever (no runway, no pre-orders, and
    // pre-orders are what we earn on) and the cheapest layer of late-change
    // protection, because the organizer who booked too soon is the one who then
    // has to move the date.
    const leadStatus = leadTimeStatus(event_date)
    if (leadStatus === 'invalid') {
      return NextResponse.json({ error: 'Please enter a valid event date' }, { status: 400 })
    }
    if (leadStatus === 'too_soon') {
      return NextResponse.json({ error: tooSoonMessage() }, { status: 400 })
    }
    if (leadStatus === 'rushed' && rushed_acknowledged !== true) {
      // The UI collects this acknowledgment; the server requires it so the two
      // cannot drift. Not a security boundary — a consistency one.
      return NextResponse.json(
        {
          error: 'Please confirm you understand the short turnaround before submitting.',
          rushed_acknowledgment_required: true,
        },
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
    const { data: conflictingVendor } = await observed(supabaseService
      .from('vendor_profiles')
      .select('id')
      .eq('vertical_id', verticalId)
      .eq('status', 'approved')
      .filter('profile_data->>email', 'ilike', contact_email.toLowerCase().trim())
      .limit(1)
      .maybeSingle(), { table: 'vendor_profiles' })

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
        event_type,
        payment_model: payment_model && validPaymentModels.includes(payment_model) ? payment_model : null,
        event_date,
        event_end_date: event_end_date || null,
        event_start_time,
        event_end_time,
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
        preferred_vendor_categories,
        // Required at intake since 2026-08-08 (validated above) AND required to
        // advance to 'approved' (admin/events PATCH). The null branch is kept
        // only because historical rows have NULL here.
        address: address ? String(address).slice(0, 500) : null,
        city: String(city).slice(0, 100),
        state: String(state).slice(0, 50),
        zip: String(zip).slice(0, 10),
        event_setting,
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
        company_max_per_attendee_cents: (payment_model === 'hybrid' && typeof company_max_per_attendee_cents === 'number' && company_max_per_attendee_cents > 0)
          ? company_max_per_attendee_cents : null,
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

    // Self-service: auto-approve → auto-match → auto-invite (no admin involvement).
    // Address is required for status to advance to 'approved' (matches admin gate).
    // If organizer skipped optional address at Stage 1, self-service skips auto-approval
    // and leaves the request in 'new' state. Organizer can fill in address from their
    // dashboard, then admin or a follow-up flow can approve.
    const hasAddress = address && String(address).trim().length > 0
    // Self-service with no address never auto-approves and never notifies anyone —
    // so the organizer confirmation + response message must NOT claim matching is
    // underway (G5 fix). needsAddress drives the corrected copy on both surfaces.
    const needsAddress = Boolean(isSelfService && !hasAddress)
    if (needsAddress) {
      console.log(`[self-service] Event ${requestId}: address missing — skipping auto-approval`)
    }

    // The number shown on the confirmation screen. Null means matching never ran
    // (full-service, or self-service with no address yet) — in that case we show
    // NO number rather than inventing one.
    //
    // ⚠ Until 2026-08-08 this was a count of every event_approved vendor in the
    // vertical, displayed as "N qualified <vendors> found in your area". Neither
    // clause was true: no criteria were applied and there was no location
    // predicate. The real scored+filtered count was computed by
    // autoMatchAndInvite moments later and thrown away to a console.log.
    let matchedCount: number | null = null

    if (isSelfService && hasAddress) {
      const requestData = {
        id: requestId,
        vertical_id: verticalId,
        company_name: String(company_name),
        event_date,
        event_end_date: event_end_date || null,
        event_start_time,
        event_end_time,
        headcount: hc,
        expected_meal_count: expected_meal_count ? parseInt(expected_meal_count, 10) : null,
        address: address ? String(address) : '',
        city: String(city),
        state: String(state),
        zip: String(zip),
        vendor_count: vendor_count ? Math.min(parseInt(vendor_count, 10) || 2, 20) : 2,
        cuisine_preferences: cuisine_preferences ? String(cuisine_preferences) : null,
        event_type,
        event_setting,
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
        const approvalUpdate: Record<string, unknown> = {
          status: 'approved',
          market_id: approval.market_id,
          event_token: approval.event_token,
        }
        if (approval.access_code) {
          approvalUpdate.access_code = approval.access_code
        }
        await supabase
          .from('catering_requests')
          .update(approvalUpdate)
          .eq('id', requestId)

        // Step 2: Auto-match and invite vendors
        const inviteResult = await autoMatchAndInvite(supabase, requestData, approval.market_id)

        // This is the honest match number: scored against the organizer's own
        // criteria, red flags and deal-breakers dropped, below-threshold scores
        // dropped, capped at MAX_AUTO_INVITE. At intake there are no prior
        // invitations, so `matched` and `invited` agree.
        matchedCount = inviteResult.matched

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
        isSelfService,
        needsAddress
      ),
    ])

    const vendorWord = verticalId === 'farmers_market' ? 'vendors' : 'food trucks'

    // `match_count` is null when matching never ran, and a real scored count
    // otherwise. The client MUST distinguish the two — null means "say nothing",
    // 0 means "we looked and found none, here is how to widen it". Coercing
    // null to 0 would turn silence into a false negative.
    return NextResponse.json({
      ok: true,
      match_count: matchedCount,
      message: needsAddress
        ? `Got your request for ${String(company_name)}! One step left before we notify ${vendorWord}: add your event address from your dashboard.`
        : matchedCount === null
        ? `Got your request for ${String(company_name)}! Our team will review it and be in touch.`
        : matchedCount > 0
        ? `We matched ${matchedCount} ${matchedCount === 1 ? vendorWord.replace(/s$/, '') : vendorWord} to your event and invited them just now — they typically respond within 48 hours.`
        : `Your event is live, but no ${vendorWord} matched your exact criteria yet. Sign in to widen your criteria and reach more ${vendorWord}.`,
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
  const requestType = `${term(verticalId, 'event_request_name_suffix')} Request`

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
  isSelfService: boolean = false,
  needsAddress: boolean = false
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
      Our system is matching your request with qualified vendors right now based on the event details you provided and confirming their interest and availability. As available vendors respond you will be updated. We aim to have all available vendors respond within 48 hours and then present you with information about the items they will offer at your event, as well as details about their space &amp; setup needs.
    </p>
    <p style="color:#4b5563;line-height:1.7;margin:0 0 16px">
      Please create an account using the link below so you can see your event details before they are published, and you can start sharing your event page. On your user dashboard you will find a section titled &ldquo;My Events&rdquo; that will have all the information you need to make your final selections for which vendors you want at your event. Please watch your inbox as well as your in-app notifications for additional information.
    </p>
  `

  // Self-service submitted with NO address — nothing was matched or notified.
  // Tell the organizer the truth + the exact next step (G5 fix).
  const needsAddressBody = `
    <p style="color:#4b5563;line-height:1.7;margin:0 0 16px">
      Thank you for choosing ${serviceName} for your event.
    </p>
    <p style="color:#4b5563;line-height:1.7;margin:0 0 16px">
      Before we can start notifying ${vendorWord}, we need your event&rsquo;s address — that&rsquo;s how we match nearby ${vendorWord} and tell them where to go. Create your account with the link below, add your event address from the &ldquo;My Events&rdquo; section of your dashboard, and we&rsquo;ll start matching right away.
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
          ${needsAddress ? needsAddressBody : isSelfService ? (isFM ? selfServiceBodyFM : selfServiceBodyFT) : managedBody}
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
