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
  | 'stale_confirmed_buyer'
  | 'market_box_skip'
  | 'market_box_pickup_missed'
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
  | 'stale_confirmed_vendor'
  | 'stale_confirmed_vendor_final'
  | 'vendor_quality_alert'
  // Vendor trial lifecycle
  | 'vendor_approved_trial'
  | 'trial_reminder_14d'
  | 'trial_reminder_7d'
  | 'trial_reminder_3d'
  | 'trial_expired'
  | 'trial_grace_expired'
  // Admin-facing
  | 'new_vendor_application'
  | 'issue_disputed'
  // Catering / Events
  | 'catering_request_received'
  | 'catering_vendor_invited'
  | 'catering_vendor_responded'
  | 'event_feedback_request'
  | 'vendor_event_approved'
  | 'vendor_event_application_submitted'

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
  trialDays?: number
  trialTier?: string
  trialEndsAt?: string
  unpublishedCount?: number
  deactivatedBoxCount?: number
  // Catering / Events
  companyName?: string
  headcount?: number
  eventDate?: string
  eventAddress?: string
  responseAction?: string  // 'accepted' | 'declined'
  vertical?: string
}

export type NotificationSeverity = 'critical' | 'warning' | 'info'

export interface NotificationTypeConfig {
  urgency: NotificationUrgency
  severity: NotificationSeverity
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
    severity: 'info',
    audience: 'buyer',
    title: (d) => `Order Confirmed`,
    message: (d) => `${d.vendorName} confirmed your order #${d.orderNumber}${d.itemTitle ? ` for ${d.itemTitle}` : ''}. We'll notify you when it's ready for pickup.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_ready: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'buyer',
    title: () => `Order Ready for Pickup`,
    message: (d) => `Your order #${d.orderNumber} from ${d.vendorName} has been marked ready for pickup${d.marketName ? ` at ${d.marketName}` : ''}. It will be waiting for you during pickup hours — no need to rush.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_fulfilled: {
    urgency: 'info',
    severity: 'info',
    audience: 'buyer',
    title: () => `Order Complete`,
    message: (d) => `Order #${d.orderNumber} has been marked as picked up. Thanks for shopping with ${d.vendorName}!`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_cancelled_by_vendor: {
    urgency: 'immediate',
    severity: 'critical',
    audience: 'buyer',
    title: () => `Order Cancelled`,
    message: (d) => `${d.vendorName} cancelled your order #${d.orderNumber}.${d.reason ? ` Reason: ${d.reason}` : ''} A refund will be processed.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_refunded: {
    urgency: 'urgent',
    severity: 'info',
    audience: 'buyer',
    title: () => `Order Refunded`,
    message: (d) => `A refund${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} has been issued for order #${d.orderNumber}. It may take 5-10 business days to appear on your statement.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_expired: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: () => `Order Expired`,
    message: (d) => `Order #${d.orderNumber} has expired because it wasn't confirmed in time.${d.amountCents ? ` A refund of $${(d.amountCents / 100).toFixed(2)} will be processed.` : ''}`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  pickup_missed: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'buyer',
    title: () => `Pickup Not Confirmed`,
    message: (d) => `Your order #${d.orderNumber}${d.itemTitle ? ` (${d.itemTitle})` : ''} from ${d.vendorName} was not marked as picked up during the scheduled pickup window. If you did pick up your items, please mark it as received in the app now. If there was a miscommunication, please reach out to the vendor directly to clarify.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  stale_confirmed_buyer: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'buyer',
    title: () => `Order Update Needed`,
    message: (d) => `Your order #${d.orderNumber}${d.itemTitle ? ` for ${d.itemTitle}` : ''} was confirmed by ${d.vendorName} but doesn't appear to have been completed yet. We've reached out to the vendor to resolve this. You can also contact them directly.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  market_box_skip: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: () => `Market Box Week Skipped`,
    message: (d) => `${d.vendorName} has skipped your ${d.offeringName || 'Market Box'} pickup scheduled for ${d.pickupDate}. An extension week has been added to your subscription.${d.reason ? ` Reason: ${d.reason}` : ''}`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/subscriptions`,
  },

  market_box_pickup_missed: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'buyer',
    title: () => `Market Box Pickup Missed`,
    message: (d) => `Your ${d.offeringName || 'Market Box'} pickup from ${d.vendorName} scheduled for ${d.pickupDate} was not picked up and has been marked as missed. If you believe this is an error, please contact the vendor.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/subscriptions`,
  },

  issue_resolved: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: () => `Issue Resolved`,
    message: (d) => `The issue you reported for order #${d.orderNumber} has been resolved.${d.resolution ? ` Resolution: ${d.resolution}` : ''}`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  // ── Vendor-facing ────────────────────────────────────────────────

  new_paid_order: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'vendor',
    title: () => `New Order Received`,
    message: (d) => `${d.buyerName || 'A customer'} placed order #${d.orderNumber}${d.itemTitle ? ` for ${d.itemTitle}` : ''}.${d.marketName ? ` Pickup at ${d.marketName}` : ''}${d.pickupDate ? ` on ${d.pickupDate}` : ''}.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  new_external_order: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'vendor',
    title: () => `New External Payment Order`,
    message: (d) => `New order #${d.orderNumber} via ${d.paymentMethod || 'external payment'}! ${d.paymentMethod === 'cash' ? 'Customer will pay cash at pickup.' : `Check your ${d.paymentMethod} account and confirm when you've received`}${d.amountCents ? ` $${(d.amountCents / 100).toFixed(2)}` : ''}.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  external_payment_reminder: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'vendor',
    title: () => `Unconfirmed External Payment Orders`,
    message: (d) => `You have ${d.pendingOrderCount || ''} unconfirmed external payment order${(d.pendingOrderCount || 0) > 1 ? 's' : ''}. Please verify payment and confirm in your dashboard.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  external_payment_auto_confirmed: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: () => `External Payment Auto-Confirmed`,
    message: (d) => `Order #${d.orderNumber} was auto-confirmed because the pickup date has passed. If you did not receive payment, please dispute within 7 days by contacting support.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  order_cancelled_by_buyer: {
    urgency: 'immediate',
    severity: 'critical',
    audience: 'vendor',
    title: () => `Order Cancelled by Customer`,
    message: (d) => `${d.buyerName || 'A customer'} cancelled order #${d.orderNumber}${d.itemTitle ? ` for ${d.itemTitle}` : ''}.${d.reason ? ` Reason: ${d.reason}` : ''}`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  vendor_approved: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: () => `Vendor Application Approved!`,
    message: () => `Congratulations! Your vendor application has been approved. You can now start listing products.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  vendor_rejected: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: () => `Vendor Application Update`,
    message: (d) => `Your vendor application was not approved at this time.${d.reason ? ` Reason: ${d.reason}` : ''} You may reapply after addressing any issues.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor-signup`,
  },

  market_approved: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: () => `Market Approved!`,
    message: (d) => `Your market "${d.marketName}" has been approved and is now live.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  pickup_confirmation_needed: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'vendor',
    title: () => `Pickup Confirmation Needed`,
    message: (d) => `${d.buyerName || 'A customer'} says they've picked up order #${d.orderNumber}. Please confirm within 30 seconds.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  pickup_issue_reported: {
    urgency: 'urgent',
    severity: 'critical',
    audience: 'vendor',
    title: () => `Pickup Issue Reported`,
    message: (d) => `An issue was reported for order #${d.orderNumber}.${d.reason ? ` Details: ${d.reason}` : ''} Please check your dashboard.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  inventory_low_stock: {
    urgency: 'info',
    severity: 'warning',
    audience: 'vendor',
    title: () => `Low Stock Warning`,
    message: (d) => `"${d.listingTitle}" is running low — ${d.quantity} remaining.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/listings`,
  },

  inventory_out_of_stock: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: () => `Item Out of Stock`,
    message: (d) => `"${d.listingTitle}" is now out of stock. Update your listing to restock.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/listings`,
  },

  payout_processed: {
    urgency: 'info',
    severity: 'info',
    audience: 'vendor',
    title: () => `Payout Processed`,
    message: (d) => `A payout${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} has been sent to your account.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  payout_failed: {
    urgency: 'urgent',
    severity: 'critical',
    audience: 'vendor',
    title: () => `Payout Failed`,
    message: (d) => `A payout${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} for order #${d.orderNumber} could not be processed. We'll retry automatically. If this persists, please check your Stripe account settings.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  stale_confirmed_vendor: {
    urgency: 'immediate',
    severity: 'critical',
    audience: 'vendor',
    title: () => `Missed Order — Action Needed`,
    message: (d) => `Order #${d.orderNumber}${d.itemTitle ? ` (${d.itemTitle})` : ''} was confirmed but never marked ready. The pickup date has passed. Please mark as fulfilled if the customer received their items, or report a problem.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  stale_confirmed_vendor_final: {
    urgency: 'standard',
    severity: 'critical',
    audience: 'vendor',
    title: () => `Order Action Required — Service Interruption Possible`,
    message: (d) => `Order #${d.orderNumber}${d.itemTitle ? ` (${d.itemTitle})` : ''} still needs resolution. Your order management will be restricted until you mark this order as fulfilled or report an issue. Open the app to resolve this now.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  vendor_cancellation_warning: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: () => `Order Cancellation Rate Notice`,
    message: (d) => `Your order cancellation rate is ${d.cancellationRate ? `${d.cancellationRate}%` : 'above average'} (${d.cancelledCount || 0} cancelled out of ${d.confirmedCount || 0} confirmed orders). Confirming an order is a commitment to fulfill it. Continued cancellations may result in account restrictions. If you are experiencing issues fulfilling orders, please reach out to support.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  vendor_quality_alert: {
    urgency: 'standard',
    severity: 'critical',
    audience: 'vendor',
    title: (d) => `Quality Check: ${d.findingsCount || 0} item${(d.findingsCount || 0) !== 1 ? 's' : ''} need attention`,
    message: (d) => d.findingsSummary || `We found ${d.findingsCount || 0} potential issue${(d.findingsCount || 0) !== 1 ? 's' : ''} with your listings or schedule. Please review.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/quality`,
  },

  // ── Vendor Trial Lifecycle ───────────────────────────────────────

  vendor_approved_trial: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: () => `Welcome! Your Free Trial Has Started`,
    message: (d) => `Congratulations! Your vendor application has been approved with a free 90-day ${d.trialTier || 'Basic'} plan trial. You have full access to all ${d.trialTier || 'Basic'} tier features. Upgrade anytime to keep these features after your trial.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
  },

  trial_reminder_14d: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: () => `Trial Ending in 14 Days`,
    message: (d) => `Your free ${d.trialTier || 'Basic'} trial ends in 14 days. After that, your account will switch to the Free plan with reduced limits. Upgrade now to keep all your features.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard/upgrade`,
  },

  trial_reminder_7d: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: () => `Trial Ending in 7 Days`,
    message: (d) => `Your free ${d.trialTier || 'Basic'} trial ends in 7 days. If you have more items or Chef Boxes than the Free plan allows, they will be paused after a 2-week grace period. Upgrade to keep them.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard/upgrade`,
  },

  trial_reminder_3d: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: () => `Trial Ending in 3 Days`,
    message: (d) => `Your free ${d.trialTier || 'Basic'} trial ends in 3 days! Upgrade now to keep access to all your menu items, locations, and Chef Boxes.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard/upgrade`,
  },

  trial_expired: {
    urgency: 'standard',
    severity: 'critical',
    audience: 'vendor',
    title: () => `Free Trial Ended`,
    message: (d) => `Your free ${d.trialTier || 'Basic'} trial has ended. You have a 14-day grace period to upgrade or manage your listings. After ${d.trialEndsAt || '14 days'}, items beyond Free tier limits will be automatically paused.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard/upgrade`,
  },

  trial_grace_expired: {
    urgency: 'immediate',
    severity: 'critical',
    audience: 'vendor',
    title: () => `Grace Period Ended`,
    message: (d) => {
      const parts: string[] = []
      if (d.unpublishedCount) parts.push(`${d.unpublishedCount} listing${d.unpublishedCount > 1 ? 's' : ''} set to draft`)
      if (d.deactivatedBoxCount) parts.push(`${d.deactivatedBoxCount} Chef Box${d.deactivatedBoxCount > 1 ? 'es' : ''} deactivated`)
      const summary = parts.length > 0 ? parts.join(' and ') + '.' : 'Some items may have been paused.'
      return `Your grace period has ended. ${summary} Upgrade to reactivate them, or manage your listings to stay within Free tier limits.`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard/upgrade`,
  },

  // ── Admin-facing ─────────────────────────────────────────────────

  new_vendor_application: {
    urgency: 'standard',
    severity: 'info',
    audience: 'admin',
    title: () => `New Vendor Application`,
    message: (d) => `${d.vendorName || 'A new vendor'} has submitted an application for review.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/admin/vendors`,
  },

  issue_disputed: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'admin',
    title: () => `Vendor Disputed Buyer Issue`,
    message: (d) => `${d.vendorName} resolved a buyer-reported issue on order #${d.orderNumber} in their own favor (confirmed delivery). Review may be needed.`,
    actionUrl: () => `/admin/feedback`,
  },

  // ── Catering / Events ─────────────────────────────────────────────

  catering_request_received: {
    urgency: 'standard',
    severity: 'info',
    audience: 'admin',
    title: (d) => d.vertical === 'farmers_market' ? 'New Pop-Up Market Request' : 'New Event Request',
    message: (d) => {
      const requestType = d.vertical === 'farmers_market' ? 'pop-up market request' : 'event request'
      return `${d.companyName} submitted a ${requestType} for ${d.headcount} people on ${d.eventDate}.`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/admin/events`,
  },

  catering_vendor_invited: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => d.vertical === 'farmers_market' ? 'New Pop-Up Market Opportunity' : 'New Event Opportunity',
    message: (d) => {
      const vendorWord = d.vertical === 'farmers_market' ? 'vendors' : 'food trucks'
      return `${d.companyName} is looking for ${vendorWord} for ${d.headcount} people on ${d.eventDate} at ${d.eventAddress}. Tap to view details and respond.`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketName}`,
  },

  catering_vendor_responded: {
    urgency: 'standard',
    severity: 'info',
    audience: 'admin',
    title: () => `Vendor Responded to Event Invite`,
    message: (d) => `${d.vendorName} ${d.responseAction || 'responded to'} the event invitation for ${d.marketName}.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/admin/events`,
  },

  event_feedback_request: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: () => 'How Was the Event?',
    message: (d) => `The "${d.marketName}" event has ended. If you ordered, we'd love to hear about your experience! Leave a review for the vendors you bought from.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/buyer/orders`,
  },

  vendor_event_approved: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: () => 'Approved for Private Events!',
    message: () => `Your food truck has been approved for Private Events! You can now mark menu items as event-ready from your listings page.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/listings`,
  },

  vendor_event_application_submitted: {
    urgency: 'standard',
    severity: 'info',
    audience: 'admin',
    title: () => 'Event Application Received',
    message: (d) => `${d.vendorName || 'A vendor'} has applied for private event approval. Review their event readiness profile.`,
    actionUrl: (d) => `/admin/vendors/${d.vendorId || ''}`,
  },
}

/**
 * Get the notification config for a given type.
 * Returns undefined for unknown types (forward-compatible).
 */
export function getNotificationConfig(type: string): NotificationTypeConfig | undefined {
  return NOTIFICATION_REGISTRY[type as NotificationType]
}

// ── Per-Vertical Urgency (NI-R19) ───────────────────────────────────
//
// FT = food is perishable, buyers are waiting NOW → higher urgency
// FM = orders placed days ahead, more lead time → lower urgency
//
// Registry defaults are set to FT values (the more urgent vertical).
// FM overrides are listed here where FM needs a different urgency.
// If no vertical is provided, the registry default (FT-level) applies.

const VERTICAL_URGENCY_OVERRIDES: Partial<Record<NotificationType, Partial<Record<string, NotificationUrgency>>>> = {
  // NI-R19: order_ready — FT=immediate (food is waiting), FM=standard (days away)
  order_ready: { farmers_market: 'standard' },
  // NI-R20: order_cancelled_by_vendor — FT=immediate, FM=urgent (still needs SMS)
  order_cancelled_by_vendor: { farmers_market: 'urgent' },
  // NI-R21: order_cancelled_by_buyer — FT=immediate, FM=urgent
  order_cancelled_by_buyer: { farmers_market: 'urgent' },
  // NI-R22: new_paid_order — FT=immediate (prep now), FM=standard (prep later)
  new_paid_order: { farmers_market: 'standard' },
  // NI-R23: new_external_order — FT=immediate, FM=standard
  new_external_order: { farmers_market: 'standard' },
  // NI-R24: stale_confirmed_vendor — FT=immediate, FM=standard
  stale_confirmed_vendor: { farmers_market: 'standard' },
  // NI-R25: external_payment_reminder — FT=immediate, FM=standard
  external_payment_reminder: { farmers_market: 'standard' },
  // NI-R26: pickup_missed — FT=immediate (food spoils), FM=urgent (still needs SMS)
  pickup_missed: { farmers_market: 'urgent' },
  // NI-R27: market_box_pickup_missed — FT=immediate, FM=standard
  market_box_pickup_missed: { farmers_market: 'standard' },
}

/**
 * Get the effective urgency for a notification type, accounting for per-vertical overrides.
 *
 * NI-R19: "Notification urgency is per-vertical. FT has higher urgency for most order
 * events (food is time-sensitive). FM uses lower urgency (orders placed days in advance)."
 *
 * @param type - The notification type
 * @param vertical - Optional vertical slug (food_trucks, farmers_market)
 * @returns The effective urgency level
 */
export function getNotificationUrgency(
  type: NotificationType,
  vertical?: string,
): NotificationUrgency {
  const config = NOTIFICATION_REGISTRY[type]
  if (!config) return 'standard' // safe fallback

  // Check for per-vertical override
  if (vertical) {
    const override = VERTICAL_URGENCY_OVERRIDES[type]?.[vertical]
    if (override) return override
  }

  // Default: registry value (set to FT-level urgency)
  return config.urgency
}
