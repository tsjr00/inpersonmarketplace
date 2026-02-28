import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { Webhook } from 'svix'
import { withErrorTracing } from '@/lib/errors/with-error-tracing'

/**
 * POST /api/webhooks/resend
 *
 * Receives webhook events from Resend (email delivery status).
 * Stores bounces, complaints, and delivery delays in email_events table.
 * Sends admin alert for bounces and spam complaints.
 *
 * Resend uses Svix for webhook signing — we verify the signature before processing.
 */

interface ResendWebhookPayload {
  type: string
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject: string
    // Bounce-specific
    bounce?: {
      message: string
      type?: string // hard | soft
    }
    // Complaint-specific
    complaint?: {
      message: string
    }
    // Delivery delay
    delayed_reason?: string
  }
}

// Events we store (problematic events only — not deliveries)
const TRACKABLE_EVENTS = new Set([
  'email.bounced',
  'email.complained',
  'email.delivery_delayed',
])

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/webhooks/resend', 'POST', async () => {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not configured')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    // Read raw body for signature verification
    const body = await request.text()

    // Svix signature headers
    const svixId = request.headers.get('svix-id')
    const svixTimestamp = request.headers.get('svix-timestamp')
    const svixSignature = request.headers.get('svix-signature')

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 })
    }

    // Verify signature — return 400 on failure (no retries for bad signatures)
    let payload: ResendWebhookPayload
    try {
      const wh = new Webhook(webhookSecret)
      payload = wh.verify(body, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ResendWebhookPayload
    } catch {
      console.error('[resend-webhook] Signature verification failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const eventType = payload.type
    const data = payload.data

    // Only store problematic events (bounces, complaints, delays)
    if (!TRACKABLE_EVENTS.has(eventType)) {
      return NextResponse.json({ received: true })
    }

    const emailTo = Array.isArray(data.to) ? data.to[0] : data.to
    const errorMessage =
      data.bounce?.message ||
      data.complaint?.message ||
      data.delayed_reason ||
      null
    const bounceType = data.bounce?.type || null

    // Store event in database
    const supabase = createServiceClient()
    const { error: insertError } = await supabase.from('email_events').insert({
      resend_event_id: data.email_id,
      event_type: eventType,
      email_to: emailTo,
      email_from: data.from || null,
      subject: data.subject || null,
      bounce_type: bounceType,
      error_message: errorMessage,
      raw_payload: payload,
    })

    // Duplicate event (idempotent) — not an error
    if (insertError && insertError.code === '23505') {
      return NextResponse.json({ received: true })
    }

    if (insertError) {
      console.error('[resend-webhook] Insert error:', insertError.message)
      return NextResponse.json({ error: 'Failed to store event' }, { status: 500 })
    }

    // Send admin alert for bounces and complaints
    if (eventType === 'email.bounced' || eventType === 'email.complained') {
      await sendAdminAlert(eventType, emailTo, data.subject, errorMessage, bounceType)
    }

    return NextResponse.json({ received: true })
  })
}

async function sendAdminAlert(
  eventType: string,
  emailTo: string,
  subject: string | null,
  errorMessage: string | null,
  bounceType: string | null
) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL
  const apiKey = process.env.RESEND_API_KEY
  if (!adminEmail || !apiKey) return

  const isBounce = eventType === 'email.bounced'
  const label = isBounce ? 'EMAIL BOUNCE' : 'SPAM COMPLAINT'
  const color = isBounce ? '#dc2626' : '#ea580c'

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'updates@mail.farmersmarketing.app'

    await resend.emails.send({
      from: `Platform Alerts <${fromAddress}>`,
      to: adminEmail,
      subject: `[${label}] ${emailTo}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${color};margin:0 0 16px">${label}</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;width:140px">Recipient</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${emailTo}</td></tr>
            ${subject ? `<tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Subject</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${subject}</td></tr>` : ''}
            ${bounceType ? `<tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Bounce Type</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${bounceType}</td></tr>` : ''}
            ${errorMessage ? `<tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee">Details</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${errorMessage}</td></tr>` : ''}
          </table>
          <p style="margin-top:16px;color:#6b7280;font-size:13px">
            ${isBounce
              ? 'This email address may be invalid. Consider removing it from future sends.'
              : 'This recipient marked your email as spam. They have been suppressed by Resend automatically.'}
          </p>
        </div>
      `,
    })
  } catch (err) {
    console.error('[resend-webhook] Failed to send admin alert:', err)
  }
}
