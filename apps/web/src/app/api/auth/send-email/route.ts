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
import { getResendClient } from '@/lib/notifications/service'
import { getEmailFromAddress, getEmailBranding } from '@/lib/notifications/email-config'
import { getAuthEmailTemplate } from '@/lib/notifications/auth-email-templates'
import { createServiceClient } from '@/lib/supabase/server'
import { t } from '@/lib/locale/messages'

const KNOWN_VERTICALS = ['farmers_market', 'food_trucks']

/** Map domains to verticals for detection when Supabase mangles redirect_to paths */
const DOMAIN_TO_VERTICAL: Record<string, string> = {
  'foodtruckn.app': 'food_trucks',
  'farmersmarketing.app': 'farmers_market',
}

/** Map auth action types to the correct redirect path within a vertical */
const ACTION_REDIRECT_PATHS: Record<string, string> = {
  recovery: 'reset-password',
  signup: 'dashboard',
  magiclink: 'dashboard',
  email_change: 'settings',
  invite: 'dashboard',
}

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
 * Determine user's vertical from redirect URL, domain, or metadata.
 *
 * Priority:
 *   1. redirect_to URL path (e.g., /food_trucks/reset-password)
 *   2. redirect_to URL domain (e.g., foodtruckn.app — catches Supabase path-mangling)
 *   3. user_metadata.preferred_vertical (set at signup)
 *   4. Default: farmers_market
 *
 * Supabase may replace the client's redirect_to with a wildcard from the
 * Redirect URLs whitelist (e.g., "https://farmersmarketing.app/**"), mangling
 * the path but sometimes preserving the domain. Domain detection handles this.
 */
function detectVertical(payload: SendEmailHookPayload): string {
  try {
    const url = new URL(payload.email_data.redirect_to)

    // 1. Path-based: e.g., /food_trucks/reset-password → "food_trucks"
    const pathSegment = url.pathname.split('/')[1]
    if (pathSegment && KNOWN_VERTICALS.includes(pathSegment)) {
      return pathSegment
    }

    // 2. Domain-based: e.g., foodtruckn.app/** → "food_trucks"
    const hostname = url.hostname.replace(/^www\./, '')
    if (DOMAIN_TO_VERTICAL[hostname]) {
      return DOMAIN_TO_VERTICAL[hostname]
    }
  } catch {
    // Invalid URL — fall through
  }

  // 3. User metadata (set during signup — may differ from current vertical)
  const metaVertical = payload.user.user_metadata?.preferred_vertical
  if (metaVertical && KNOWN_VERTICALS.includes(metaVertical)) {
    return metaVertical
  }

  // 4. Default
  return 'farmers_market'
}

/**
 * Build the Supabase verification URL that the user clicks to confirm their action.
 *
 * IMPORTANT: We construct our own redirect_to URL instead of using
 * emailData.redirect_to, because Supabase may mangle it to a wildcard pattern
 * (e.g., "https://farmersmarketing.app/**") which would send the user to a 404.
 * We use the detected vertical + brand domain to build the correct destination.
 */
function buildVerificationUrl(
  emailData: SendEmailHookPayload['email_data'],
  vertical: string,
  brandDomain: string
): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }

  // Build correct redirect URL — use NEXT_PUBLIC_APP_URL for environment awareness
  // (staging → staging URL, production → production domain)
  const redirectPath = ACTION_REDIRECT_PATHS[emailData.email_action_type] || 'dashboard'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${brandDomain}`
  const finalDestination = `/${vertical}/${redirectPath}`

  // Route through /api/auth/callback which handles the PKCE code exchange
  // server-side (no code_verifier needed — uses cookie-based session)
  const callbackUrl = `${appUrl}/api/auth/callback?next=${encodeURIComponent(finalDestination)}`

  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: callbackUrl,
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
      // Supabase provides secret as "v1,whsec_<base64>" but standardwebhooks expects just "whsec_<base64>"
      const signingSecret = hookSecret.replace(/^v1,/, '')
      const wh = new Webhook(signingSecret)
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
    const { brandName, brandDomain, brandColor, logoUrl } = getEmailBranding(vertical)

    // Look up user's locale preference for i18n
    let userLocale: string | undefined
    try {
      const supabase = createServiceClient()
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('notification_preferences')
        .eq('user_id', user.id)
        .single()
      const prefs = profile?.notification_preferences as Record<string, unknown> | null
      if (typeof prefs?.locale === 'string') {
        userLocale = prefs.locale
      }
    } catch {
      // Non-critical: fall back to English
    }

    // Build verification URL with correct redirect for this vertical
    const verificationUrl = buildVerificationUrl(email_data, vertical, brandDomain)

    // Get the template for this action type
    const template = getAuthEmailTemplate(email_data.email_action_type, {
      brandName,
      brandColor,
      brandDomain,
      verificationUrl,
      vertical,
      locale: userLocale,
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
      <div style="margin-bottom:24px;text-align:center">
        <img src="${logoUrl}" alt="${brandName}" width="120" height="120" style="display:block;margin:0 auto 12px" />
      </div>
      ${template.htmlBody}
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">
      ${brandName} &middot; <a href="https://${brandDomain}" style="color:#9ca3af">${brandDomain}</a>
    </p>
    <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:8px">
      ${t('email.do_not_reply', userLocale)} <a href="https://${brandDomain}${supportPath}" style="color:#9ca3af">${brandDomain}${supportPath}</a>.
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
