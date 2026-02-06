/**
 * Notification Service - Public API
 *
 * This module is the main entry point for sending notifications.
 * It re-exports from the type registry and service orchestrator,
 * and provides backward-compatible helper functions.
 *
 * Usage:
 *   import { sendNotification } from '@/lib/notifications'
 *   await sendNotification(userId, 'order_ready', { orderNumber: '123', vendorName: 'Farm Fresh' })
 *
 * Or use helpers:
 *   import { notifyBuyerOrderReady } from '@/lib/notifications'
 *   await notifyBuyerOrderReady(userId, { orderNumber: '123', vendorName: 'Farm Fresh' })
 */

// Re-export everything from the service and types
export { sendNotification, sendNotificationBatch } from './service'
export type { NotificationResult } from './service'
export {
  NOTIFICATION_REGISTRY,
  URGENCY_CHANNELS,
  getNotificationConfig,
} from './types'
export type {
  NotificationType,
  NotificationChannel,
  NotificationUrgency,
  NotificationTypeConfig,
  NotificationTemplateData,
} from './types'

import { sendNotification } from './service'
import type { NotificationTemplateData } from './types'

// ── Backward-Compatible Helper Functions ─────────────────────────────
// These match the previous API shape for existing call sites.

/**
 * Notify vendor of a new paid order
 */
export async function notifyVendorNewOrder(
  vendorUserId: string,
  data: NotificationTemplateData,
  options?: { vertical?: string; vendorEmail?: string }
) {
  return sendNotification(vendorUserId, 'new_paid_order', data, {
    vertical: options?.vertical,
    userEmail: options?.vendorEmail,
  })
}

/**
 * Notify buyer that their order was confirmed by vendor
 */
export async function notifyBuyerOrderConfirmed(
  buyerUserId: string,
  data: NotificationTemplateData,
  options?: { vertical?: string; buyerEmail?: string }
) {
  return sendNotification(buyerUserId, 'order_confirmed', data, {
    vertical: options?.vertical,
    userEmail: options?.buyerEmail,
  })
}

/**
 * Notify buyer that their order is ready for pickup (IMMEDIATE urgency)
 */
export async function notifyBuyerOrderReady(
  buyerUserId: string,
  data: NotificationTemplateData,
  options?: { vertical?: string; buyerEmail?: string; buyerPhone?: string }
) {
  return sendNotification(buyerUserId, 'order_ready', data, {
    vertical: options?.vertical,
    userEmail: options?.buyerEmail,
    userPhone: options?.buyerPhone,
  })
}

/**
 * Notify buyer that vendor cancelled their order (URGENT - SMS fallback)
 */
export async function notifyBuyerOrderCancelled(
  buyerUserId: string,
  data: NotificationTemplateData,
  options?: { vertical?: string; buyerEmail?: string; buyerPhone?: string }
) {
  return sendNotification(buyerUserId, 'order_cancelled_by_vendor', data, {
    vertical: options?.vertical,
    userEmail: options?.buyerEmail,
    userPhone: options?.buyerPhone,
  })
}

/**
 * Notify vendor that buyer cancelled their order
 */
export async function notifyVendorOrderCancelled(
  vendorUserId: string,
  data: NotificationTemplateData,
  options?: { vertical?: string; vendorEmail?: string }
) {
  return sendNotification(vendorUserId, 'order_cancelled_by_buyer', data, {
    vertical: options?.vertical,
    userEmail: options?.vendorEmail,
  })
}

/**
 * Notify about an expired order
 */
export async function notifyOrderExpired(
  userId: string,
  data: NotificationTemplateData,
  options?: { vertical?: string; userEmail?: string }
) {
  return sendNotification(userId, 'order_expired', data, {
    vertical: options?.vertical,
    userEmail: options?.userEmail,
  })
}
