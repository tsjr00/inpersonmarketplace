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
  | 'order_expired'
  | 'pickup_missed'
  // Vendor-facing
  | 'new_paid_order'
  | 'order_cancelled_by_buyer'
  | 'vendor_approved'
  | 'vendor_rejected'
  | 'market_approved'
  | 'pickup_confirmation_needed'
  | 'pickup_issue_reported'
  | 'inventory_low_stock'
  | 'inventory_out_of_stock'
  | 'payout_processed'
  // Admin-facing
  | 'new_vendor_application'

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
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/buyer/orders`,
  },

  order_ready: {
    urgency: 'standard',
    audience: 'buyer',
    title: () => `Order Ready for Pickup`,
    message: (d) => `Your order #${d.orderNumber} from ${d.vendorName} has been marked ready for pickup${d.marketName ? ` at ${d.marketName}` : ''}. It will be waiting for you during pickup hours — no need to rush.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/buyer/orders`,
  },

  order_fulfilled: {
    urgency: 'info',
    audience: 'buyer',
    title: () => `Order Complete`,
    message: (d) => `Order #${d.orderNumber} has been marked as picked up. Thanks for shopping with ${d.vendorName}!`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/buyer/orders`,
  },

  order_cancelled_by_vendor: {
    urgency: 'urgent',
    audience: 'buyer',
    title: () => `Order Cancelled`,
    message: (d) => `${d.vendorName} cancelled your order #${d.orderNumber}.${d.reason ? ` Reason: ${d.reason}` : ''} A refund will be processed.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/buyer/orders`,
  },

  order_expired: {
    urgency: 'standard',
    audience: 'buyer',
    title: () => `Order Expired`,
    message: (d) => `Order #${d.orderNumber} has expired because it wasn't confirmed in time.${d.amountCents ? ` A refund of $${(d.amountCents / 100).toFixed(2)} will be processed.` : ''}`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/buyer/orders`,
  },

  pickup_missed: {
    urgency: 'standard',
    audience: 'buyer',
    title: () => `Pickup Not Confirmed`,
    message: (d) => `Your order #${d.orderNumber}${d.itemTitle ? ` (${d.itemTitle})` : ''} from ${d.vendorName} was not marked as picked up during the scheduled pickup window. If you did pick up your items, please mark it as received in the app now. If there was a miscommunication, please reach out to the vendor directly to clarify.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/buyer/orders`,
  },

  // ── Vendor-facing ────────────────────────────────────────────────

  new_paid_order: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `New Order Received`,
    message: (d) => `${d.buyerName || 'A customer'} placed order #${d.orderNumber}${d.itemTitle ? ` for ${d.itemTitle}` : ''}.${d.marketName ? ` Pickup at ${d.marketName}` : ''}${d.pickupDate ? ` on ${d.pickupDate}` : ''}.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/vendor/dashboard`,
  },

  order_cancelled_by_buyer: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Order Cancelled by Customer`,
    message: (d) => `${d.buyerName || 'A customer'} cancelled order #${d.orderNumber}${d.itemTitle ? ` for ${d.itemTitle}` : ''}.${d.reason ? ` Reason: ${d.reason}` : ''}`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/vendor/dashboard`,
  },

  vendor_approved: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Vendor Application Approved!`,
    message: () => `Congratulations! Your vendor application has been approved. You can now start listing products.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/vendor/dashboard`,
  },

  vendor_rejected: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Vendor Application Update`,
    message: (d) => `Your vendor application was not approved at this time.${d.reason ? ` Reason: ${d.reason}` : ''} You may reapply after addressing any issues.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/vendor-signup`,
  },

  market_approved: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Market Approved!`,
    message: (d) => `Your market "${d.marketName}" has been approved and is now live.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/vendor/dashboard`,
  },

  pickup_confirmation_needed: {
    urgency: 'immediate',
    audience: 'vendor',
    title: () => `Pickup Confirmation Needed`,
    message: (d) => `${d.buyerName || 'A customer'} says they've picked up order #${d.orderNumber}. Please confirm within 30 seconds.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/vendor/dashboard`,
  },

  pickup_issue_reported: {
    urgency: 'urgent',
    audience: 'vendor',
    title: () => `Pickup Issue Reported`,
    message: (d) => `An issue was reported for order #${d.orderNumber}.${d.reason ? ` Details: ${d.reason}` : ''} Please check your dashboard.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/vendor/dashboard`,
  },

  inventory_low_stock: {
    urgency: 'info',
    audience: 'vendor',
    title: () => `Low Stock Warning`,
    message: (d) => `"${d.listingTitle}" is running low — ${d.quantity} remaining.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/vendor/listings`,
  },

  inventory_out_of_stock: {
    urgency: 'standard',
    audience: 'vendor',
    title: () => `Item Out of Stock`,
    message: (d) => `"${d.listingTitle}" is now out of stock. Update your listing to restock.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/vendor/listings`,
  },

  payout_processed: {
    urgency: 'info',
    audience: 'vendor',
    title: () => `Payout Processed`,
    message: (d) => `A payout${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} has been sent to your account.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/vendor/dashboard`,
  },

  // ── Admin-facing ─────────────────────────────────────────────────

  new_vendor_application: {
    urgency: 'standard',
    audience: 'admin',
    title: () => `New Vendor Application`,
    message: (d) => `${d.vendorName || 'A new vendor'} has submitted an application for review.`,
    actionUrl: (d) => `/${d.vertical || 'farmers-market'}/admin/vendors`,
  },
}

/**
 * Get the notification config for a given type.
 * Returns undefined for unknown types (forward-compatible).
 */
export function getNotificationConfig(type: string): NotificationTypeConfig | undefined {
  return NOTIFICATION_REGISTRY[type as NotificationType]
}
