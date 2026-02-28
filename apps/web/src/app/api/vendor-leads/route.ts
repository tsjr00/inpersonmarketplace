import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIp,
  rateLimits,
  rateLimitResponse,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors/with-error-tracing'

const ALLOWED_VERTICALS = ['food_trucks', 'farmers_market', 'fire_works']

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor-leads', 'POST', async () => {
    // Rate limit: submit preset (10/60s per IP)
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(
      `vendor-leads:${clientIp}`,
      rateLimits.submit
    )
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const body = await request.json()
    const {
      vertical,
      business_name,
      first_name,
      last_name,
      phone,
      email,
      social_link,
      website,
      interested_in_demo,
      questions,
    } = body

    // Validate required fields
    if (
      !vertical ||
      !business_name ||
      !first_name ||
      !last_name ||
      !phone ||
      !email
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate vertical
    if (!ALLOWED_VERTICALS.includes(vertical)) {
      return NextResponse.json({ error: 'Invalid vertical' }, { status: 400 })
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Use service client (public form, no auth required)
    const supabase = createServiceClient()

    // Insert lead — unique constraint on (email, vertical_id) prevents duplicates
    const { error: insertError } = await supabase.from('vendor_leads').insert({
      vertical_id: vertical,
      business_name: String(business_name).slice(0, 200),
      first_name: String(first_name).slice(0, 100),
      last_name: String(last_name).slice(0, 100),
      phone: String(phone).slice(0, 30),
      email: String(email).toLowerCase().slice(0, 320),
      social_link: social_link ? String(social_link).slice(0, 500) : null,
      website: website ? String(website).slice(0, 500) : null,
      interested_in_demo: Boolean(interested_in_demo),
      questions: questions ? String(questions).slice(0, 2000) : null,
    })

    if (insertError) {
      // Duplicate email — return success (don't reveal duplicates)
      if (insertError.code === '23505') {
        await sendAdminEmail(vertical, business_name, first_name, last_name, email, phone, true)
        return NextResponse.json({
          ok: true,
          message: 'Thank you! We will be in touch.',
        })
      }

      console.error('[vendor-leads] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save your information. Please try again.' },
        { status: 500 }
      )
    }

    // Send admin notification email
    await sendAdminEmail(vertical, business_name, first_name, last_name, email, phone, false)

    return NextResponse.json({
      ok: true,
      message: 'Thank you! We will be in touch.',
    })
  })
}

const verticalEmail: Record<string, { name: string; from: string; color: string; label: string }> = {
  food_trucks: {
    name: "Food Truck'n",
    from: 'updates@mail.foodtruckn.app',
    color: '#ff5757',
    label: 'Food Truck Name',
  },
  farmers_market: {
    name: 'Farmers Marketing',
    from: 'updates@mail.farmersmarketing.app',
    color: '#e86452',
    label: 'Business Name',
  },
}

async function sendAdminEmail(
  vertical: string,
  businessName: string,
  firstName: string,
  lastName: string,
  email: string,
  phone: string,
  isDuplicate: boolean
) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL
  const apiKey = process.env.RESEND_API_KEY
  if (!adminEmail || !apiKey) return

  const v = verticalEmail[vertical] || verticalEmail.food_trucks

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    await resend.emails.send({
      from: `${v.name} <${v.from}>`,
      to: adminEmail,
      subject: `${isDuplicate ? '[DUPLICATE] ' : ''}New Vendor Lead: ${businessName}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${v.color};margin:0 0 16px">New Vendor Lead${isDuplicate ? ' (Duplicate Submission)' : ''}</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;width:140px">${v.label}</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(businessName)}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Owner</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(firstName)} ${escapeHtml(lastName)}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Phone</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(phone)}</td></tr>
          </table>
          <p style="margin-top:16px;color:#737373;font-size:13px">This lead was submitted via the ${v.name} Coming Soon page.</p>
        </div>
      `,
    })
  } catch (err) {
    // Email failure should never break the submission
    console.error('[vendor-leads] Failed to send admin email:', err)
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
