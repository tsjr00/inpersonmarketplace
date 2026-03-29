import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  checkRateLimit,
  getClientIp,
  rateLimits,
  rateLimitResponse,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors/with-error-tracing'

const ALLOWED_VERTICALS = ['food_trucks', 'farmers_market', 'fire_works']
const ALLOWED_CATEGORIES = [
  'technical_problem',
  'order_issue',
  'account_help',
  'feature_request',
  'general',
]

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/support', 'POST', async () => {
    // Rate limit: submit preset (10/60s per IP)
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(
      `support:${clientIp}`,
      rateLimits.submit
    )
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const body = await request.json()
    const { vertical, name, email, category, message } = body

    // Validate required fields
    if (!vertical || !name || !email || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate vertical
    if (!ALLOWED_VERTICALS.includes(vertical)) {
      return NextResponse.json({ error: 'Invalid vertical' }, { status: 400 })
    }

    // Validate category
    const validCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'general'

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Check if user is authenticated (optional — public form)
    let userId: string | null = null
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) userId = user.id
    } catch {
      // Not authenticated — that's fine
    }

    // Content moderation
    const { checkFields } = await import('@/lib/content-moderation')
    const modCheck = checkFields({ name, message })
    if (!modCheck.passed) {
      return NextResponse.json({ error: modCheck.reason }, { status: 400 })
    }

    // Use service client for insert (public form, bypasses RLS)
    const serviceClient = createServiceClient()

    const { error: insertError } = await serviceClient.from('support_tickets').insert({
      vertical_id: vertical,
      name: String(name).slice(0, 200),
      email: String(email).toLowerCase().slice(0, 320),
      category: validCategory,
      message: String(message).slice(0, 5000),
      user_id: userId,
    })

    if (insertError) {
      console.error('[support] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to submit your request. Please try again.' },
        { status: 500 }
      )
    }

    // Send admin notification email
    await sendAdminEmail(vertical, name, email, validCategory, message)

    return NextResponse.json({
      ok: true,
      message: 'Thank you! We will get back to you within 24-48 hours.',
    })
  })
}

const verticalEmail: Record<string, { name: string; from: string; color: string }> = {
  food_trucks: {
    name: "Food Truck'n",
    from: 'updates@mail.foodtruckn.app',
    color: '#ff5757',
  },
  farmers_market: {
    name: 'Farmers Marketing',
    from: 'updates@mail.farmersmarketing.app',
    color: '#e86452',
  },
}

const categoryLabels: Record<string, string> = {
  technical_problem: 'Technical Problem',
  order_issue: 'Order Issue',
  account_help: 'Account Help',
  feature_request: 'Feature Request',
  general: 'General',
}

async function sendAdminEmail(
  vertical: string,
  name: string,
  email: string,
  category: string,
  message: string,
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
      subject: `[Support] ${categoryLabels[category] || category}: ${name}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${v.color};margin:0 0 16px">New Support Ticket</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;width:140px">Name</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(name)}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Category</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${categoryLabels[category] || category}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;vertical-align:top">Message</td><td style="padding:8px 12px;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(message)}</td></tr>
          </table>
          <p style="margin-top:16px;color:#737373;font-size:13px">Submitted via the ${v.name} support page.</p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[support] Failed to send admin email:', err)
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
