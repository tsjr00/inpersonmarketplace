/**
 * Notification Service - Channel-Aware Orchestrator
 *
 * Determines which channels to use based on notification type urgency,
 * checks user preferences, and dispatches to each channel.
 *
 * Channels:
 *   - in_app: Always (writes to notifications table)
 *   - email:  Connected (Resend)
 *   - sms:    Connected (Twilio)
 *   - push:   Connected (Web Push API with VAPID)
 */

import { createServiceClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import twilio from 'twilio'
import webpush from 'web-push'
import {
  type NotificationType,
  type NotificationTemplateData,
  type NotificationChannel,
  NOTIFICATION_REGISTRY,
  URGENCY_CHANNELS,
} from './types'
import { defaultBranding } from '@/lib/branding/defaults'

// ── External Clients (lazy init) ────────────────────────────────────

let resendClient: Resend | null = null

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

let twilioClient: twilio.Twilio | null = null

function getTwilioClient(): twilio.Twilio | null {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null
  if (!twilioClient) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  }
  return twilioClient
}

let webPushConfigured = false

function configureWebPush(): boolean {
  if (webPushConfigured) return true
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  webPushConfigured = true
  return true
}

// ── Channel Dispatch Results ─────────────────────────────────────────

interface ChannelResult {
  channel: NotificationChannel
  success: boolean
  messageId?: string
  error?: string
  skipped?: boolean
  reason?: string
}

export interface NotificationResult {
  notificationType: NotificationType
  channels: ChannelResult[]
  inAppNotificationId?: string
}

// ── User Preference Checking ─────────────────────────────────────────

interface UserPreferences {
  email_order_updates: boolean
  email_marketing: boolean
  sms_order_updates: boolean
  sms_marketing: boolean
  push_enabled?: boolean
}

const DEFAULT_PREFERENCES: UserPreferences = {
  email_order_updates: true,
  email_marketing: false,
  sms_order_updates: false,
  sms_marketing: false,
  push_enabled: false,
}

function shouldSendChannel(
  channel: NotificationChannel,
  preferences: UserPreferences
): boolean {
  switch (channel) {
    case 'in_app':
      return true // Always send in-app
    case 'email':
      return preferences.email_order_updates
    case 'sms':
      return preferences.sms_order_updates
    case 'push':
      return preferences.push_enabled ?? false
    default:
      return false
  }
}

// ── Channel Dispatchers (stubs for external services) ────────────────

async function sendInApp(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data: NotificationTemplateData
): Promise<ChannelResult> {
  try {
    const supabase = createServiceClient()
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        data: data as Record<string, unknown>,
      })
      .select('id')
      .single()

    if (error) {
      return { channel: 'in_app', success: false, error: error.message }
    }

    return { channel: 'in_app', success: true, messageId: notification.id }
  } catch (err) {
    return { channel: 'in_app', success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

async function sendEmail(
  userEmail: string,
  subject: string,
  body: string,
  vertical?: string
): Promise<ChannelResult> {
  const resend = getResendClient()
  if (!resend) {
    return {
      channel: 'email',
      success: true,
      skipped: true,
      reason: 'RESEND_API_KEY not configured',
    }
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL || 'noreply@mail.farmersmarketing.app'
  // Use vertical-aware branding for display name, domain, and header color
  const branding = defaultBranding[vertical || 'farmers_market']
  const brandName = branding?.brand_name || 'Farmers Marketing'
  const brandDomain = branding?.domain || 'farmersmarketing.app'
  const brandColor = branding?.colors?.primary || '#2d5016'

  try {
    const { data, error } = await resend.emails.send({
      from: `${brandName} <${fromAddress}>`,
      to: userEmail,
      subject,
      html: formatEmailHtml(subject, body, brandName, brandDomain, brandColor),
      text: body,
    })

    if (error) {
      return { channel: 'email', success: false, error: error.message }
    }

    return { channel: 'email', success: true, messageId: data?.id }
  } catch (err) {
    return {
      channel: 'email',
      success: false,
      error: err instanceof Error ? err.message : 'Unknown email error',
    }
  }
}

/** Wrap plain-text email body in a clean HTML template */
function formatEmailHtml(
  subject: string,
  body: string,
  brandName: string = 'Farmers Marketing',
  brandDomain: string = 'farmersmarketing.app',
  brandColor: string = '#2d5016'
): string {
  const htmlBody = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/─+/g, '<hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0">')
    .replace(/\n\n/g, '</p><p style="margin:0 0 12px">')
    .replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
      <div style="margin-bottom:24px">
        <strong style="color:${brandColor};font-size:18px">${brandName}</strong>
      </div>
      <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6">${htmlBody}</p>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">
      ${brandName} &middot; <a href="https://${brandDomain}" style="color:#9ca3af">${brandDomain}</a>
    </p>
  </div>
</body>
</html>`
}

async function sendSms(
  phoneNumber: string,
  body: string
): Promise<ChannelResult> {
  const client = getTwilioClient()
  if (!client) {
    return {
      channel: 'sms',
      success: true,
      skipped: true,
      reason: 'Twilio credentials not configured',
    }
  }

  const fromNumber = process.env.TWILIO_FROM_NUMBER
  if (!fromNumber) {
    return {
      channel: 'sms',
      success: true,
      skipped: true,
      reason: 'TWILIO_FROM_NUMBER not configured',
    }
  }

  try {
    const message = await client.messages.create({
      body,
      from: fromNumber,
      to: phoneNumber,
    })

    return { channel: 'sms', success: true, messageId: message.sid }
  } catch (err) {
    return {
      channel: 'sms',
      success: false,
      error: err instanceof Error ? err.message : 'Unknown SMS error',
    }
  }
}

async function sendPush(
  userId: string,
  title: string,
  body: string,
  actionUrl: string
): Promise<ChannelResult> {
  if (!configureWebPush()) {
    return {
      channel: 'push',
      success: true,
      skipped: true,
      reason: 'VAPID keys not configured',
    }
  }

  try {
    const supabase = createServiceClient()
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)

    if (error || !subscriptions?.length) {
      return {
        channel: 'push',
        success: true,
        skipped: true,
        reason: error ? error.message : 'No push subscriptions found',
      }
    }

    const payload = JSON.stringify({
      title,
      body,
      url: actionUrl,
      tag: 'notification',
    })

    const results = await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      )
    )

    // Clean up stale subscriptions (410 Gone or 404 Not Found)
    const staleIds: string[] = []
    let successCount = 0
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled') {
        successCount++
      } else {
        const statusCode = (result.reason as { statusCode?: number })?.statusCode
        if (statusCode === 410 || statusCode === 404) {
          staleIds.push(subscriptions[i].id)
        }
      }
    }

    if (staleIds.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', staleIds)
    }

    return {
      channel: 'push',
      success: successCount > 0,
      error: successCount === 0 ? 'All push subscriptions failed' : undefined,
    }
  } catch (err) {
    return {
      channel: 'push',
      success: false,
      error: err instanceof Error ? err.message : 'Unknown push error',
    }
  }
}

// ── Main Orchestrator ────────────────────────────────────────────────

/**
 * Send a notification through all appropriate channels.
 *
 * @param userId - The user_profiles.id (NOT auth.uid) to notify
 * @param type - The notification type from the registry
 * @param templateData - Data to populate the notification template
 * @param options - Optional overrides
 */
export async function sendNotification(
  userId: string,
  type: NotificationType,
  templateData: NotificationTemplateData,
  options?: {
    vertical?: string
    userEmail?: string
    userPhone?: string
  }
): Promise<NotificationResult> {
  const config = NOTIFICATION_REGISTRY[type]
  if (!config) {
    return {
      notificationType: type,
      channels: [{ channel: 'in_app', success: false, error: `Unknown notification type: ${type}` }],
    }
  }

  // Generate content from templates
  const title = config.title(templateData)
  const message = config.message(templateData)
  const actionUrl = config.actionUrl({ ...templateData, vertical: options?.vertical })

  // Determine channels based on urgency
  let channels = URGENCY_CHANNELS[config.urgency]

  // Fetch user preferences and email (for email channel)
  let preferences = DEFAULT_PREFERENCES
  let userEmail = options?.userEmail
  let userPhone = options?.userPhone
  try {
    const supabase = createServiceClient()
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profile?.notification_preferences) {
      preferences = { ...DEFAULT_PREFERENCES, ...profile.notification_preferences as UserPreferences }
    }
    // Auto-resolve email/phone from profile if not provided by caller
    if (!userEmail && profile?.email) {
      userEmail = profile.email
    }
    if (!userPhone && profile?.phone) {
      userPhone = profile.phone
    }

    // FT tier-based channel gating: restrict channels based on vendor's tier
    if (options?.vertical === 'food_trucks' && profile?.user_id) {
      const { data: vendor } = await supabase
        .from('vendor_profiles')
        .select('tier')
        .eq('user_id', profile.user_id)
        .eq('vertical_id', 'food_trucks')
        .single()

      if (vendor?.tier) {
        const { getFtTierExtras } = await import('@/lib/vendor-limits')
        const extras = getFtTierExtras(vendor.tier)
        // Map channel names: 'push' and 'in_app' are always allowed if in tier list
        // 'sms' requires 'sms' in tier, 'email' requires 'email' in tier
        const allowed = extras.notificationChannels
        channels = channels.filter(ch => {
          if (ch === 'in_app') return allowed.includes('in_app')
          if (ch === 'push') return allowed.includes('push')
          return allowed.includes(ch)
        })
      }
    }
  } catch (prefError) {
    console.warn('[notifications] Failed to fetch user preferences, using defaults:', prefError)
  }

  // Dispatch to each channel
  const results: ChannelResult[] = []
  let inAppNotificationId: string | undefined

  for (const channel of channels) {
    // Check user preference for this channel
    if (!shouldSendChannel(channel, preferences)) {
      results.push({
        channel,
        success: true,
        skipped: true,
        reason: `User has ${channel} notifications disabled`,
      })
      continue
    }

    switch (channel) {
      case 'in_app': {
        const result = await sendInApp(userId, type, title, message, {
          ...templateData,
          // Store actionUrl in template data for the frontend
        })
        if (result.messageId) {
          inAppNotificationId = result.messageId
        }
        results.push(result)
        break
      }
      case 'email': {
        if (userEmail) {
          results.push(await sendEmail(userEmail, title, message, options?.vertical))
        } else {
          results.push({
            channel: 'email',
            success: true,
            skipped: true,
            reason: 'No email address available',
          })
        }
        break
      }
      case 'sms': {
        // SMS sends independently when user has sms_order_updates enabled
        if (!preferences.sms_order_updates) {
          results.push({
            channel: 'sms',
            success: true,
            skipped: true,
            reason: 'SMS notifications not enabled by user',
          })
        } else if (userPhone) {
          results.push(await sendSms(userPhone, `${title}: ${message}`))
        } else {
          results.push({
            channel: 'sms',
            success: true,
            skipped: true,
            reason: 'No phone number available',
          })
        }
        break
      }
      case 'push': {
        results.push(await sendPush(userId, title, message, actionUrl))
        break
      }
    }
  }

  return {
    notificationType: type,
    channels: results,
    inAppNotificationId,
  }
}

/**
 * Send a notification to multiple users (batch).
 * Useful for admin broadcasts or market-wide announcements.
 *
 * Pre-fetches all user profiles in a single query to avoid N sequential DB calls.
 */
export async function sendNotificationBatch(
  userIds: string[],
  type: NotificationType,
  templateData: NotificationTemplateData,
  options?: {
    vertical?: string
  }
): Promise<NotificationResult[]> {
  if (userIds.length === 0) return []

  // Batch-fetch user profiles to avoid N+1 queries inside sendNotification
  const profileMap = new Map<string, { email?: string; phone?: string }>()
  try {
    const supabase = createServiceClient()
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, email, phone')
      .in('id', userIds)

    if (profiles) {
      for (const p of profiles) {
        profileMap.set(p.id, { email: p.email || undefined, phone: p.phone || undefined })
      }
    }
  } catch {
    // If batch fetch fails, sendNotification will fetch individually as fallback
  }

  const results = await Promise.all(
    userIds.map((userId) => {
      const profile = profileMap.get(userId)
      return sendNotification(userId, type, templateData, {
        ...options,
        userEmail: profile?.email,
        userPhone: profile?.phone,
      })
    })
  )
  return results
}
