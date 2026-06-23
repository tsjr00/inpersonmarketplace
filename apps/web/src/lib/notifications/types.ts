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
import { term } from '@/lib/vertical/terminology'

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
  | 'vendor_market_approval_granted'
  // Manager-initiated vendor invitation to a standard market (NEW-8,
  // Session 85). Distinct from catering_vendor_invited which is for
  // event/catering opportunities — this is the everyday "join my
  // weekly farmers market" invitation flow.
  | 'market_vendor_invited'
  // Manager-side notification when a vendor responds (accept/decline) to a
  // market_vendor_invited invitation. Distinct from catering_vendor_responded
  // which targets catering EVENT invites — that template's copy mentions
  // "catering event" which is wrong for a standard market invitation.
  | 'manager_vendor_invitation_responded'
  // Booth rental payment lifecycle (Phase C Stage 3 follow-ups, 2026-05-19)
  | 'booth_rental_paid_vendor'
  | 'booth_rental_paid_manager'
  | 'booth_rental_payment_failed_vendor'
  // Market manager schedule edits (2026-05-19) — notify all approved vendors
  // at the market when manager changes hours / active days / season window.
  | 'market_schedule_changed'
  // Market-day reminder to followers (Session 92 Phase B) — fires on the
  // morning of a market's operating day to buyers who follow the market.
  | 'market_day_today'
  // One-way manager broadcast to a market's vendors (Session 92 Phase B).
  | 'market_broadcast'
  // Cancel-a-market-day (Session 92 Phase C) — split by audience because the
  // action URL + copy differ: buyers (their refunded order) vs booth renters
  // (credit/reschedule of their booth fee).
  | 'market_date_cancelled_buyer'
  | 'market_date_cancelled_vendor'
  // Phase C — product-order vendor whose order was cancelled by the closure.
  | 'market_date_cancelled_order_vendor'
  // Manager access lifecycle (Phase 1B) — fired to the affected manager
  // when an admin removes / suspends / restores their market access.
  | 'manager_access_removed'
  | 'manager_access_suspended'
  | 'manager_access_restored'
  // Post-market surveys (Phase E Stage 2, mig 147)
  | 'survey_request_vendor'
  | 'survey_request_buyer'
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
  | 'event_cancelled_vendor'
  | 'event_confirmed'
  | 'event_feedback_request'
  | 'event_prep_reminder'
  | 'event_settlement_summary'
  | 'event_force_completed_with_unfulfilled'
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
  // Discriminator for payout_processed template branching (P1-3 enrichment).
  // Currently only 'market_box_subscription'; expand union if more sources emerge.
  sourceType?: 'market_box_subscription'
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
  // Vendor onboarding gate notifications
  category?: string
  // Order confirmation email enrichment
  brandName?: string
  marketAddress?: string
  pickupTime?: string
  // Booth rental payment notifications (Phase C Stage 3 follow-ups)
  /** Display-formatted week-of date for booth rental notifications,
   *  e.g. "Jun 7, 2026". Pre-formatted by the caller because the
   *  weekly_booth_rentals.week_start_date column is a plain DATE (no
   *  timezone), and the manager + vendor both expect a localized label. */
  weekStartDate?: string
  /** Manager's portion of the booth rental in cents. Distinct from
   *  amountCents (vendor's pay) — manager-paid notifications use this. */
  managerReceivesAmountCents?: number
  /** Auto-assigned booth label (mig 144). Surfaced in vendor + manager
   *  paid-confirmation notifications. Falls back to "manager will reach
   *  out" copy when absent (legacy data or pre-mig-144 bookings). */
  boothNumber?: string
  // Post-market surveys (Phase E Stage 2)
  /** Survey row UUID for vendor surveys; used to build the action URL
   *  /[vertical]/vendor/survey/[surveyId]. */
  surveyId?: string
  /** Opaque 32-char access token for buyer surveys; embedded in the
   *  URL /[vertical]/survey/[accessToken]. */
  accessToken?: string
  /** Display-formatted market date the survey is FOR, e.g. "Sat, May 17, 2026". */
  surveyDate?: string
  /** Count of prior unfilled surveys this user has at any market — when
   *  > 0, the email body and in-app message mention them with a link to
   *  the surveys-list page. */
  priorPendingCount?: number
  // Market-day reminder + manager broadcast (Session 92 Phase B)
  /** Display-formatted operating hours for the market-day reminder,
   *  e.g. "8:00 AM – 1:00 PM". Optional — omitted when unparseable. */
  marketDayHours?: string
  /** Manager broadcast subject line (optional) — used as the notification
   *  title when present. */
  broadcastSubject?: string
  /** Manager broadcast body — the announcement text. */
  broadcastBody?: string
  // Cancel-a-market-day (Session 92 Phase C)
  /** Display-formatted cancelled market date, e.g. "Saturday, June 27". */
  marketDate?: string
  /** Manager's booth-renter disposition for a cancelled date: 'credit' | 'reschedule'. */
  boothDisposition?: string
  /** Make-up date (YYYY-MM-DD) when boothDisposition='reschedule' (advisory in v1). */
  rescheduleDate?: string
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
    message: () => `Congratulations! Your vendor application has been approved. You can now set up your locations, create listings, and connect them to your markets.`,
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
    message: () => 'Your business verification has been approved! You can now set up your locations and create listings. Next step: upload any required category documents in your vendor dashboard.',
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

  // B-close-2 (2026-05-16): manager approved this vendor for their market.
  // Fires from /api/market-manager/[marketId]/vendor-approval when the
  // manager flips approved=true. Distinct from `vendor_approved` (which
  // is platform-level onboarding approval); this is per-market.
  vendor_market_approval_granted: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) =>
      d.marketName
        ? `You're approved at ${d.marketName}`
        : `You're approved at a new market`,
    message: (d) =>
      `The manager of ${d.marketName || 'the market'} approved your vendor association. You're now active and visible to buyers at this market.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/markets`,
  },

  // Manager-initiated invitation to a standard (non-catering) market (NEW-8).
  // Fires from POST /api/market-manager/[marketId]/vendor-invitations when
  // a manager bulk-invites nearby platform vendors from their dashboard.
  // Vendor responds via PATCH /api/vendor/markets/[id]/respond — on accept,
  // market_vendors.approved auto-flips to true (manager already chose them).
  // Includes a link to the market's public profile so the vendor can review
  // before responding.
  market_vendor_invited: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) =>
      d.marketName
        ? `${d.marketName} invited you to join`
        : 'A market invited you to join',
    message: (d) =>
      `The manager of ${d.marketName || 'a market'} invited you to join their market. ` +
      `Review the market profile and accept or decline from your vendor dashboard.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/markets`,
  },

  // Manager-side response to market_vendor_invited. Fires from PATCH
  // /api/vendor/markets/[id]/respond when the vendor accepts or declines.
  // Audience is the market manager — `manager_user_id` on markets is the
  // user_id we send to. Lands on the manager's dashboard so they can see
  // the updated vendor list.
  manager_vendor_invitation_responded: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor', // managers operate from a vendor-adjacent role
    title: (d) => {
      const verb = d.responseAction === 'accepted' ? 'accepted' : 'declined'
      return d.vendorName
        ? `${d.vendorName} ${verb} your invitation`
        : `A vendor ${verb} your invitation`
    },
    message: (d) => {
      const verb = d.responseAction === 'accepted' ? 'accepted' : 'declined'
      const marketPart = d.marketName ? ` to ${d.marketName}` : ''
      const followup = d.responseAction === 'accepted'
        ? ' They are now affiliated with your market.'
        : ''
      return `${d.vendorName || 'A vendor'} ${verb} your invitation${marketPart}.${followup}`
    },
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'farmers_market'}/market-manager/${d.marketId}/dashboard`
        : `/${d.vertical || 'farmers_market'}/dashboard`,
  },

  // Phase C Stage 3 follow-ups (2026-05-19): booth rental payment lifecycle.
  // Fires from handleBoothRentalCheckoutComplete in stripe/webhooks.ts after
  // the status flip pending_payment → paid. Vendor-side confirmation.
  booth_rental_paid_vendor: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `Booking confirmed at ${d.marketName || 'the market'}`,
    message: (d) => {
      const amount = d.amountCents ? ` ($${(d.amountCents / 100).toFixed(2)})` : ''
      // Mig 144: when boothNumber is provided (auto-assigned at booking
      // time), tell the vendor their booth label directly. Pre-mig-144
      // bookings have no booth_number yet — fall back to the legacy
      // "manager will reach out" copy.
      const boothLine = d.boothNumber
        ? ` Your booth is ${d.boothNumber}. See you there.`
        : ' The manager will reach out with a booth number assignment before market day.'
      return `Your booth booking at ${d.marketName || 'the market'} for the week of ${d.weekStartDate || 'the selected date'} is confirmed${amount}.${boothLine}`
    },
    // Lands on the vendor's My Bookings page so they can see the new
    // row immediately (introduced 2026-05-19 alongside the page itself).
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/bookings`,
  },

  // Manager-side confirmation when a vendor's booth rental payment lands.
  // Includes the manager's portion ($amount they receive) so they can
  // reconcile against their Stripe Connect deposits.
  booth_rental_paid_manager: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor', // managers operate from a vendor-adjacent role; closest fit
    title: (d) =>
      d.vendorName
        ? `${d.vendorName} booked a booth at ${d.marketName || 'your market'}`
        : `A vendor booked a booth at ${d.marketName || 'your market'}`,
    message: (d) => {
      const amount = d.managerReceivesAmountCents
        ? ` Your portion ($${(d.managerReceivesAmountCents / 100).toFixed(2)}) will arrive in your Stripe account.`
        : ' Your portion will arrive in your Stripe account.'
      // Mig 144: include auto-assigned booth label when available so the
      // manager can sync their physical-layout records without checking
      // the dashboard.
      const boothPart = d.boothNumber ? ` (booth ${d.boothNumber})` : ''
      return `${d.vendorName || 'A vendor'} paid for a booth${boothPart} at ${d.marketName || 'your market'} for the week of ${d.weekStartDate || 'the booked date'}.${amount}`
    },
    // Anchor link drops the manager right at the Weekly bookings card
    // (id="weekly-bookings" on the dashboard wrapper).
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'farmers_market'}/market-manager/${d.marketId}/dashboard#weekly-bookings`
        : `/${d.vertical || 'farmers_market'}/dashboard`,
  },

  // Fires when a market manager saves changes to the market schedule
  // (day-of-week active toggles, time edits, season start/end). Goes to
  // every approved vendor at the market (market_vendors.approved=true).
  // Manager confirmed an acknowledgment dialog BEFORE the change saved,
  // taking responsibility for direct vendor outreach + refunds — see
  // PUT /api/market-manager/[marketId]/schedules.
  market_schedule_changed: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (d) => `Schedule change at ${d.marketName || 'the market'}`,
    message: (d) =>
      `The schedule at ${d.marketName || 'the market'} has been updated by the market manager. Review the new times in your vendor markets list and contact the market manager directly with any questions or refund requests — the platform doesn't issue refunds for schedule changes.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/markets`,
  },

  // Phase C — a market day was cancelled by the manager. Buyer variant: their
  // order for that date was auto-refunded.
  market_date_cancelled_buyer: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'buyer',
    title: (d) => `${d.marketName || 'A market'} cancelled ${d.marketDate || 'an upcoming date'}`,
    message: (d) =>
      `${d.marketName || 'The market'} is closed on ${d.marketDate || 'your pickup date'}, so your order for that date has been cancelled and refunded. The refund returns to your original payment method.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  // Phase C — booth-renter variant: their booth fee for the cancelled date is
  // credited or rescheduled per the manager's choice.
  market_date_cancelled_vendor: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (d) => `${d.marketName || 'A market'} cancelled ${d.marketDate || 'an upcoming date'}`,
    message: (d) =>
      d.boothDisposition === 'reschedule'
        ? `${d.marketName || 'The market'} is closed on ${d.marketDate || 'an upcoming market day'}. The manager plans a make-up market day${d.rescheduleDate ? ` on ${d.rescheduleDate}` : ''} — they'll be in touch with details.`
        : `${d.marketName || 'The market'} is closed on ${d.marketDate || 'an upcoming market day'}. Your booth fee for that day will be credited — the manager will reach out with details.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/bookings`,
  },

  // Phase C — product-order vendor variant: an order they were going to fulfill
  // was cancelled because the market day was cancelled (mirrors how buyer-cancel
  // notifies the vendor). The buyer's refund is handled separately; this is a
  // heads-up so the vendor isn't left expecting a pickup that won't happen.
  market_date_cancelled_order_vendor: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (d) => `Order ${d.orderNumber ? `#${d.orderNumber} ` : ''}cancelled — ${d.marketName || 'a market'} closed`,
    message: (d) =>
      `${d.marketName || 'A market'} is closed on ${d.marketDate || 'an upcoming market day'}, so ${d.orderNumber ? `order #${d.orderNumber}` : 'an order'} you were going to fulfill that day was cancelled and the buyer refunded. No action needed — inventory has been restored.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/orders`,
  },

  // Phase 1B — manager access lifecycle. Fired to the affected manager
  // (their user_id) when an admin changes their access. Buyer audience
  // because managers log in via the buyer dashboard.
  manager_access_removed: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'buyer',
    title: (d) => `Your manager access for ${d.marketName || 'a market'} was removed`,
    message: (d) => {
      const reason = d.reason ? ` Reason: ${d.reason}.` : ''
      return `An administrator removed your market manager access for ${d.marketName || 'the market'}.${reason} If you think this is a mistake, reach out via the support page.`
    },
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/dashboard`,
  },
  manager_access_suspended: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'buyer',
    title: (d) => `Your manager access for ${d.marketName || 'a market'} was suspended`,
    message: (d) => {
      const reason = d.reason ? ` Reason: ${d.reason}.` : ''
      return `Your market manager access for ${d.marketName || 'the market'} has been temporarily suspended pending review.${reason} You remain assigned — access is paused, not removed.`
    },
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'farmers_market'}/market-manager/${d.marketId}/dashboard`
        : `/${d.vertical || 'farmers_market'}/dashboard`,
  },
  manager_access_restored: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: (d) => `Your manager access for ${d.marketName || 'a market'} was restored`,
    message: (d) =>
      `Your market manager access for ${d.marketName || 'the market'} has been restored. You can manage your market again from your dashboard.`,
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'farmers_market'}/market-manager/${d.marketId}/dashboard`
        : `/${d.vertical || 'farmers_market'}/dashboard`,
  },

  // Session 92 Phase B — market-day reminder to followers. Fires on the
  // morning of an operating day to buyers who follow the market
  // (market_favorites). Standard urgency = in_app + email. Dedup'd per
  // (market, date) via market_day_notification_log so it sends once.
  market_day_today: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: (d) => `${d.marketName || 'A market you follow'} is open today`,
    message: (d) => {
      const hours = d.marketDayHours ? ` (${d.marketDayHours})` : ''
      return `${d.marketName || 'A market you follow'} is open today${hours}. Browse what your favorite vendors are bringing and pre-order for pickup.`
    },
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'farmers_market'}/markets/${d.marketId}`
        : `/${d.vertical || 'farmers_market'}/markets`,
  },

  // Session 92 Phase B — one-way manager broadcast to a market's vendors.
  // Sent to approved vendors + vendors with paid upcoming booth rentals.
  // Subject (when present) becomes the title; body is the announcement.
  market_broadcast: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) =>
      d.broadcastSubject
        ? `${d.marketName || 'Your market'}: ${d.broadcastSubject}`
        : `Announcement from ${d.marketName || 'your market'}`,
    message: (d) => d.broadcastBody || 'Your market manager sent an announcement.',
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/markets`,
  },

  // Phase E Stage 2 (mig 147 follow-up). Cron generates one row per
  // attended vendor after each market day; this notification has the
  // survey UUID and a clear action URL. Standard urgency = in_app +
  // email. Email body is the registry default; the cron also sends a
  // custom-HTML email separately (with market logo if uploaded) — that
  // ships as a Resend call from src/lib/surveys/email.ts. The in_app
  // notification text below covers the dashboard banner case.
  survey_request_vendor: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) =>
      `Quick survey — how did ${d.marketName || 'the market'} go${d.surveyDate ? ` on ${d.surveyDate}` : ''}?`,
    message: (d) => {
      const prior = (d.priorPendingCount ?? 0) > 0
        ? ` You also have ${d.priorPendingCount} survey${d.priorPendingCount === 1 ? '' : 's'} pending from prior market days — your dashboard has the full list.`
        : ''
      return `Take 30 seconds to rate the market — your feedback helps the manager + funders. Ratings stay anonymous to other vendors.${prior}`
    },
    actionUrl: (d) =>
      d.surveyId
        ? `/${d.vertical || 'farmers_market'}/vendor/survey/${d.surveyId}`
        : `/${d.vertical || 'farmers_market'}/vendor/surveys`,
  },

  survey_request_buyer: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: (d) =>
      `How was your visit to ${d.marketName || 'the market'}${d.surveyDate ? ` on ${d.surveyDate}` : ''}?`,
    message: (d) => {
      const prior = (d.priorPendingCount ?? 0) > 0
        ? ` (You also have ${d.priorPendingCount} survey${d.priorPendingCount === 1 ? '' : 's'} pending from prior visits.)`
        : ''
      return `Share a few quick ratings — it helps the market improve and helps us prove the market's impact to funders.${prior}`
    },
    actionUrl: (d) =>
      d.accessToken
        ? `/${d.vertical || 'farmers_market'}/survey/${d.accessToken}`
        : `/${d.vertical || 'farmers_market'}/`,
  },

  // Fires from cron Phase 16 (expire-orders/route.ts) when an abandoned
  // booth rental gets swept — vendor never completed payment within the
  // 30-min orphan window or the 24-h stale-session window. The UNIQUE
  // constraint now frees so they can re-book.
  booth_rental_payment_failed_vendor: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (d) => `We released your booking at ${d.marketName || 'the market'}`,
    message: (d) =>
      `We released your booth booking at ${d.marketName || 'the market'} for the week of ${d.weekStartDate || 'the selected date'} — payment wasn't completed within the allowed window. Re-book if you still want the slot.`,
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'farmers_market'}/markets/${d.marketId}/book`
        : `/${d.vertical || 'farmers_market'}/vendor/markets`,
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
    message: (d) => {
      const amount = d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''
      // Market-box subscriptions get richer context so the vendor knows WHO
      // subscribed and to WHICH offering, not just "you got paid $X".
      if (d.sourceType === 'market_box_subscription' && d.offeringName) {
        const who = d.buyerName ? ` from ${d.buyerName}` : ''
        return `New subscription to "${d.offeringName}"${who} — payout${amount} sent.`
      }
      return `A payout${amount} has been sent to your account.`
    },
    actionUrl: (d) => {
      if (d.sourceType === 'market_box_subscription') {
        return `/${d.vertical || 'farmers_market'}/vendor/market-boxes`
      }
      return `/${d.vertical || 'farmers_market'}/vendor/orders`
    },
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
    title: (d) => `New ${term(d.vertical || 'farmers_market', 'event_request_name_suffix')} Request`,
    message: (d) => {
      const requestType = `${term(d.vertical || 'farmers_market', 'event_request_name_suffix').toLowerCase()} request`
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
      const vendorWord = term(d.vertical || 'farmers_market', 'vendors').toLowerCase()
      const timeRange = d.reason ? ` from ${d.reason}` : ''
      const acceptInstructions = d.vertical === 'farmers_market'
        ? "If you accept, you'll choose which of your event-ready items to feature for the organizer to review. We recommend updating those items now so descriptions match what you plan to sell."
        : "If you accept, you'll select from 4 to 7 items from your catering menu for the organizer to review. We recommend updating your menu item descriptions to make sure they are accurate for what you plan to serve."
      const location = d.eventAddress ? `in ${d.eventAddress}` : 'in your area'
      return `We've matched you with an upcoming private event opportunity. An event organizer ${location} is looking for ${vendorWord} for ${d.headcount} people on ${d.eventDate}${timeRange}. ${acceptInstructions} Tap to view details and respond.`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketId}`,
  },

  catering_vendor_responded: {
    urgency: 'standard',
    severity: 'info',
    audience: 'admin',
    title: (_d, locale) => t('notif.catering_vendor_responded_title', locale),
    message: (d) => `${d.vendorName} ${d.responseAction || 'responded to'} the event invitation for ${d.marketName}.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/admin/events`,
  },

  event_cancelled_vendor: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'vendor',
    title: (_d, locale) => t('notif.event_cancelled_vendor_title', locale),
    message: (d) => `The event on ${d.eventDate || 'the scheduled date'} organized by ${d.companyName || 'the organizer'} has been cancelled. We appreciated your willingness to participate and will keep matching you to future opportunities.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/dashboard`,
  },

  // Sent to event organizer when admin advances event to 'ready' (vendors confirmed)
  event_confirmed: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'buyer', // organizer is external — uses email delivery, audience doesn't matter for routing
    title: () => 'Your event is confirmed!',
    message: (d) => {
      const count = d.vendorCount || 0
      const word = count === 1
        ? term(d.vertical || 'farmers_market', 'vendor').toLowerCase()
        : term(d.vertical || 'farmers_market', 'vendors').toLowerCase()
      const subject = count > 0
        ? `${count} ${word}${count > 1 ? ' are' : ' is'}`
        : `your ${word} is`
      return `Great news — ${subject} confirmed for your event on ${d.eventDate}! Share this link with your team so they can browse and pre-order: ${d.eventPageUrl || '(link pending)'}`
    },
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

  // Sent when admin force-completes an event that still has unfulfilled order items.
  // Distinct from event_settlement_summary so the vendor sees a corrective tone instead of "thank you".
  event_force_completed_with_unfulfilled: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'vendor',
    title: () => 'Event Closed With Unfulfilled Orders',
    message: (d) => {
      const count = d.orderCount || 0
      return `The event "${d.marketName || 'your event'}" has been closed by an admin while ${count} order${count !== 1 ? 's' : ''} from you ${count !== 1 ? 'were' : 'was'} still unfulfilled. Please review and resolve these orders — refund or fulfill as appropriate. Contact support if you need help.`
    },
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
