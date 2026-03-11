/**
 * Supabase Auth "Send Email" Hook
 *
 * Intercepts auth emails (signup confirmation, password reset, magic link, etc.)
 * before Supabase sends them and routes through Resend with per-vertical branding.
 *
 * Configure in Supabase Dashboard → Authentication → Hooks → Send Email
 */

import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'standardwebhooks'
import { withErrorTracing } from '@/lib/errors'
import { getResendClient, formatEmailHtml } from '@/lib/notifications/service'
import { getEmailFromAddress, getEmailBranding } from '@/lib/notifications/email-config'
import { getAuthEmailTemplate } from '@/lib/notifications/auth-email-templates'

const KNOWN_VERTICALS = ['farmers_market', 'food_trucks']

interface SendEmailHookPayload {
  user: {
    id: string
    email: string
    user_metadata?: {
      preferred_vertical?: string
      full_name?: string
      [key: string]: unknown
    }
  }
  email_data: {
    token: string
    token_hash: string
    email_action_type: 'signup' | 'recovery' | 'magiclink' | 'email_change' | 'invite'
    redirect_to: string
    site_url: string
  }
}

/**
 * Determine user's vertical from metadata or redirect URL.
 * Priority: user_metadata.preferred_vertical > redirect_to URL path > default FM
 */
function detectVertical(payload: SendEmailHookPayload): string {
  // 1. Check user_metadata (set during signup)
  const metaVertical = payload.user.user_metadata?.preferred_vertical
  if (metaVertical && KNOWN_VERTICALS.includes(metaVertical)) {
    return metaVertical
  }

  // 2. Extract from redirect_to URL path (e.g., "https://farmersmarketing.app/farmers_market/reset-password")
  try {
    const url = new URL(payload.email_data.redirect_to)
    const pathSegment = url.pathname.split('/')[1]
    if (pathSegment && KNOWN_VERTICALS.includes(pathSegment)) {
      return pathSegment
    }
  } catch {
    // Invalid URL — fall through to default
  }

  // 3. Default
  return 'farmers_market'
}

/**
 * Build the Supabase verification URL that the user clicks to confirm their action.
 */
function buildVerificationUrl(emailData: SendEmailHookPayload['email_data']): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }

  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: emailData.redirect_to,
  })

  return `${supabaseUrl}/auth/v1/verify?${params.toString()}`
}

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/auth/send-email', 'POST', async () => {
    // Verify webhook signature
    const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET
    if (!hookSecret) {
      console.error('SEND_EMAIL_HOOK_SECRET is not configured')
      return NextResponse.json({}, { status: 200 })
    }

    const rawBody = await request.text()

    try {
      const wh = new Webhook(hookSecret)
      const headers: Record<string, string> = {}
      request.headers.forEach((value, key) => {
        headers[key] = value
      })
      wh.verify(rawBody, headers)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      )
    }

    const payload: SendEmailHookPayload = JSON.parse(rawBody)
    const { user, email_data } = payload

    if (!user?.email || !email_data?.email_action_type) {
      console.error('Invalid hook payload: missing email or action type')
      return NextResponse.json({}, { status: 200 })
    }

    // Determine vertical and get branding
    const vertical = detectVertical(payload)
    const fromAddress = getEmailFromAddress(vertical)
    const { brandName, brandDomain, brandColor } = getEmailBranding(vertical)

    // Build verification URL
    const verificationUrl = buildVerificationUrl(email_data)

    // Get the template for this action type
    const template = getAuthEmailTemplate(email_data.email_action_type, {
      brandName,
      brandColor,
      brandDomain,
      verificationUrl,
      vertical,
    })

    // Send via Resend
    const resend = getResendClient()
    if (!resend) {
      console.error('Resend client not available (RESEND_API_KEY missing)')
      return NextResponse.json({}, { status: 200 })
    }

    const supportPath = `/${vertical}/support`
    const fullHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
      <div style="margin-bottom:24px">
        <strong style="color:${brandColor};font-size:18px">${brandName}</strong>
      </div>
      ${template.htmlBody}
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">
      ${brandName} &middot; <a href="https://${brandDomain}" style="color:#9ca3af">${brandDomain}</a>
    </p>
    <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:8px">
      This is an automated message. Please do not reply to this email. If you need help, contact us at <a href="https://${brandDomain}${supportPath}" style="color:#9ca3af">${brandDomain}${supportPath}</a>.
    </p>
  </div>
</body>
</html>`

    try {
      const { error } = await resend.emails.send({
        from: `${brandName} <${fromAddress}>`,
        to: user.email,
        subject: template.subject,
        html: fullHtml,
        text: template.textBody,
      })

      if (error) {
        console.error('Resend send error:', error)
      }
    } catch (err) {
      console.error('Failed to send auth email:', err)
    }

    // Always return 200 with empty object — Supabase requirement
    return NextResponse.json({})
  })
}
