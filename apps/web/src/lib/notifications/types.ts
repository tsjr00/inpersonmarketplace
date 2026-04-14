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

import { t } from '@/lib/locale/messages'

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
  | 'order_placed'
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
  | 'external_payment_not_received'
  | 'order_expired_vendor'
  | 'order_cancelled_nonpayment'
  | 'order_cancelled_by_buyer'
  | 'vendor_approved'
  | 'vendor_rejected'
  | 'business_verification_approved'
  | 'business_verification_rejected'
  | 'category_doc_approved'
  | 'category_doc_rejected'
  | 'coi_approved'
  | 'coi_rejected'
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
  | 'subscription_expired'
  // Admin-facing
  | 'new_vendor_application'
  | 'issue_disputed'
  | 'charge_dispute_created'
  // Catering / Events
  | 'catering_request_received'
  | 'catering_vendor_invited'
  | 'catering_vendor_responded'
  | 'event_confirmed'
  | 'event_feedback_request'
  | 'event_prep_reminder'
  | 'event_settlement_summary'
  | 'vendor_event_approved'
  | 'vendor_event_application_submitted'
  | 'vendor_event_application_received'
  | 'event_vendor_gap_alert'
  | 'listing_suspended'

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
  // Chargeback / Dispute
  disputeReason?: string
  disputeAmountCents?: number
  // Subscription lifecycle
  previousTier?: string
  newTier?: string
  // Catering / Events
  companyName?: string
  headcount?: number
  headcountPerVendor?: number
  eventDate?: string
  eventAddress?: string
  responseAction?: string  // 'accepted' | 'declined'
  vertical?: string
  marketId?: string
  setupTime?: string
  orderCount?: number
  payoutAmount?: string
  eventToken?: string
  eventPageUrl?: string
  vendorCount?: number
  eventId?: string
  // Order confirmation email enrichment
  brandName?: string
  marketAddress?: string
  pickupTime?: string
}

export type NotificationSeverity = 'critical' | 'warning' | 'info'

export interface NotificationTypeConfig {
  urgency: NotificationUrgency
  severity: NotificationSeverity
  audience: 'buyer' | 'vendor' | 'admin'
  title: (data: NotificationTemplateData, locale?: string) => string
  message: (data: NotificationTemplateData, locale?: string) => string
  /** Returns the path to navigate to when notification is clicked */
  actionUrl: (data: NotificationTemplateData & { vertical?: string }) => string
}

// ── Type Registry ────────────────────────────────────────────────────

export const NOTIFICATION_REGISTRY: Record<NotificationType, NotificationTypeConfig> = {
  // ── Buyer-facing ─────────────────────────────────────────────────

  order_placed: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: (d, locale) => {
      const base = t('notif.order_placed_title', locale)
      if (d.paymentMethod && d.paymentMethod !== 'Card') {
        return `${base} — pay via ${d.paymentMethod}`
      }
      return base
    },
    message: (d, locale) => {
      const signOffs: Record<string, string> = {
        food_trucks: "Thanks again, and keep on truck'n!",
        farmers_market: 'Thanks again for shopping local!',
      }
      return t('notif.order_placed_msg', locale, {
        orderNumber: d.orderNumber || '',
        vendorName: d.vendorName || 'your vendor',
        brandName: d.brandName || "Food Truck'n",
        marketName: d.marketName || 'your pickup location',
        marketAddress: d.marketAddress || '',
        pickupTime: d.pickupTime || 'your scheduled time',
        pickupDate: d.pickupDate || 'your scheduled date',
        signOff: signOffs[d.vertical as string] || 'Thanks again!',
      })
    },
    actionUrl: (d) => d.orderId
      ? `/${d.vertical || 'farmers_market'}/buyer/orders/${d.orderId}`
      : `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_confirmed: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: (_d, locale) => t('notif.order_confirmed_title', locale),
    message: (d, locale) => t('notif.order_confirmed_msg', locale, {
      vendorName: d.vendorName || '',
      orderNumber: d.orderNumber || '',
      forItem: d.itemTitle ? ` for ${d.itemTitle}` : '',
    }),
    actionUrl: (d) => d.orderId
      ? `/${d.vertical || 'farmers_market'}/buyer/orders/${d.orderId}`
      : `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_ready: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'buyer',
    title: (_d, locale) => t('notif.order_ready_title', locale),
    message: (d, locale) => t('notif.order_ready_msg', locale, {
      orderNumber: d.orderNumber || '',
      vendorName: d.vendorName || '',
      atMarket: d.marketName ? ` at ${d.marketName}` : '',
    }),
    actionUrl: (d) => d.orderId
      ? `/${d.vertical || 'farmers_market'}/buyer/orders/${d.orderId}`
      : `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_fulfilled: {
    urgency: 'info',
    severity: 'info',
    audience: 'buyer',
    title: (_d, locale) => t('notif.order_fulfilled_title', locale),
    message: (d, locale) => t('notif.order_fulfilled_msg', locale, {
      orderNumber: d.orderNumber || '',
      vendorName: d.vendorName || '',
    }),
    actionUrl: (d) => d.orderId
      ? `/${d.vertical || 'farmers_market'}/buyer/orders/${d.orderId}`
      : `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_cancelled_by_vendor: {
    urgency: 'immediate',
    severity: 'critical',
    audience: 'buyer',
    title: (_d, locale) => t('notif.order_cancelled_title', locale),
    message: (d, locale) => t('notif.order_cancelled_msg', locale, {
      vendorName: d.vendorName || '',
      orderNumber: d.orderNumber || '',
      reason: d.reason ? ` Reason: ${d.reason}` : '',
    }),
    actionUrl: (d) => d.orderId
      ? `/${d.vertical || 'farmers_market'}/buyer/orders/${d.orderId}`
      : `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_refunded: {
    urgency: 'urgent',
    severity: 'info',
    audience: 'buyer',
    title: (_d, locale) => t('notif.order_refunded_title', locale),
    message: (d, locale) => t('notif.order_refunded_msg', locale, {
      amount: d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : '',
      orderNumber: d.orderNumber || '',
    }),
    actionUrl: (d) => d.orderId
      ? `/${d.vertical || 'farmers_market'}/buyer/orders/${d.orderId}`
      : `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_expired: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: (_d, locale) => t('notif.order_expired_title', locale),
    message: (d, locale) => t('notif.order_expired_msg', locale, {
      orderNumber: d.orderNumber || '',
      refundInfo: d.amountCents ? ` A refund of $${(d.amountCents / 100).toFixed(2)} will be processed.` : '',
    }),
    actionUrl: (d) => d.orderId
      ? `/${d.vertical || 'farmers_market'}/buyer/orders/${d.orderId}`
      : `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  pickup_missed: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'buyer',
    title: (_d, locale) => t('notif.pickup_missed_title', locale),
    message: (d, locale) => t('notif.pickup_missed_msg', locale, {
      orderNumber: d.orderNumber || '',
      itemInfo: d.itemTitle ? ` (${d.itemTitle})` : '',
      vendorName: d.vendorName || '',
    }),
    actionUrl: (d) => d.orderId
      ? `/${d.vertical || 'farmers_market'}/buyer/orders/${d.orderId}`
      : `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  stale_confirmed_buyer: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'buyer',
    title: (_d, locale) => t('notif.stale_confirmed_title', locale),
    message: (d, locale) => t('notif.stale_confirmed_msg', locale, {
      orderNumber: d.orderNumber || '',
      forItem: d.itemTitle ? ` for ${d.itemTitle}` : '',
      vendorName: d.vendorName || '',
    }),
    actionUrl: (d) => d.orderId
      ? `/${d.vertical || 'farmers_market'}/buyer/orders/${d.orderId}`
      : `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  market_box_skip: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: (_d, locale) => t('notif.market_box_skip_title', locale),
    message: (d, locale) => t('notif.market_box_skip_msg', locale, {
      vendorName: d.vendorName || '',
      offeringName: d.offeringName || 'Market Box',
      pickupDate: d.pickupDate || '',
      reason: d.reason ? ` Reason: ${d.reason}` : '',
    }),
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/subscriptions`,
  },

  market_box_pickup_missed: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'buyer',
    title: (_d, locale) => t('notif.market_box_missed_title', locale),
    message: (d, locale) => t('notif.market_box_missed_msg', locale, {
      offeringName: d.offeringName || 'Market Box',
      vendorName: d.vendorName || '',
      pickupDate: d.pickupDate || '',
    }),
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/subscriptions`,
  },

  issue_resolved: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: (_d, locale) => t('notif.issue_resolved_title', locale),
    message: (d, locale) => t('notif.issue_resolved_msg', locale, {
      orderNumber: d.orderNumber || '',
      resolution: d.resolution ? ` Resolution: ${d.resolution}` : '',
    }),
    actionUrl: (d) => d.orderId
      ? `/${d.vertical || 'farmers_market'}/buyer/orders/${d.orderId}`
      : `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  // ── Vendor-facing ────────────────────────────────────────────────

  new_paid_order: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.new_paid_order_title', locale),
    message: (d) => `${d.buyerName || 'A customer'} placed order #${d.orderNumber}${d.itemTitle ? ` for ${d.itemTitle}` : ''}.${d.marketName ? ` Pickup at ${d.marketName}` : ''}${d.pickupDate ? ` on ${d.pickupDate}` : ''}.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/orders`,
  },

  new_external_order: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.new_external_order_title', locale),
    message: (d) => `New order #${d.orderNumber} via ${d.paymentMethod || 'external payment'}! ${d.paymentMethod === 'cash' ? 'Customer will pay cash at pickup.' : `Check your ${d.paymentMethod} account and confirm when you've received`}${d.amountCents ? ` $${(d.amountCents / 100).toFixed(2)}` : ''}.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  external_payment_reminder: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.external_payment_reminder_title', locale),
    message: (d) => `You have ${d.pendingOrderCount || ''} unconfirmed external payment order${(d.pendingOrderCount || 0) > 1 ? 's' : ''}. Please verify payment and confirm in your dashboard.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  external_payment_auto_confirmed: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.external_payment_auto_confirmed_title', locale),
    message: (d) => `Order #${d.orderNumber} was auto-confirmed because the pickup date has passed. If you did not receive payment, please dispute within 7 days by contacting support.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  external_payment_not_received: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'buyer',
    title: (_d, locale) => t('notif.payment_not_received_title', locale),
    message: (d) => `${d.vendorName || 'The vendor'} has not received your ${d.paymentMethod || 'external'} payment for order #${d.orderNumber}. Please send the payment or cancel the order if needed.`,
    actionUrl: (d) => d.orderId
      ? `/${d.vertical || 'farmers_market'}/buyer/orders/${d.orderId}`
      : `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_expired_vendor: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.order_expired_vendor_title', locale),
    message: (d) => `Order #${d.orderNumber}${d.itemTitle ? ` (${d.itemTitle})` : ''} from ${d.buyerName || 'a customer'} expired because it was not confirmed within the required window. The customer has been refunded. Please confirm orders promptly to avoid missed sales.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/orders`,
  },

  order_cancelled_nonpayment: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'buyer',
    title: (_d, locale) => t('notif.order_cancelled_nonpayment_title', locale),
    message: (d) => `Order #${d.orderNumber} was cancelled because ${d.paymentMethod || 'external'} payment was not received. You can place a new order with a different payment method.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  order_cancelled_by_buyer: {
    urgency: 'immediate',
    severity: 'critical',
    audience: 'vendor',
    title: (_d, locale) => t('notif.order_cancelled_by_buyer_title', locale),
    message: (d) => `${d.buyerName || 'A customer'} cancelled order #${d.orderNumber}${d.itemTitle ? ` for ${d.itemTitle}` : ''}.${d.reason ? ` Reason: ${d.reason}` : ''}`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/orders`,
  },

  vendor_approved: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.vendor_approved_title', locale),
    message: () => `Congratulations! Your vendor application has been approved. You can now start listing products.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  vendor_rejected: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.vendor_rejected_title', locale),
    message: (d) => `Your vendor application was not approved at this time.${d.reason ? ` Reason: ${d.reason}` : ''} You may reapply after addressing any issues.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor-signup`,
  },

  // Gate-specific approval/rejection notifications (3-gate onboarding)
  business_verification_approved: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.business_verification_approved_title', locale),
    message: () => 'Your business verification has been approved! Next step: upload your category-specific documents in your vendor dashboard.',
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  business_verification_rejected: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.business_verification_rejected_title', locale),
    message: (d) => `Your business verification needs attention.${d.reason ? ` ${d.reason}` : ''} Please review and resubmit through your vendor dashboard.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  category_doc_approved: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.category_doc_approved_title', locale),
    message: (d) => `Your ${d.category || 'category'} documentation has been approved! Once all your required documents are approved, you can start listing products.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  category_doc_rejected: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.category_doc_rejected_title', locale),
    message: (d) => `Your ${d.category || 'category'} documentation needs revision.${d.reason ? ` ${d.reason}` : ''} Please review and resubmit.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  coi_approved: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.coi_approved_title', locale),
    message: () => 'Your Certificate of Insurance has been approved! You\'re now eligible for event vendor opportunities.',
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  coi_rejected: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.coi_rejected_title', locale),
    message: (d) => `Your Certificate of Insurance was not approved.${d.reason ? ` ${d.reason}` : ''} Please review and resubmit when ready.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  market_approved: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.market_approved_title', locale),
    message: (d) => `Your market "${d.marketName}" has been approved and is now live.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/markets`,
  },

  pickup_confirmation_needed: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.pickup_confirmation_needed_title', locale),
    message: (d) => `${d.buyerName || 'A customer'} says they've picked up order #${d.orderNumber}. Please confirm within 30 seconds.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/pickup`,
  },

  pickup_issue_reported: {
    urgency: 'urgent',
    severity: 'critical',
    audience: 'vendor',
    title: (_d, locale) => t('notif.pickup_issue_reported_title', locale),
    message: (d) => `An issue was reported for order #${d.orderNumber}.${d.reason ? ` Details: ${d.reason}` : ''} Please check your orders.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/orders`,
  },

  inventory_low_stock: {
    urgency: 'info',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.inventory_low_stock_title', locale),
    message: (d) => `"${d.listingTitle}" is running low — ${d.quantity} remaining.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/listings`,
  },

  inventory_out_of_stock: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.inventory_out_of_stock_title', locale),
    message: (d) => `"${d.listingTitle}" is now out of stock. Update your listing to restock.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/listings`,
  },

  payout_processed: {
    urgency: 'info',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.payout_processed_title', locale),
    message: (d) => `A payout${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} has been sent to your account.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/orders`,
  },

  payout_failed: {
    urgency: 'urgent',
    severity: 'critical',
    audience: 'vendor',
    title: (_d, locale) => t('notif.payout_failed_title', locale),
    message: (d) => `A payout${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} for order #${d.orderNumber} could not be processed. We'll retry automatically. If this persists, please check your Stripe account settings.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/orders`,
  },

  stale_confirmed_vendor: {
    urgency: 'immediate',
    severity: 'critical',
    audience: 'vendor',
    title: (_d, locale) => t('notif.stale_confirmed_vendor_title', locale),
    message: (d) => `Order #${d.orderNumber}${d.itemTitle ? ` (${d.itemTitle})` : ''} was confirmed but never marked ready. The pickup date has passed. Please mark as fulfilled if the customer received their items, or report a problem.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  stale_confirmed_vendor_final: {
    urgency: 'standard',
    severity: 'critical',
    audience: 'vendor',
    title: (_d, locale) => t('notif.stale_confirmed_vendor_final_title', locale),
    message: (d) => `Order #${d.orderNumber}${d.itemTitle ? ` (${d.itemTitle})` : ''} still needs resolution. Your order management will be restricted until you mark this order as fulfilled or report an issue. Open the app to resolve this now.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/orders`,
  },

  vendor_cancellation_warning: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.vendor_cancellation_warning_title', locale),
    message: (d) => `Your order cancellation rate is ${d.cancellationRate ? `${d.cancellationRate}%` : 'above average'} (${d.cancelledCount || 0} cancelled out of ${d.confirmedCount || 0} confirmed orders). Confirming an order is a commitment to fulfill it. Continued cancellations may result in account restrictions. If you are experiencing issues fulfilling orders, please reach out to support.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/analytics`,
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
    title: (_d, locale) => t('notif.vendor_approved_trial_title', locale),
    message: (d) => `Congratulations! Your vendor application has been approved with a free 90-day ${d.trialTier || 'Basic'} plan trial. You have full access to all ${d.trialTier || 'Basic'} tier features. Upgrade anytime to keep these features after your trial.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
  },

  trial_reminder_14d: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.trial_reminder_14d_title', locale),
    message: (d) => `Your free ${d.trialTier || 'Basic'} trial ends in 14 days. After that, your account will switch to the Free plan with reduced limits. Upgrade now to keep all your features.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard/upgrade`,
  },

  trial_reminder_7d: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.trial_reminder_7d_title', locale),
    message: (d) => {
      const boxTerm = d.vertical === 'farmers_market' ? 'Market Boxes' : 'Chef Boxes'
      return `Your free ${d.trialTier || 'Basic'} trial ends in 7 days. If you have more items or ${boxTerm} than the Free plan allows, they will be paused after a 2-week grace period. Upgrade to keep them.`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard/upgrade`,
  },

  trial_reminder_3d: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.trial_reminder_3d_title', locale),
    message: (d) => {
      const boxTerm = d.vertical === 'farmers_market' ? 'Market Boxes' : 'Chef Boxes'
      return `Your free ${d.trialTier || 'Basic'} trial ends in 3 days! Upgrade now to keep access to all your items, locations, and ${boxTerm}.`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard/upgrade`,
  },

  trial_expired: {
    urgency: 'standard',
    severity: 'critical',
    audience: 'vendor',
    title: (_d, locale) => t('notif.trial_expired_title', locale),
    message: (d) => `Your free ${d.trialTier || 'Basic'} trial has ended. You have a 14-day grace period to upgrade or manage your listings. After ${d.trialEndsAt || '14 days'}, items beyond Free tier limits will be automatically paused.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard/upgrade`,
  },

  trial_grace_expired: {
    urgency: 'immediate',
    severity: 'critical',
    audience: 'vendor',
    title: (_d, locale) => t('notif.trial_grace_expired_title', locale),
    message: (d) => {
      const parts: string[] = []
      if (d.unpublishedCount) parts.push(`${d.unpublishedCount} listing${d.unpublishedCount > 1 ? 's' : ''} set to draft`)
      if (d.deactivatedBoxCount) parts.push(`${d.deactivatedBoxCount} Chef Box${d.deactivatedBoxCount > 1 ? 'es' : ''} deactivated`)
      const summary = parts.length > 0 ? parts.join(' and ') + '.' : 'Some items may have been paused.'
      return `Your grace period has ended. ${summary} Upgrade to reactivate them, or manage your listings to stay within Free tier limits.`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard/upgrade`,
  },

  subscription_expired: {
    urgency: 'urgent',
    severity: 'critical',
    audience: 'vendor',
    title: (_d, locale) => t('notif.subscription_expired_title', locale),
    message: (d) => `Your ${d.previousTier || 'paid'} subscription has expired and your account has been downgraded to ${d.newTier || 'Free'}. Renew your subscription to regain access to premium features.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard/upgrade`,
  },

  // ── Admin-facing ─────────────────────────────────────────────────

  new_vendor_application: {
    urgency: 'standard',
    severity: 'info',
    audience: 'admin',
    title: (_d, locale) => t('notif.new_vendor_application_title', locale),
    message: (d) => `${d.vendorName || 'A new vendor'} has submitted an application for review.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/admin/vendors`,
  },

  issue_disputed: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'admin',
    title: (_d, locale) => t('notif.issue_disputed_title', locale),
    message: (d) => `${d.vendorName} resolved a buyer-reported issue on order #${d.orderNumber} in their own favor (confirmed delivery). Review may be needed.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/admin/feedback`,
  },

  charge_dispute_created: {
    urgency: 'urgent',
    severity: 'critical',
    audience: 'admin',
    title: (_d, locale) => t('notif.charge_dispute_title', locale),
    message: (d) => `A chargeback${d.disputeAmountCents ? ` of $${(d.disputeAmountCents / 100).toFixed(2)}` : ''} was filed${d.orderNumber ? ` for order #${d.orderNumber}` : ''}.${d.disputeReason ? ` Reason: ${d.disputeReason}` : ''} Review in Stripe Dashboard immediately.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/admin/orders`,
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
    title: () => 'New Event Opportunity',
    message: (d) => {
      const vendorWord = d.vertical === 'farmers_market' ? 'vendors' : 'food trucks'
      const timeRange = d.reason ? ` from ${d.reason}` : ''
      const acceptInstructions = d.vertical === 'farmers_market'
        ? "If you accept, you'll select the items from your event-ready items for the event manager to review. We recommend updating your item descriptions to make sure they are accurate for what you plan to sell."
        : "If you accept, you'll select from 4 to 7 items from your catering menu for the event manager to review. We recommend updating your menu item descriptions to make sure they are accurate for what you plan to serve."
      return `We have matched you with an upcoming private event opportunity. A ${d.eventAddress || ''} event organizer is looking for ${vendorWord} for ${d.headcount} people on ${d.eventDate}${timeRange}. ${acceptInstructions} Tap to view details and respond.`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketName}`,
  },

  catering_vendor_responded: {
    urgency: 'standard',
    severity: 'info',
    audience: 'admin',
    title: (_d, locale) => t('notif.catering_vendor_responded_title', locale),
    message: (d) => `${d.vendorName} ${d.responseAction || 'responded to'} the event invitation for ${d.marketName}.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/admin/events`,
  },

  // Sent to event organizer when admin advances event to 'ready' (vendors confirmed)
  event_confirmed: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'buyer', // organizer is external — uses email delivery, audience doesn't matter for routing
    title: () => 'Your event is confirmed!',
    message: (d) => `Great news — ${d.vendorCount || 'your'} vendor${(d.vendorCount || 0) > 1 ? 's are' : ' is'} confirmed for your event on ${d.eventDate}! Share this link with your team so they can browse menus and pre-order: ${d.eventPageUrl || '(link pending)'}`,
    actionUrl: (d) => d.eventPageUrl || '/',
  },

  event_prep_reminder: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.event_prep_reminder_title', locale),
    message: (d) => `Your event "${d.marketName}" is tomorrow! Headcount: ~${d.headcountPerVendor || d.headcount} servings. Review your pre-orders and prep accordingly. Arrive by ${d.setupTime || 'the scheduled start time'}.`,
    actionUrl: (d) => d.marketId
      ? `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketId}`
      : `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
  },

  event_settlement_summary: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.event_settlement_summary_title', locale),
    message: (d) => `Settlement for "${d.marketName}" is complete. ${d.orderCount || 0} order${(d.orderCount || 0) !== 1 ? 's' : ''} fulfilled${d.payoutAmount ? ` — $${d.payoutAmount} paid out` : ''}. Thank you for participating!`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/orders`,
  },

  event_feedback_request: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: (_d, locale) => t('notif.event_feedback_request_title', locale),
    message: (d) => `The "${d.marketName}" event has ended. If you ordered, we'd love to hear about your experience! Leave a review for the vendors you bought from.`,
    actionUrl: (d) => d.eventToken
      ? `/${d.vertical || 'food_trucks'}/events/${d.eventToken}`
      : `/${d.vertical || 'food_trucks'}/buyer/orders`,
  },

  vendor_event_approved: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (_d, locale) => t('notif.vendor_event_approved_title', locale),
    message: (d) => d.vertical === 'farmers_market'
      ? 'Your vendor profile has been approved for Private Events! You can now mark items as event-ready from your listings page.'
      : 'Your food truck has been approved for Private Events! You can now mark menu items as event-ready from your listings page.',
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/listings`,
  },

  vendor_event_application_submitted: {
    urgency: 'standard',
    severity: 'info',
    audience: 'admin',
    title: (_d, locale) => t('notif.vendor_event_application_title', locale),
    message: (d) => `${d.vendorName || 'A vendor'} has applied for private event approval. Review their event readiness profile.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/admin/vendors`,
  },

  vendor_event_application_received: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: () => 'Event Application Received',
    message: () => 'Your private event readiness application has been submitted. Our team will review it and get back to you.',
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/edit`,
  },

  event_vendor_gap_alert: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'admin',
    title: () => 'Event Needs More Vendors',
    message: (d) => `Event "${d.vendorName || 'Unknown'}" on ${d.pickupDate || '?'} — ${d.quantity || 0} of ${d.pendingOrderCount || '?'} requested vendors accepted after 24 hours. Consider manual outreach or inviting additional vendors.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/admin/events?id=${d.eventId || ''}`,
  },

  listing_suspended: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: () => 'Listing Suspended',
    message: (d) => `Your listing "${d.listingTitle || 'Unknown'}" has been paused by an admin.${d.reason ? ` Reason: ${d.reason}` : ''} Contact support if you have questions.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/listings`,
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
