/**
 * Notification Service - Channel-Aware Orchestrator
 *
 * Determines which channels to use based on notification type urgency,
 * checks user preferences, and dispatches to each channel.
 *
 * Channels:
 *   - in_app: Always (writes to notifications table)
 *   - email:  Stubbed (Resend - connect tomorrow)
 *   - sms:    Stubbed (Twilio - connect tomorrow)
 *   - push:   Stubbed (Web Push API - needs VAPID keys)
 */

import { createServiceClient } from '@/lib/supabase/server'
import {
  type NotificationType,
  type NotificationTemplateData,
  type NotificationChannel,
  NOTIFICATION_REGISTRY,
  URGENCY_CHANNELS,
} from './types'

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
  _userEmail: string,
  _subject: string,
  _body: string
): Promise<ChannelResult> {
  // STUB: Will connect Resend here
  // import { Resend } from 'resend'
  // const resend = new Resend(process.env.RESEND_API_KEY)
  // const { data, error } = await resend.emails.send({
  //   from: 'Farmers Marketing <noreply@farmersmarketing.app>',
  //   to: userEmail,
  //   subject,
  //   text: body,
  // })
  return {
    channel: 'email',
    success: true,
    skipped: true,
    reason: 'Email service not yet connected (Resend)',
  }
}

async function sendSms(
  _phoneNumber: string,
  _body: string
): Promise<ChannelResult> {
  // STUB: Will connect Twilio here
  // import twilio from 'twilio'
  // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  // const message = await client.messages.create({
  //   body,
  //   from: process.env.TWILIO_PHONE_NUMBER,
  //   to: phoneNumber,
  // })
  return {
    channel: 'sms',
    success: true,
    skipped: true,
    reason: 'SMS service not yet connected (Twilio)',
  }
}

async function sendPush(
  _userId: string,
  _title: string,
  _body: string,
  _actionUrl: string
): Promise<ChannelResult> {
  // STUB: Will implement Web Push here
  // 1. Look up push_subscriptions for this user
  // 2. Send via web-push library with VAPID keys
  return {
    channel: 'push',
    success: true,
    skipped: true,
    reason: 'Push notifications not yet configured (needs VAPID keys)',
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
  const channels = URGENCY_CHANNELS[config.urgency]

  // Fetch user preferences
  let preferences = DEFAULT_PREFERENCES
  try {
    const supabase = createServiceClient()
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .single()

    if (profile?.notification_preferences) {
      preferences = { ...DEFAULT_PREFERENCES, ...profile.notification_preferences as UserPreferences }
    }
  } catch {
    // Use defaults if we can't fetch preferences
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
        if (options?.userEmail) {
          results.push(await sendEmail(options.userEmail, title, message))
        } else {
          results.push({
            channel: 'email',
            success: true,
            skipped: true,
            reason: 'No email address provided',
          })
        }
        break
      }
      case 'sms': {
        // SMS is fallback when push is not enabled
        if (preferences.push_enabled) {
          results.push({
            channel: 'sms',
            success: true,
            skipped: true,
            reason: 'Push is enabled, SMS not needed',
          })
        } else if (options?.userPhone) {
          results.push(await sendSms(options.userPhone, `${title}: ${message}`))
        } else {
          results.push({
            channel: 'sms',
            success: true,
            skipped: true,
            reason: 'No phone number provided',
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
 */
export async function sendNotificationBatch(
  userIds: string[],
  type: NotificationType,
  templateData: NotificationTemplateData,
  options?: {
    vertical?: string
  }
): Promise<NotificationResult[]> {
  const results = await Promise.all(
    userIds.map((userId) => sendNotification(userId, type, templateData, options))
  )
  return results
}
