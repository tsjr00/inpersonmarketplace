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
  return withErrorTracing('/api/catering-requests', 'POST', async () => {
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
      event_date,
      event_end_date,
      event_start_time,
      event_end_time,
      headcount,
      address,
      city,
      state,
      zip,
      cuisine_preferences,
      dietary_notes,
      budget_notes,
      vendor_count,
      setup_instructions,
      additional_notes,
    } = body

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

    const { error: insertError } = await supabase
      .from('catering_requests')
      .insert({
        vertical_id: 'food_trucks',
        company_name: String(company_name).slice(0, 200),
        contact_name: String(contact_name).slice(0, 200),
        contact_email: String(contact_email).toLowerCase().slice(0, 320),
        contact_phone: contact_phone
          ? String(contact_phone).slice(0, 30)
          : null,
        event_date,
        event_end_date: event_end_date || null,
        event_start_time: event_start_time || null,
        event_end_time: event_end_time || null,
        headcount: hc,
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
        vendor_count: vendor_count ? Math.min(parseInt(vendor_count, 10) || 2, 20) : 2,
        setup_instructions: setup_instructions
          ? String(setup_instructions).slice(0, 1000)
          : null,
        additional_notes: additional_notes
          ? String(additional_notes).slice(0, 2000)
          : null,
      })

    if (insertError) {
      console.error('[catering-requests] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save your request. Please try again.' },
        { status: 500 }
      )
    }

    // Send admin notification email
    await sendAdminEmail(
      String(company_name),
      String(contact_name),
      String(contact_email),
      contact_phone ? String(contact_phone) : '',
      event_date,
      hc,
      String(address),
      String(city),
      String(state)
    )

    return NextResponse.json({
      ok: true,
      message:
        "Thank you! We've received your catering request and will be in touch within 24 hours.",
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
  state: string
) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL
  const apiKey = process.env.RESEND_API_KEY
  if (!adminEmail || !apiKey) return

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: "Food Truck'n <updates@mail.foodtruckn.app>",
      to: adminEmail,
      subject: `New Catering Request: ${companyName} (${headcount} people)`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#ff5757;margin:0 0 16px">New Catering Request</h2>
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
