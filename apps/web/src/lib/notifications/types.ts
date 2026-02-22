/**
 * Notification Type Registry
 *
 * Central definition of all notification types with their:
 * - Urgency level (determines which channels fire)
 * - Channel mapping
 * - Template (title, message pattern)
 * - Action URL pattern (where to navigate on click)
 *
 * Urgency tiers:
 *   immediate → Push + In-app (free)
 *   urgent    → SMS + In-app (~$0.008/msg)
 *   standard  → Email + In-app (~$0.001/msg)
 *   info      → Email only (~$0.001/msg)
 */

// ── Channel & Urgency Types ──────────────────────────────────────────

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push'

export type NotificationUrgency = 'immediate' | 'urgent' | 'standard' | 'info'

/** Maps urgency to channels that should fire */
export const URGENCY_CHANNELS: Record<NotificationUrgency, NotificationChannel[]> = {
  immediate: ['push', 'in_app'],
  urgent: ['sms', 'in_app'],
  standard: ['email', 'in_app'],
  info: ['email'],
}

// ── Notification Type IDs ────────────────────────────────────────────

export type NotificationType =
  // Buyer-facing
  | 'order_confirmed'
  | 'order_ready'
  | 'order_fulfilled'
  | 'order_cancelled_by_vendor'
  | 'order_refunded'
  | 'order_expired'
  | 'pickup_missed'
  | 'market_box_skip'
  | 'issue_resolved'
  // Vendor-facing
  | 'new_paid_order'
  | 'new_external_order'
  | 'external_payment_reminder'
  | 'external_payment_auto_confirmed'
  | 'order_cancelled_by_buyer'
  | 'vendor_approved'
  | 'vendor_rejected'
  | 'market_approved'
  | 'pickup_confirmation_needed'
  | 'pickup_issue_reported'
  | 'inventory_low_stock'
  | 'inventory_out_of_stock'
  | 'payout_processed'
  | 'payout_failed'
  | 'vendor_cancellation_warning'
  | 'vendor_quality_alert'
  // Admin-facing
  | 'new_vendor_application'
  | 'issue_disputed'

// ── Template Types ───────────────────────────────────────────────────

export interface NotificationTemplateData {
  orderNumber?: string
  itemTitle?: string
  vendorName?: string
  buyerName?: string
  marketName?: string
  pickupDate?: string
  amountCents?: number
  reason?: string
  quantity?: number
  listingTitle?: string
  vendorId?: string
  orderId?: string
  orderItemId?: string
  cancellationRate?: number
  cancelledCount?: number
  confirmedCount?: number
  offeringName?: string
  subscriptionId?: string
  resolution?: string
  paymentMethod?: string
  pendingOrderCount?: number
  findingsCount?: number
  findingsSummary?: string
}

export interface NotificationTypeConfig {
  urgency: NotificationUrgency
  audience: 'buyer' | 'vendor' | 'admin'
  title: (data: NotificationTemplateData) => string
  message: (data: NotificationTemplateData) => string
  /** Returns the path to navigate to when notification is clicked */
  actionUrl: (data: NotificationTemplateData & { vertical?: string }) => string
}

// ── Type Registry ────────────────────────────────────────────────────

export const NOTIFICATION_REGISTRY: Record<NotificationType, NotificationTypeConfig> = {
  // ── Buyer-facing ─────────────────────────────────────────────────

  order_confirmed: {
    urgency: 'standard',
    audience: 'buyer',
    title: (d) => `Order Confirmed`,
    message: (d) => `${d.vendorName} confirmed your order #${d.orderNumber}${d.itemTitle ? ` for ${d.itemTitle}` : ''}. We'll notify you when it's ready for pickup.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_ready: {
    urgency: 'immediate',
    audience: 'buyer',
    title: () => `Order Ready for Pickup`,
    message: (d) => `Your order #${d.orderNumber} from ${d.vendorName} has been marked ready for pickup${d.marketName ? ` at ${d.marketName}` : ''}. It will be waiting for you during pickup hours — no need to rush.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_fulfilled: {
    urgency: 'info',
    audience: 'buyer',
    title: () => `Order Complete`,
    message: (d) => `Order #${d.orderNumber} has been marked as picked up. Thanks for shopping with ${d.vendorName}!`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_cancelled_by_vendor: {
    urgency: 'urgent',
    audience: 'buyer',
    title: () => `Order Cancelled`,
    message: (d) => `${d.vendorName} cancelled your order #${d.orderNumber}.${d.reason ? ` Reason: ${d.reason}` : ''} A refund will be processed.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_refunded: {
    urgency: 'standard',
    audience: 'buyer',
    title: () => `Order Refunded`,
    message: (d) => `A refund${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} has been issued for order #${d.orderNumber}. It may take 5-10 business days to appear on your statement.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_expired: {
    urgency: 'standard',
    audience: 'buyer',
    title: () => `Order Expired`,
    message: (d) => `Order #${d.orderNumber} has expired because it wasn't confirmed in time.${d.amountCents ? ` A refund of $${(d.amountCents / 100).toFixed(2)} will be processed.` : ''}`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  pickup_missed: {
    urgency: 'standard',
    audience: 'buyer',
    title: () => `Pickup Not Confirmed`,
    message: (d) => `Your order #${d.orderNumber}${d.itemTitle ? ` (${d.itemTitle})` : ''} from ${d.vendorName} was not marked as picked up during the scheduled pickup window. If you did pick up your items, please mark it as received in the app now. If there was a miscommunication, please reach out to the vendor directly to clarify.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  market_box_skip: {
    urgency: 'standard',
    audience: 'buyer',
    title: () => `Market Box Week Skipped`,
    message: (d) => `${d.vendorName} has skipped your ${d.offeringName || 'Market Box'} pickup scheduled for ${d.pickupDate}. An extension week has been added to your subscription.${d.reason ? ` Reason: ${d.reason}` : ''}`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/subscriptions`,
  },

  issue_resolved: {
    urgency: 'standard',
    audience: 'buyer',
    title: () => `Issue Resolved`,
    message: (d) => `The issue you reported for order #${d.orderNumber} has been resolved.${d.resolution ? ` Resolution: ${d.resolution}` : ''}`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  // ── Vendor-facing ────────────────────────────────────────────────

  new_paid_order: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `New Order Received`,
    message: (d) => `${d.buyerName || 'A customer'} placed order #${d.orderNumber}${d.itemTitle ? ` for ${d.itemTitle}` : ''}.${d.marketName ? ` Pickup at ${d.marketName}` : ''}${d.pickupDate ? ` on ${d.pickupDate}` : ''}.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  new_external_order: {
    urgency: 'immediate',
    audience: 'vendor',
    title: () => `New External Payment Order`,
    message: (d) => `New order #${d.orderNumber} via ${d.paymentMethod || 'external payment'}! ${d.paymentMethod === 'cash' ? 'Customer will pay cash at pickup.' : `Check your ${d.paymentMethod} account and confirm when you've received`}${d.amountCents ? ` $${(d.amountCents / 100).toFixed(2)}` : ''}.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  external_payment_reminder: {
    urgency: 'immediate',
    audience: 'vendor',
    title: () => `Unconfirmed External Payment Orders`,
    message: (d) => `You have ${d.pendingOrderCount || ''} unconfirmed external payment order${(d.pendingOrderCount || 0) > 1 ? 's' : ''}. Please verify payment and confirm in your dashboard.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  external_payment_auto_confirmed: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `External Payment Auto-Confirmed`,
    message: (d) => `Order #${d.orderNumber} was auto-confirmed because the pickup date has passed. If you did not receive payment, please dispute within 7 days by contacting support.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  order_cancelled_by_buyer: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Order Cancelled by Customer`,
    message: (d) => `${d.buyerName || 'A customer'} cancelled order #${d.orderNumber}${d.itemTitle ? ` for ${d.itemTitle}` : ''}.${d.reason ? ` Reason: ${d.reason}` : ''}`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  vendor_approved: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Vendor Application Approved!`,
    message: () => `Congratulations! Your vendor application has been approved. You can now start listing products.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  vendor_rejected: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Vendor Application Update`,
    message: (d) => `Your vendor application was not approved at this time.${d.reason ? ` Reason: ${d.reason}` : ''} You may reapply after addressing any issues.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor-signup`,
  },

  market_approved: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Market Approved!`,
    message: (d) => `Your market "${d.marketName}" has been approved and is now live.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  pickup_confirmation_needed: {
    urgency: 'immediate',
    audience: 'vendor',
    title: () => `Pickup Confirmation Needed`,
    message: (d) => `${d.buyerName || 'A customer'} says they've picked up order #${d.orderNumber}. Please confirm within 30 seconds.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  pickup_issue_reported: {
    urgency: 'urgent',
    audience: 'vendor',
    title: () => `Pickup Issue Reported`,
    message: (d) => `An issue was reported for order #${d.orderNumber}.${d.reason ? ` Details: ${d.reason}` : ''} Please check your dashboard.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  inventory_low_stock: {
    urgency: 'info',
    audience: 'vendor',
    title: () => `Low Stock Warning`,
    message: (d) => `"${d.listingTitle}" is running low — ${d.quantity} remaining.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/listings`,
  },

  inventory_out_of_stock: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Item Out of Stock`,
    message: (d) => `"${d.listingTitle}" is now out of stock. Update your listing to restock.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/listings`,
  },

  payout_processed: {
    urgency: 'info',
    audience: 'vendor',
    title: () => `Payout Processed`,
    message: (d) => `A payout${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} has been sent to your account.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  payout_failed: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Payout Failed`,
    message: (d) => `A payout${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} for order #${d.orderNumber} could not be processed. We'll retry automatically. If this persists, please check your Stripe account settings.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  vendor_cancellation_warning: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Order Cancellation Rate Notice`,
    message: (d) => `Your order cancellation rate is ${d.cancellationRate ? `${d.cancellationRate}%` : 'above average'} (${d.cancelledCount || 0} cancelled out of ${d.confirmedCount || 0} confirmed orders). Confirming an order is a commitment to fulfill it. Continued cancellations may result in account restrictions. If you are experiencing issues fulfilling orders, please reach out to support.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  vendor_quality_alert: {
    urgency: 'standard',
    audience: 'vendor',
    title: (d) => `Quality Check: ${d.findingsCount || 0} item${(d.findingsCount || 0) !== 1 ? 's' : ''} need attention`,
    message: (d) => d.findingsSummary || `We found ${d.findingsCount || 0} potential issue${(d.findingsCount || 0) !== 1 ? 's' : ''} with your listings or schedule. Please review.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/quality`,
  },

  // ── Admin-facing ─────────────────────────────────────────────────

  new_vendor_application: {
    urgency: 'standard',
    audience: 'admin',
    title: () => `New Vendor Application`,
    message: (d) => `${d.vendorName || 'A new vendor'} has submitted an application for review.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/admin/vendors`,
  },

  issue_disputed: {
    urgency: 'standard',
    audience: 'admin',
    title: () => `Vendor Disputed Buyer Issue`,
    message: (d) => `${d.vendorName} resolved a buyer-reported issue on order #${d.orderNumber} in their own favor (confirmed delivery). Review may be needed.`,
    actionUrl: () => `/admin/feedback`,
  },
}

/**
 * Get the notification config for a given type.
 * Returns undefined for unknown types (forward-compatible).
 */
export function getNotificationConfig(type: string): NotificationTypeConfig | undefined {
  return NOTIFICATION_REGISTRY[type as NotificationType]
}
