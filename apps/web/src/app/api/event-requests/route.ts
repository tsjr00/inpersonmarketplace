import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIp,
  rateLimits,
  rateLimitResponse,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors/with-error-tracing'

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
      vertical,
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
      !address ||
      !city ||
      !state ||
      !zip
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

    // Use service client (public form, no auth required)
    const supabase = createServiceClient()

    // Validate new structured fields
    const validEventTypes = ['corporate_lunch', 'team_building', 'grand_opening', 'festival', 'private_party', 'other']
    const validPaymentModels = ['company_paid', 'attendee_paid', 'hybrid']
    const validRecurringFreqs = ['weekly', 'biweekly', 'monthly', 'quarterly']

    const { error: insertError } = await supabase
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
      })

    if (insertError) {
      console.error('[catering-requests] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save your request. Please try again.' },
        { status: 500 }
      )
    }

    // Send admin notification email + organizer confirmation email (parallel)
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
        verticalId
      ),
      sendOrganizerConfirmation(
        String(contact_name),
        String(contact_email),
        String(company_name),
        event_date,
        hc,
        String(city),
        String(state),
        verticalId
      ),
    ])

    return NextResponse.json({
      ok: true,
      message:
        "Thank you! We've received your event request. Check your email for a confirmation.",
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
  verticalId: string
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
      subject: `New ${requestType}: ${companyName} (${headcount} people)`,
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
  verticalId: string
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const isFM = verticalId === 'farmers_market'
  const senderName = isFM ? 'Farmers Marketing' : "Food Truck'n"
  const senderDomain = isFM ? 'mail.farmersmarketing.app' : 'mail.foodtruckn.app'
  const accentColor = isFM ? '#2d5016' : '#ff5757'
  const serviceName = isFM ? 'Farmers Marketing' : "Food Truck'n"
  const eventType = isFM ? 'pop-up market' : 'food truck event'

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
          <p style="color:#4b5563;line-height:1.6;margin:0 0 16px">
            Thank you for reaching out to ${serviceName} about your upcoming event. Here&rsquo;s a summary of what we received:
          </p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:0 0 20px">
            <table style="border-collapse:collapse;width:100%">
              <tr><td style="padding:6px 0;font-weight:600;color:#374151;width:120px">Company</td><td style="padding:6px 0;color:#4b5563">${escapeHtml(companyName)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;color:#374151">Event Date</td><td style="padding:6px 0;color:#4b5563">${escapeHtml(eventDate)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;color:#374151">Headcount</td><td style="padding:6px 0;color:#4b5563">${headcount} people</td></tr>
              <tr><td style="padding:6px 0;font-weight:600;color:#374151">Location</td><td style="padding:6px 0;color:#4b5563">${escapeHtml(city)}, ${escapeHtml(state)}</td></tr>
            </table>
          </div>
          <h3 style="color:${accentColor};margin:0 0 8px;font-size:16px">What happens next?</h3>
          <ol style="color:#4b5563;line-height:1.8;padding-left:20px;margin:0 0 20px">
            <li>Our team reviews your request (typically within 24 hours)</li>
            <li>We match event-approved food trucks to your needs</li>
            <li>You&rsquo;ll receive vendor recommendations with menus and pricing</li>
            <li>Once confirmed, your guests can pre-order online for a seamless experience</li>
          </ol>
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
