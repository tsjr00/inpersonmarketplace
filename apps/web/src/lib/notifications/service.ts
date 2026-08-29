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
import { t } from '@/lib/locale/messages'
import { Resend } from 'resend'
import twilio from 'twilio'
import webpush from 'web-push'
import {
  type NotificationType,
  type NotificationTemplateData,
  type NotificationChannel,
  type NotificationUrgency,
  NOTIFICATION_REGISTRY,
  URGENCY_CHANNELS,
  getNotificationUrgency,
} from './types'
import { defaultBranding } from '@/lib/branding/defaults'
import { getEmailFromAddress, getEmailBranding } from '@/lib/notifications/email-config'
import { TracedError, logError, observed } from '@/lib/errors'

// ── External Clients (lazy init) ────────────────────────────────────

let resendClient: Resend | null = null

export function getResendClient(): Resend | null {
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
  sound_enabled?: boolean
}

const DEFAULT_PREFERENCES: UserPreferences = {
  email_order_updates: true,
  email_marketing: false,
  sms_order_updates: false,
  sms_marketing: false,
  push_enabled: false,
  sound_enabled: true,
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
  data: NotificationTemplateData,
  vertical?: string
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
        vertical_id: vertical || null,
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
  vertical?: string,
  locale?: string
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

  // H-3 FIX: Per-vertical email FROM address + branding (extracted to email-config.ts)
  const fromAddress = getEmailFromAddress(vertical)
  const { brandName, brandDomain, brandColor, logoUrl } = getEmailBranding(vertical)

  // H-5: Build settings URL for unsubscribe link + header
  const settingsPath = vertical ? `/${vertical}/settings` : '/settings'
  const unsubscribeUrl = `https://${brandDomain}${settingsPath}#notifications`

  try {
    const { data, error } = await resend.emails.send({
      from: `${brandName} <${fromAddress}>`,
      to: userEmail,
      subject,
      html: formatEmailHtml(subject, body, brandName, brandDomain, brandColor, vertical, logoUrl, locale),
      text: body,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
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
export function formatEmailHtml(
  subject: string,
  body: string,
  brandName: string = 'Farmers Marketing',
  brandDomain: string = 'farmersmarketing.app',
  brandColor: string = '#2d5016',
  vertical?: string,
  logoUrl?: string,
  locale?: string
): string {
  const htmlBody = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/─+/g, '<hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0">')
    .replace(/\n\n/g, '</p><p style="margin:0 0 12px">')
    .replace(/\n/g, '<br>')

  const supportPath = vertical ? `/${vertical}/support` : '/support'
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName}" width="120" height="120" style="display:block;margin:0 auto 12px" />`
    : `<strong style="color:${brandColor};font-size:18px">${brandName}</strong>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e7eb">
      <div style="margin-bottom:24px;text-align:center">
        ${logoHtml}
      </div>
      <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6">${htmlBody}</p>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">
      ${brandName} &middot; <a href="https://${brandDomain}" style="color:#9ca3af">${brandDomain}</a>
    </p>
    <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:8px">
      ${t('email.do_not_reply', locale)} <a href="https://${brandDomain}${supportPath}" style="color:#9ca3af">${brandDomain}${supportPath}</a>.
    </p>
    <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:4px">
      <a href="https://${brandDomain}/${vertical || 'farmers_market'}/settings#notifications" style="color:#9ca3af">${t('email.manage_prefs', locale)}</a>
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
  actionUrl: string,
  urgency: NotificationUrgency = 'standard',
  soundEnabled: boolean = true,
  vertical?: string
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
      urgency,
      soundEnabled,
      vertical: vertical || null,
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
      ...(successCount === 0 ? { error: 'All push subscriptions failed' } : {}),
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
 * @param userId - The auth.users.id (auth.uid) to notify
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
    // NOT-2: when a batch caller has already bulk-loaded the recipient's
    // profile + vendor tier, pass them here to SKIP the per-recipient
    // user_profiles + vendor_profiles queries (the N+1 that made
    // sendNotificationBatch no cheaper than a loop). Absent → fetch as before.
    prefetched?: {
      preferences: UserPreferences
      email: string | null
      phone: string | null
      vendorTier: string | null
      // NOT-5 (mig 202): user_profiles.email_suppressed_at, when the batch
      // loader could read it (null/undefined = not suppressed).
      emailSuppressedAt?: string | null
    }
  }
): Promise<NotificationResult> {
  const config = NOTIFICATION_REGISTRY[type]
  if (!config) {
    return {
      notificationType: type,
      channels: [{ channel: 'in_app', success: false, error: `Unknown notification type: ${type}` }],
    }
  }

  // Dedup: prevent duplicate notifications of same type to same user within 10 seconds
  // Catches Stripe webhook retries and double-click scenarios without suppressing
  // legitimately rapid notifications (10s window is tight enough for safety)
  try {
    const dedupClient = createServiceClient()
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString()
    let dedupQuery = dedupClient
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', type)
      .gte('created_at', tenSecondsAgo)
      .limit(1)
    // NOT-1: when the notification carries a reference — dedupRef (CHK-13 paired
    // sends) or orderNumber (order notifications) — dedup on THAT reference, so
    // two legitimately-distinct same-type notifications to one user inside the
    // window (e.g. two orders to one vendor in a lunch rush) are NOT
    // cross-suppressed. Only when NEITHER is present does the coarse user+type
    // window apply (its original purpose: catch webhook retries / double-clicks).
    const td = templateData as Record<string, unknown>
    const dedupRef = typeof td.dedupRef === 'string' ? td.dedupRef : undefined
    const orderNumber = typeof td.orderNumber === 'string' ? td.orderNumber : undefined
    if (dedupRef) dedupQuery = dedupQuery.contains('data', { dedupRef })
    else if (orderNumber) dedupQuery = dedupQuery.contains('data', { orderNumber })
    const { data: recentDup } = await observed(dedupQuery, { table: 'notifications' })

    if (recentDup && recentDup.length > 0) {
      return {
        notificationType: type,
        channels: [{ channel: 'in_app', success: true, skipped: true, reason: 'Duplicate notification suppressed (same reference within 10s)' }],
      }
    }
  } catch {
    // Dedup check failure should not prevent notification delivery
  }

  // Resolve user's preferred locale for buyer-facing notifications
  // Will be populated from notification_preferences after profile fetch below
  let userLocale: string | undefined

  // Generate content from templates (locale applied after profile fetch, see below)
  // title + message assigned after profile fetch so locale is available
  // NOT-4: template fns are caller-supplied — guard so a throwing one can't
  // break the "sendNotification never throws" contract money-path callers await.
  let actionUrl = ''
  try {
    actionUrl = config.actionUrl({
      ...templateData,
      ...(options?.vertical !== undefined ? { vertical: options.vertical } : {}),
    })
  } catch { actionUrl = '' }

  // Determine channels based on per-vertical urgency (NI-R19)
  const urgency = getNotificationUrgency(type, options?.vertical)
  let channels = URGENCY_CHANNELS[urgency]

  // Fetch user preferences and email (for email channel)
  let preferences = DEFAULT_PREFERENCES
  let userEmail = options?.userEmail
  let userPhone = options?.userPhone
  // NOT-5 (mig 202): hard-bounced / spam-complained addresses are suppressed —
  // the email channel is skipped (in_app always still delivers). Pre-migration
  // the column is simply absent from the row → falsy → not suppressed.
  let emailSuppressed = false
  // Critical bypass: immediate/urgent notifications skip tier gating entirely.
  const isCritical = urgency === 'immediate' || urgency === 'urgent'

  // Tier-based channel gating, shared by the prefetched + fetch paths.
  const applyTierGate = async (vendorTier: string | null) => {
    if (!isCritical && options?.vertical && vendorTier) {
      const { getTierNotificationChannels } = await import('@/lib/vendor-limits')
      const allowed = getTierNotificationChannels(vendorTier, options.vertical)
      channels = channels.filter(ch => allowed.includes(ch))
    }
  }

  if (options?.prefetched) {
    // NOT-2: batch caller already bulk-loaded this recipient — no per-recipient
    // user_profiles / vendor_profiles queries.
    const pf = options.prefetched
    preferences = { ...DEFAULT_PREFERENCES, ...pf.preferences }
    const pl = (pf.preferences as unknown as Record<string, unknown>).locale
    if (typeof pl === 'string') userLocale = pl
    if (!userEmail && pf.email) userEmail = pf.email
    if (!userPhone && pf.phone) userPhone = pf.phone
    emailSuppressed = !!pf.emailSuppressedAt
    await applyTierGate(pf.vendorTier)
  } else {
    try {
      const supabase = createServiceClient()
      const { data: profile } = await observed(supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single(), { table: 'user_profiles' })

      if (profile?.notification_preferences) {
        preferences = { ...DEFAULT_PREFERENCES, ...profile.notification_preferences as UserPreferences }
        // Read user's preferred locale for notification translation
        const prefs = profile.notification_preferences as Record<string, unknown>
        if (typeof prefs.locale === 'string') {
          userLocale = prefs.locale
        }
      }
      // Auto-resolve email/phone from profile if not provided by caller
      if (!userEmail && profile?.email) {
        userEmail = profile.email
      }
      if (!userPhone && profile?.phone) {
        userPhone = profile.phone
      }
      // NOT-5: select('*') carries email_suppressed_at once mig 202 is applied
      // (absent pre-migration → undefined → not suppressed).
      emailSuppressed = !!(profile as Record<string, unknown> | null)?.email_suppressed_at

      // Tier-based channel gating: restrict channels based on vendor's tier (both verticals)
      if (!isCritical && options?.vertical && profile?.user_id) {
        const { data: vendor } = await observed(supabase
          .from('vendor_profiles')
          .select('tier')
          .eq('user_id', profile.user_id)
          .eq('vertical_id', options.vertical)
          .single(), { table: 'vendor_profiles' })
        await applyTierGate(vendor?.tier ?? null)
      }
    } catch (prefError) {
      console.warn('[notifications] Failed to fetch user preferences, using defaults:', prefError)
    }
  }

  // Generate localized content from templates (after profile fetch so locale is available)
  // NOT-4: guarded — a throwing title/message template must not reject the promise.
  let title: string
  let message: string
  try {
    title = config.title(templateData, userLocale)
    message = config.message(templateData, userLocale)
  } catch {
    title = 'Notification'
    message = ''
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
        }, options?.vertical)
        if (result.messageId) {
          inAppNotificationId = result.messageId
        }
        results.push(result)
        break
      }
      case 'email': {
        if (emailSuppressed) {
          // NOT-5: hard bounce / spam complaint on file — every send to this
          // address is wasted spend + sender-reputation damage. The in_app
          // channel above already delivered the content.
          results.push({
            channel: 'email',
            success: true,
            skipped: true,
            reason: 'Email suppressed (hard bounce or spam complaint on file)',
          })
        } else if (userEmail) {
          results.push(await sendEmail(userEmail, title, message, options?.vertical, userLocale))
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
        const soundOn = preferences.sound_enabled !== false
        const pushResult = await sendPush(userId, title, message, actionUrl, urgency, soundOn, options?.vertical)
        results.push(pushResult)

        // M-14: SMS fallback when push fails entirely (all subscriptions failed or no subscriptions)
        // Only triggers if push was NOT skipped (user has push enabled) and SMS isn't already in the channel list
        if (!pushResult.success && !pushResult.skipped && !channels.includes('sms')) {
          if (preferences.sms_order_updates && userPhone) {
            const smsResult = await sendSms(userPhone, `${title}: ${message}`)
            results.push({ ...smsResult, reason: smsResult.reason || 'SMS fallback after push failure' })
          }
        }
        break
      }
    }
  }

  // Log any channel failures to error tracking
  const failures = results.filter(r => !r.success)
  if (failures.length > 0) {
    const error = new TracedError(
      'ERR_NOTIF_001',
      `Notification delivery failed: ${failures.map(f => `${f.channel}: ${f.error}`).join('; ')}`,
      {
        userId,
        originalError: {
          notificationType: type,
          failedChannels: failures.map(f => ({ channel: f.channel, error: f.error })),
        },
      }
    )
    // NOT-4: logError is the last un-guarded await; swallow so it can't reject
    // the "never throws" contract (console as the last-resort trail).
    try {
      await logError(error)
    } catch (logErr) {
      console.error('[notifications] logError failed:', logErr instanceof Error ? logErr.message : logErr)
    }
  }

  return {
    notificationType: type,
    channels: results,
    ...(inAppNotificationId !== undefined ? { inAppNotificationId } : {}),
  }
}

/**
 * Send a notification to multiple users (batch).
 * Useful for admin broadcasts or market-wide announcements.
 *
 * NOT-2: bulk-loads the FULL profile (preferences + email + phone) AND the
 * vendor tiers in exactly 2 queries, then threads them into each sendNotification
 * as `prefetched` so the per-recipient user_profiles + vendor_profiles queries
 * are skipped entirely. Previously it prefetched only email/phone, so each
 * inner call still ran its own 2 queries — N recipients → ~2N reads. Now → 2.
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

  const prefetchMap = new Map<string, {
    preferences: UserPreferences
    email: string | null
    phone: string | null
    vendorTier: string | null
    emailSuppressedAt?: string | null
  }>()
  try {
    const supabase = createServiceClient()
    // Query 1: full profiles (preferences carries locale + channel prefs).
    // NOT-5 (mig 202): the enriched select includes email_suppressed_at;
    // pre-migration (column absent → whole query errors) retry the legacy
    // shape so batch sends keep working, just without suppression.
    let profiles: Array<Record<string, unknown>> | null = null
    const enriched = await supabase
      .from('user_profiles')
      .select('user_id, email, phone, notification_preferences, email_suppressed_at')
      .in('user_id', userIds)
    if (enriched.error) {
      const legacy = await supabase
        .from('user_profiles')
        .select('user_id, email, phone, notification_preferences')
        .in('user_id', userIds)
      profiles = legacy.data
    } else {
      profiles = enriched.data
    }

    // Query 2: vendor tiers for this vertical (only when tier-gating applies).
    const tierByUser = new Map<string, string | null>()
    if (options?.vertical) {
      const { data: vendors } = await observed(supabase
        .from('vendor_profiles')
        .select('user_id, tier')
        .in('user_id', userIds)
        .eq('vertical_id', options.vertical), { table: 'vendor_profiles' })
      for (const v of vendors ?? []) {
        tierByUser.set(v.user_id as string, (v.tier as string | null) ?? null)
      }
    }

    for (const p of profiles ?? []) {
      prefetchMap.set(p.user_id as string, {
        preferences: (p.notification_preferences as UserPreferences) ?? DEFAULT_PREFERENCES,
        email: (p.email as string | null) ?? null,
        phone: (p.phone as string | null) ?? null,
        vendorTier: tierByUser.get(p.user_id as string) ?? null,
        emailSuppressedAt: ((p as Record<string, unknown>).email_suppressed_at as string | null | undefined) ?? null,
      })
    }
  } catch {
    // If the bulk fetch fails, sendNotification falls back to its own per-
    // recipient fetch (no prefetched passed) — correctness over efficiency.
  }

  const results = await Promise.all(
    userIds.map((userId) => {
      const prefetched = prefetchMap.get(userId)
      return sendNotification(userId, type, templateData, {
        ...options,
        ...(prefetched ? { prefetched } : {}),
      })
    })
  )
  return results
}

/**
 * Send a transactional email to an address that is NOT a platform user.
 *
 * Everything else in this module targets a user_id — it writes an in_app row,
 * honours per-user notification preferences, and respects suppression. A cause
 * beneficiary org has no account here at all, so none of that applies: there is
 * no inbox to write to and no preferences to consult.
 *
 * Use ONLY for genuinely transactional mail to an outside party who asked for it
 * (today: the Stripe onboarding invitation an admin sends to a beneficiary).
 * Never for anything resembling marketing — an external address has no
 * preference record and therefore no way to say no beyond the unsubscribe header
 * that sendEmail already attaches.
 */
export async function sendExternalEmail(
  toEmail: string,
  subject: string,
  body: string,
  vertical?: string
): Promise<ChannelResult> {
  return sendEmail(toEmail, subject, body, vertical)
}
