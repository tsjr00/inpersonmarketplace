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
  // COMM-3 (frugality, user decision 2026-07-17): 'info' is now FREE in_app ONLY
  // (was email-only). These are low-priority FYI notifications the user sees on
  // their next navigation — spending a paid email on them was the cost inverse
  // of frugal. Callers that still want an off-platform email record use a
  // higher tier or a dedicated email send.
  info: ['in_app'],
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
  | 'badge_earned'
  | 'vip_added'
  | 'followed_vendor_digest'
  | 'vip_reward_ready'
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
  // Phase E: season/partial booth purchase (one payment, N weeks)
  | 'booth_season_paid_vendor'
  | 'booth_season_paid_manager'
  // Phase E season-end settlement (2026-06-27): manager resolved a vendor's
  // cancelled-days shortfall as a booth credit or off-platform.
  | 'booth_season_settled_vendor'
  // Phase E Item 2 (2026-06-28): weekly use-it-or-lose-it nudge — vendor holds a
  // booth credit over $50 with an expiry approaching (expire-orders Phase 19).
  | 'booth_credit_expiring_vendor'
  // Phase E make-up days (2026-06-29): manager scheduled a post-close make-up
  // market day; vendors come sell a booth day they prepaid for.
  | 'booth_makeup_scheduled_vendor'
  // Phase E make-up days: a season's cancelled-day shortfall was covered by
  // scheduled make-up days (manager 'made_up' resolution at settlement).
  | 'booth_makeup_settled_vendor'
  | 'booth_rental_payment_failed_vendor'
  // Market manager schedule edits (2026-05-19) — notify all approved vendors
  // at the market when manager changes hours / active days / season window.
  | 'market_schedule_changed'
  // Market-day reminder to followers (Session 92 Phase B) — fires on the
  // morning of a market's operating day to buyers who follow the market.
  | 'market_day_today'
  // One-way manager broadcast to a market's vendors (Session 92 Phase B).
  | 'market_broadcast'
  | 'event_organizer_broadcast_vendor'
  | 'event_organizer_broadcast_buyer'
  // Cancel-a-market-day (Session 92 Phase C) — split by audience because the
  // action URL + copy differ: buyers (their refunded order) vs booth renters
  // (credit/reschedule of their booth fee).
  | 'market_date_cancelled_buyer'
  | 'market_date_cancelled_vendor'
  // Phase C — product-order vendor whose order was cancelled by the closure.
  | 'market_date_cancelled_order_vendor'
  // FT park-manager P4b — standing (recurring) spot holds.
  | 'park_standing_occurrence_ready'
  | 'park_date_cancelled_truck'
  // R3-4 (2026-08-27): a truck with a PAID spot chose an event that day
  // instead — the operator is told (notify only; the booking stays paid).
  | 'park_spot_skipped_for_event'
  | 'email_suppressed_notice'
  | 'park_standing_suspended'
  // FT park-manager P4b-2 — day-of check-in reminder (open/midday/pre-close).
  | 'park_checkin_reminder'
  // FT park-manager P2b fast-follow — paid park-spot booking confirmations.
  | 'park_spot_paid_vendor'
  | 'park_spot_paid_manager'
  // FT park-manager B3 — book-then-vet enforcement (operator discretion).
  | 'park_vendor_blocked'
  | 'park_booking_barred'
  | 'park_truck_docs_to_review'
  // FT park-manager P4a — a truck requested a weekly hold (operator approves/denies).
  | 'park_standing_hold_requested'
  // FT park-manager — operator added a required document; booked/recurring trucks
  // are told so the new requirement reaches vendors already at the park.
  | 'park_required_docs_updated'
  // Manager access lifecycle (Phase 1B) — fired to the affected manager
  // when an admin removes / suspends / restores their market access.
  | 'manager_access_removed'
  | 'manager_access_suspended'
  | 'manager_access_restored'
  // Post-market surveys (Phase E Stage 2, mig 147)
  | 'survey_request_vendor'
  | 'survey_request_buyer'
  | 'survey_weekly_vendor'
  | 'survey_weekly_buyer'
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
  | 'event_vendor_selected'
  | 'catering_vendor_responded'
  // T-59: the ORGANIZER's version of the above. catering_vendor_responded is
  // audience:'admin' and links to /admin/events, so it cannot be reused here —
  // an organizer would be sent to a panel they have no business on (that
  // mis-routing was the second half of T-08).
  | 'event_vendor_responded_organizer'
  | 'event_fee_paid_vendor'
  | 'event_fee_received_organizer'
  | 'event_fee_refunded_vendor'
  | 'event_fee_changed_vendor'
  // Backup bench Phase 3 — cancellation money (2026-08-16, decisions.md
  // "Backup vendors — model decided")
  | 'event_fee_forfeited_vendor'
  | 'event_fee_waiver_requested_organizer'
  | 'event_backup_spot_covered'
  | 'order_reconfirm_request'
  | 'order_reconfirm_reminder'
  | 'event_standby_offer'
  | 'event_cancelled_vendor'
  | 'event_confirmed'
  | 'event_change_requested'
  | 'event_change_decided'
  | 'event_changed_vendor'
  | 'event_feedback_request'
  | 'event_prep_reminder'
  | 'event_settlement_summary'
  | 'event_force_completed_with_unfulfilled'
  | 'event_completed_with_unfulfilled_admin'
  | 'vendor_event_approved'
  | 'vendor_event_application_submitted'
  | 'vendor_event_application_received'
  | 'event_vendor_gap_alert'
  | 'listing_suspended'
  | 'customer_milestone'

// ── Template Types ───────────────────────────────────────────────────

export interface NotificationTemplateData {
  // CHK-13: dedup reference — webhook senders store the entity id here so
  // wasNotificationSent can match the SPECIFIC event, not just user+type/24h.
  // Not rendered in any template.
  dedupRef?: string
  // P8 (2026-07-15): human-readable booked-dates summary for park-spot paid
  // confirmations (e.g. "Thu, Jul 17 & Fri, Jul 18").
  datesText?: string
  // P10 Layer 2 (2026-07-15): true when the paid park booking auto-created/
  // reactivated the truck's selling schedule at the park.
  scheduleAutoSet?: boolean
  orderNumber?: string
  itemTitle?: string
  vendorName?: string
  buyerName?: string
  marketName?: string
  pickupDate?: string
  /**
   * Every distinct pickup on the order, when it spans MORE THAN ONE. Absent on
   * ordinary single-pickup orders, so templates can branch on its presence and
   * leave the common case untouched.
   *
   * Exists because a cart may legitimately hold items from two markets — the
   * buyer acknowledges it at checkout — and the confirmation email used to
   * describe only the first, leaving them no record of where the rest of their
   * order was (T-05).
   */
  pickups?: Array<{
    marketName: string
    marketAddress: string
    pickupDate: string
    pickupTime: string
  }>
  amountCents?: number
  /** event_fee_changed_vendor (B1+C 2026-08-15): the new fee (null = removed),
      what it replaced, and what the vendor actually pays (booth math). */
  feeCents?: number | null
  previousFeeCents?: number | null
  vendorPaysCents?: number
  /** order_reconfirm_* (B3, mig 230): the order's bearer confirm token —
      actionUrl builds /{vertical}/reconfirm/{token}. */
  reconfirmToken?: string
  /** order_reconfirm_request: true on the FINAL ping (24h before the refund
      deadline) — changes the title/message urgency wording. */
  isFinal?: boolean
  /** event_fee_refunded_vendor (Phase 3 + refund-matrix, 2026-08-16): WHY the
      fee came back. Absent = the original race-loser case ("event filled"). */
  feeRefundReason?: 'early_cancel' | 'organizer_waived' | 'event_cancelled' | 'deselected' | 'admin_refund'
  /** event_fee_waiver_requested_organizer: pre-formatted last day the waive
      button works (event date + 14 days), e.g. "Sep 12, 2026". */
  waivableUntil?: string
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
  /** T-59: the message a vendor typed when accepting or declining an event
   *  invitation (market_vendors.response_notes). It was being stored and never
   *  shown to the organizer it was written for. */
  responseNotes?: string
  vertical?: string
  marketId?: string
  setupTime?: string
  orderCount?: number
  /** Loyalty Layer 1 (2026-08-25): badge_earned (buyer) + customer_milestone
   *  (vendor). Badge copy comes from lib/loyalty/config.ts BADGE_CATALOG;
   *  segmentLabel from SEGMENT_LABELS ("Regular" / "Local Legend"). */
  badgeEmoji?: string
  badgeName?: string
  badgeDescription?: string
  segmentLabel?: string
  /** A3 (2026-09-04) followed_vendor_digest: "Vendor A: item, item · Vendor B: item". */
  digestSummary?: string
  digestVendorCount?: number
  /** Punch build (2026-09-04) vip_reward_ready: "15% off" / "$5 off" (+ min-purchase clause). */
  rewardLabel?: string
  payoutAmount?: string
  eventToken?: string
  eventPageUrl?: string
  vendorCount?: number
  eventId?: string
  // ── Event change requests (mig 220/221) ────────────────────────────────
  // Deliberately NOT reusing `reason`: it is already repurposed to carry a
  // time range in catering_vendor_invited, and stacking a third meaning on one
  // field is how that becomes unreadable.
  /** Human phrasing of what is changing, e.g. "date to 2026-09-04 and start time to 13:00". */
  changeSummary?: string
  /** The organizer's chosen category, already turned into a label. */
  changeReason?: string
  /** The organizer's OWN words, verbatim. Shown to vendors and attributed to
   *  them, so they know the change came from the organizer and not from us. */
  organizerExplanation?: string
  /** The admin's note when a request is declined. Required on a decline. */
  declineReason?: string
  /** Pre-formatted money at stake, e.g. "$1,240.00". Formatted by the caller —
   *  templates must not do currency math. */
  atStakeAmount?: string
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
  /** Number of weeks in a season/partial booth purchase (Phase E). */
  weekCount?: number
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
  // Weekly survey digest (lib/surveys/cadence.ts, 2026-08-29)
  placeCount?: number
  placeNames?: string
  weekDisplay?: string
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
  // FT park-manager P4b — standing (recurring) spot holds.
  /** Park spot label, e.g. "Spot A". */
  spotLabel?: string
  /** Pay-by cutoff date (YYYY-MM-DD) for a generated recurring occurrence. */
  payByDate?: string
  /** P4b-2 check-in reminder window: 'open' | 'midday' | 'close'. */
  window?: string
  /** P2b park-spot paid confirmation: number of days in the booking group. */
  dayCount?: number
  /** P4a weekly-hold request: the day-of-week name, e.g. "Saturday". */
  weekday?: string
  /** Park required-docs update: human-readable list of the newly-added
   *  document(s) an operator now asks booked trucks to carry, e.g.
   *  "Health Permit and Fire Safety Certificate". */
  docLabels?: string
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
      const signOff = signOffs[d.vertical as string] || 'Thanks again!'

      // Multi-pickup orders get their own message listing EVERY location.
      // The single-pickup path below is untouched — `pickups` is only sent
      // when the order actually spans more than one (T-05). Composed here
      // rather than in the route so the wording stays translated.
      if (d.pickups && d.pickups.length > 1) {
        const lines = d.pickups
          .map((p) => t('notif.order_placed_pickup_line', locale, {
            marketName: p.marketName || '',
            marketAddress: p.marketAddress || '',
            pickupDate: p.pickupDate || '',
            pickupTime: p.pickupTime || '',
          }))
          .join('\n')
        return t('notif.order_placed_multi_msg', locale, {
          orderNumber: d.orderNumber || '',
          vendorName: d.vendorName || 'your vendor',
          brandName: d.brandName || "Food Truck'n",
          pickupCount: String(d.pickups.length),
          pickupSummary: lines,
          signOff,
        })
      }

      return t('notif.order_placed_msg', locale, {
        orderNumber: d.orderNumber || '',
        vendorName: d.vendorName || 'your vendor',
        brandName: d.brandName || "Food Truck'n",
        marketName: d.marketName || 'your pickup location',
        marketAddress: d.marketAddress || '',
        pickupTime: d.pickupTime || 'your scheduled time',
        pickupDate: d.pickupDate || 'your scheduled date',
        signOff,
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
    // COMM-6 (user decision 2026-07-17): a refund notice is informational, not
    // actionable-now → standard (email + in_app), not urgent (was SMS-eligible).
    urgency: 'standard',
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
    // Tester finding 2026-07-25: the invite named only the market, not the
    // recipient vendor — indistinguishable when several vendor accounts share
    // an inbox. Name the invited vendor so it's unambiguous who it's for.
    title: (d) =>
      d.marketName && d.vendorName
        ? `${d.marketName} invited ${d.vendorName} to join`
        : d.marketName
          ? `${d.marketName} invited you to join`
          : 'A market invited you to join',
    message: (d) =>
      `The manager of ${d.marketName || 'a market'} invited ${d.vendorName || 'you'} to join their market. ` +
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

  // Phase E: vendor confirmation when a season/partial booth purchase is paid
  // (one payment, N weeks). Summary — booth numbers are per-week, shown on My Bookings.
  booth_season_paid_vendor: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `Season booking confirmed at ${d.marketName || 'the market'}`,
    message: (d) => {
      const amount = d.amountCents ? ` ($${(d.amountCents / 100).toFixed(2)})` : ''
      const weeks = d.weekCount ? `${d.weekCount} week${d.weekCount === 1 ? '' : 's'}` : 'your selected weeks'
      return `Your booth is locked in for ${weeks} at ${d.marketName || 'the market'}${amount}. Booth numbers are assigned per week — see My Bookings for the details.`
    },
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/bookings`,
  },

  // Phase E: manager confirmation when a vendor's season/partial booth payment lands.
  booth_season_paid_manager: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor', // managers operate from a vendor-adjacent role; closest fit
    title: (d) =>
      d.vendorName
        ? `${d.vendorName} booked a season at ${d.marketName || 'your market'}`
        : `A vendor booked a season at ${d.marketName || 'your market'}`,
    message: (d) => {
      const amount = d.managerReceivesAmountCents
        ? ` Your portion ($${(d.managerReceivesAmountCents / 100).toFixed(2)}) will arrive in your Stripe account.`
        : ' Your portion will arrive in your Stripe account.'
      const weeks = d.weekCount ? `${d.weekCount} week${d.weekCount === 1 ? '' : 's'}` : 'multiple weeks'
      return `${d.vendorName || 'A vendor'} paid for ${weeks} at ${d.marketName || 'your market'}.${amount}`
    },
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'farmers_market'}/market-manager/${d.marketId}/dashboard#weekly-bookings`
        : `/${d.vertical || 'farmers_market'}/dashboard`,
  },

  // Phase E: season-end settlement notice to the vendor. amountCents present =
  // a booth credit was granted; absent = the manager settled off-platform.
  booth_season_settled_vendor: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `Season settled at ${d.marketName || 'the market'}`,
    message: (d) => {
      if (d.amountCents) {
        return `Some market days you prepaid for were cancelled beyond the season's cap. A booth credit of $${(d.amountCents / 100).toFixed(2)} has been added toward a future booking at ${d.marketName || 'the market'} — see My Bookings.`
      }
      return `Some market days you prepaid for were cancelled beyond the season's cap. The manager has arranged to make it right with you directly — reach out with any questions.`
    },
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/bookings`,
  },

  // Phase E Item 2: weekly use-it-or-lose-it nudge — vendor holds a booth credit
  // over $50 with an expiry approaching. Sent by expire-orders Phase 19.
  booth_credit_expiring_vendor: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (d) => `Booth credit expiring at ${d.marketName || 'a market'}`,
    message: (d) =>
      `You have a booth credit of $${((d.amountCents || 0) / 100).toFixed(2)} at ${d.marketName || 'a market'} that expires soon. Apply it toward a booth booking before it's gone — see My Bookings.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/bookings`,
  },

  // Phase E make-up days: manager scheduled a post-close make-up market day.
  // Goes to vendors holding a paid booth in the (ended) season.
  booth_makeup_scheduled_vendor: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `Make-up market day scheduled at ${d.marketName || 'the market'}`,
    message: (d) =>
      `A make-up market day on ${d.marketDate || 'a new date'} has been scheduled at ${d.marketName || 'the market'} — come sell a booth day you prepaid for this season. See My Bookings.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/bookings`,
  },

  // Phase E make-up days: a vendor's cancelled-day shortfall was covered by
  // scheduled make-up days (manager 'made_up' settlement resolution, Step 4).
  booth_makeup_settled_vendor: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `Season made whole at ${d.marketName || 'the market'}`,
    message: (d) =>
      `The market days you prepaid for that were cancelled have been covered by scheduled make-up days. Your season at ${d.marketName || 'the market'} is settled — thanks for your patience. See My Bookings.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/bookings`,
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

  // FT P4b — a recurring occurrence was generated; the truck must prepay by the
  // cutoff or the hold releases + takes a strike. T5/mig 199 (D1, user decision
  // 2026-07-18): buyers cannot place food orders for a date until its booking
  // is PAID — the message tells trucks paying early opens their order window.
  park_standing_occurrence_ready: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `Pay to keep ${d.spotLabel || 'your spot'} on ${d.marketDate || 'your recurring day'}`,
    message: (d) =>
      `Your recurring hold at ${d.marketName || 'the park'} has ${d.spotLabel || 'your spot'} reserved for ${d.marketDate || 'your next day'}. Pay by ${d.payByDate || 'the cutoff'} to keep it — otherwise it opens back up and counts as a missed week. Heads up: customers can't place food orders for that date until it's paid, so paying early opens your order window sooner.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/markets/${d.marketId || ''}/book-spot`,
  },

  // NOT-5 (mig 202, user decision 2026-07-18) — the user's email hard-bounced
  // or they marked us as spam: their address is suppressed (email channel
  // skipped until they update it). 'info' = in_app-only (COMM-3) — obviously:
  // this notice cannot be emailed to a dead address; they see it at next login.
  email_suppressed_notice: {
    urgency: 'info',
    severity: 'warning',
    audience: 'buyer',
    title: () => `We can't reach your email address`,
    message: (d) =>
      d.reason === 'complaint'
        ? `Emails from us to your address were marked as spam, so we've stopped sending them. Update your email address in your profile (or unmark us as spam and update to re-enable) to keep receiving receipts and order updates by email. In-app notifications are unaffected.`
        : `Emails to your address are bouncing, so we've paused sending them. Update your email address in your profile to keep receiving receipts and order updates by email. In-app notifications are unaffected.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/settings`,
  },

  // G3/PRK-16 (mig 201, user decision 2026-07-18) — the park operator cancelled
  // a date the truck had PAID for: the booking is cancelled and the truck gets
  // a booth-credit for another day (auto-applies at their next booking here).
  // standard = email + in_app: a money event worth an off-platform record.
  park_date_cancelled_truck: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (d) => `${d.marketName || 'The park'} cancelled ${d.marketDate || 'a date'} — you have a credit`,
    message: (d) =>
      `${d.marketName || 'The park'} cancelled ${d.marketDate || 'a booked date'}${d.reason ? ` (${d.reason})` : ''}. Your vendor space booking for that date was cancelled and a ${d.amountCents ? `$${(d.amountCents / 100).toFixed(2)} ` : ''}booking credit was added — it applies automatically the next time you book at this park.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/markets/${d.marketId || ''}/book-spot`,
  },

  // R3-4 (2026-08-27) — a truck with a PAID spot on this date accepted an event
  // instead (single-truck rule: they cannot do both). The operator is told right
  // away so they have a chance to re-let the spot — but NOTHING is released
  // here: the booking stays paid (the truck chose), the slot stays held in the
  // system; releasing it is the operator's call, arranged with the truck.
  // in_app only (standard) — free channel, and the operator acts from the
  // park dashboard anyway.
  park_spot_skipped_for_event: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor', // park operators act from a vendor-adjacent role
    title: (d) => `${d.vendorName || 'A food truck'} won't use their spot on ${d.marketDate || 'a booked date'}`,
    message: (d) =>
      `${d.vendorName || 'A food truck'} is attending an event on ${d.marketDate || 'that date'} instead of their paid spot at ${d.marketName || 'your park'}. The booking stays paid and the spot stays reserved to them — if you'd like to offer it to another truck, contact them to arrange a release.`,
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'food_trucks'}/market-manager/${d.marketId}/dashboard`
        : `/${d.vertical || 'food_trucks'}/dashboard`,
  },

  // FT P4b-2 — day-of reminder to check in (fires open / midday / pre-close to a
  // truck with a paid spot that day who hasn't checked in). Guards false no-show
  // strikes + doubles as the state location-log nudge. `window` = open|midday|close.
  park_checkin_reminder: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `Check in at ${d.marketName || 'the park'} today`,
    message: (d) =>
      `You have ${d.spotLabel || 'a spot'} booked at ${d.marketName || 'the park'} today. Tap "Confirm I'm here" to check in — it keeps your recurring hold in good standing and records your location for the state log.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
  },

  // FT P2b fast-follow — a park-spot booking (one-off / prepay-week / paid
  // recurring occurrence) was paid. Confirmation to the truck + heads-up to the
  // operator; mirrors booth_rental_paid_*. Manager uses audience 'vendor' (no
  // 'manager' audience — managers are vendor-adjacent, per booth_rental_paid_manager).
  park_spot_paid_vendor: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `Your spot at ${d.marketName || 'the park'} is confirmed`,
    message: (d) => {
      const n = d.dayCount || 1
      // P8: name the actual dates when the sender provides them
      const when = d.datesText ? ` (${d.datesText})` : ''
      // P10 Layer 2: tell the truck their selling schedule was set up for them
      const sched = d.scheduleAutoSet
        ? ' Your selling schedule at this park was set for your booked days — buyers can now order pickup; adjust it any time under your locations.'
        : ''
      // Tester finding 2026-07-23: the receipt named no amount and linked to the
      // dashboard, not the bookings list. Show what they paid + link to bookings.
      const paid = d.amountCents ? ` You paid $${(d.amountCents / 100).toFixed(2)}.` : ''
      return `Payment received — ${d.spotLabel || 'your spot'} at ${d.marketName || 'the park'} is booked for ${n} day${n === 1 ? '' : 's'}${when}.${paid} Check in through the platform on each day you operate.${sched}`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/park-bookings`,
  },
  park_spot_paid_manager: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `New spot booking at ${d.marketName || 'your park'}`,
    message: (d) => {
      const n = d.dayCount || 1
      // P8: name the actual dates when the sender provides them
      const when = d.datesText ? ` (${d.datesText})` : ''
      return `${d.vendorName || 'A food truck'} booked ${d.spotLabel || 'a spot'} at ${d.marketName || 'your park'} for ${n} day${n === 1 ? '' : 's'}${when}.`
    },
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'food_trucks'}/market-manager/${d.marketId}/dashboard`
        : `/${d.vertical || 'food_trucks'}/dashboard`,
  },

  // FT B3 — operator blocked the truck from FUTURE bookings at this park (any reason).
  park_vendor_blocked: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (d) => `You've been blocked from booking at ${d.marketName || 'this park'}`,
    message: (d) =>
      `The operator of ${d.marketName || 'this park'} has blocked your food truck from making new bookings${d.reason ? `: ${d.reason}` : '.'} Existing paid bookings are not affected. Contact the operator with any questions.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
  },
  // FT B3 — operator barred a specific paid booking (no refund; slot not resold).
  park_booking_barred: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (d) => `Your booking at ${d.marketName || 'the park'} was cancelled`,
    message: (d) =>
      `The operator of ${d.marketName || 'the park'} cancelled your booking${d.marketDate ? ` on ${d.marketDate}` : ''}${d.reason ? `: ${d.reason}` : '.'} Per the terms you accepted at booking, this is without a refund. Contact the operator with any questions.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
  },

  // FT B3 — a truck's compliance docs changed; nudge the operator to review.
  park_truck_docs_to_review: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `New documents to review at ${d.marketName || 'your park'}`,
    message: (d) =>
      `${d.vendorName || 'A food truck'} updated their compliance documents at ${d.marketName || 'your park'}. Review them in your "Your trucks" list.`,
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'food_trucks'}/market-manager/${d.marketId}/dashboard#vendors`
        : `/${d.vertical || 'food_trucks'}/dashboard`,
  },

  // FT — an operator added a required document to their park. Booked and
  // recurring trucks get told so a NEW requirement reaches vendors who are
  // already at the park (not just first-time bookers who see it on the
  // book-spot page). Informational, never blocks existing bookings
  // (book-then-vet); the truck uploads it in their profile → certifications.
  park_required_docs_updated: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `New document requested at ${d.marketName || 'a park'}`,
    message: (d) =>
      `${d.marketName || 'A park'} you're booked at now asks trucks to carry ${d.docLabels || 'an additional document'}. Add it under your profile's Documents & Certifications so the operator can verify you — this doesn't affect your existing bookings.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/edit`,
  },

  // FT P4a — a truck asked to reserve a spot every week; nudge the operator to
  // approve/deny it under "Your trucks" → Recurring holds.
  park_standing_hold_requested: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `New weekly-hold request at ${d.marketName || 'your park'}`,
    message: (d) =>
      `${d.vendorName || 'A food truck'} asked to reserve ${d.spotLabel || 'a spot'}${d.weekday ? ` every ${d.weekday}` : ''}${d.marketDate ? `, starting ${d.marketDate}` : ''}. Review it under "Your trucks" → Recurring holds to approve or deny.`,
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'food_trucks'}/market-manager/${d.marketId}/dashboard#vendors`
        : `/${d.vertical || 'food_trucks'}/dashboard`,
  },

  // FT P4b — a standing hold was auto-suspended after hitting the strike limit.
  park_standing_suspended: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (d) => `Your recurring hold at ${d.marketName || 'the park'} was paused`,
    message: (d) =>
      `Your recurring hold${d.spotLabel ? ` on ${d.spotLabel}` : ''} at ${d.marketName || 'the park'} was paused after too many missed weeks, so the spot is open to others again. You can still book days individually, and the operator can reinstate your recurring hold.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/markets/${d.marketId || ''}/book-spot`,
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
  // (market_favorites). Dedup'd per (market, date) via
  // market_day_notification_log so it sends once.
  // COMM-1 (frugality, user decision 2026-07-17): immediate = push + in_app
  // (was standard = per-follower EMAIL every operating day — the single largest
  // recurring automated email cost, linear in followers × market-days). A "come
  // shop today" nudge is push's job; the free in_app bell lands on next open.
  market_day_today: {
    urgency: 'immediate',
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

  // Tier-1 events: one-way organizer → accepted-vendors announcement for an
  // event. Standard urgency = in-app + email. Mirrors market_broadcast.
  event_organizer_broadcast_vendor: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) =>
      d.broadcastSubject
        ? `${d.marketName || 'Event'}: ${d.broadcastSubject}`
        : `Update from the ${d.marketName || 'event'} organizer`,
    message: (d) => d.broadcastBody || 'The event organizer sent an update.',
    actionUrl: (d) =>
      d.marketId
        ? `/${d.vertical || 'farmers_market'}/vendor/events/${d.marketId}`
        : `/${d.vertical || 'farmers_market'}/vendor/markets`,
  },

  // Tier-1 events: one-way organizer → attendees (who ordered) announcement.
  event_organizer_broadcast_buyer: {
    urgency: 'standard',
    severity: 'info',
    audience: 'buyer',
    title: (d) =>
      d.broadcastSubject
        ? `${d.marketName || 'Event'}: ${d.broadcastSubject}`
        : `Update about ${d.marketName || 'your event'}`,
    message: (d) => d.broadcastBody || 'The event organizer sent an update.',
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/orders`,
  },

  // Phase E Stage 2 (mig 147 follow-up). Cron generates one row per
  // attended vendor after each market day; this notification has the
  // survey UUID and a clear action URL.
  // COMM-2/COMM-5 (user decision 2026-07-17): 'info' = in_app ONLY. The cron
  // already sends ONE branded custom-HTML email via src/lib/surveys/email.ts
  // (which honors the survey_emails_opted_out preference), so the registry email
  // here was a DUPLICATE paid send that also ignored that opt-out. Dropping it
  // → one email per recipient, opt-out honored, free in_app bell for the rest.
  survey_request_vendor: {
    urgency: 'info',
    severity: 'info',
    audience: 'vendor',
    title: (d) =>
      `Quick survey — how did ${d.marketName || 'the market'} go${d.surveyDate ? ` on ${d.surveyDate}` : ''}?`,
    message: (d) => {
      const prior = (d.priorPendingCount ?? 0) > 0
        ? ` You also have ${d.priorPendingCount} survey${d.priorPendingCount === 1 ? '' : 's'} pending from prior days — your dashboard has the full list.`
        : ''
      return `Take 30 seconds to rate how the day went for you — traffic, sales, layout, site access. Only the organizer and platform admin see your ratings.${prior}`
    },
    actionUrl: (d) =>
      d.surveyId
        ? `/${d.vertical || 'farmers_market'}/vendor/survey/${d.surveyId}`
        : `/${d.vertical || 'farmers_market'}/vendor/surveys`,
  },

  // COMM-2/COMM-5: in_app-only — the single branded email ships from
  // surveys/email.ts and honors survey_emails_opted_out (see survey_request_vendor).
  survey_request_buyer: {
    urgency: 'info',
    severity: 'info',
    audience: 'buyer',
    title: (d) =>
      `How was your visit to ${d.marketName || 'the market'}${d.surveyDate ? ` on ${d.surveyDate}` : ''}?`,
    message: (d) => {
      const prior = (d.priorPendingCount ?? 0) > 0
        ? ` (You also have ${d.priorPendingCount} survey${d.priorPendingCount === 1 ? '' : 's'} pending from prior visits.)`
        : ''
      return `Share a few quick ratings — it helps ${d.marketName || 'the market'} keep improving.${prior}`
    },
    actionUrl: (d) =>
      d.accessToken
        ? `/${d.vertical || 'farmers_market'}/survey/${d.accessToken}`
        : `/${d.vertical || 'farmers_market'}/`,
  },

  // Survey cadence (owner 2026-08-29, lib/surveys/cadence.ts): ONE in-app
  // notice per person per week covering every place they were at that week.
  // in_app-only — the single weekly email ships from surveys/email.ts.
  survey_weekly_vendor: {
    urgency: 'info',
    severity: 'info',
    audience: 'vendor',
    title: (d) =>
      `Your week in review — ${d.placeCount ?? 1} place${(d.placeCount ?? 1) === 1 ? '' : 's'} to rate`,
    message: (d) =>
      `How did ${d.placeNames || 'your locations'} go for you this week (${d.weekDisplay || 'this week'})? 30 seconds each — traffic, sales, layout, site access. Only the organizer and platform admin see your ratings.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/vendor/surveys`,
  },
  survey_weekly_buyer: {
    urgency: 'info',
    severity: 'info',
    audience: 'buyer',
    title: (d) =>
      `How was your week? ${d.placeCount ?? 1} place${(d.placeCount ?? 1) === 1 ? '' : 's'} to rate`,
    message: (d) =>
      `A few quick ratings for ${d.placeNames || 'the places you visited'} (${d.weekDisplay || 'this week'}) — and a spot to tell us other places you'd like to see on the app.`,
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/buyer/surveys`,
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
    message: () => `Congratulations! Your vendor application has been approved. You're all set on the Free plan — start listing right away, and you can upgrade to Pro or Boss anytime for more features.`,
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

  // Owner 2026-08-26: the organizer CONFIRMED this vendor. Previously the
  // select route re-sent `catering_vendor_invited` with companyName
  // 'Event Confirmed' — it read as a second invitation and vendors never saw a
  // "you're in, block the date" moment. Standard = email + in_app: a vendor
  // must know this while away from the app.
  event_vendor_selected: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `You're confirmed for ${d.companyName || 'a private event'} on ${d.eventDate || 'the event date'}`,
    message: (d) => {
      const where = d.eventAddress ? ` in ${d.eventAddress}` : ''
      const people = d.headcount ? ` (${d.headcount} people)` : ''
      return `The organizer selected you for ${d.companyName || 'their event'}${where} on ${d.eventDate || 'the event date'}${people}. Block the date — attendees can now pre-order from your event menu. Your event page has the address, times, and your prep view.`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketId}`,
  },

  catering_vendor_responded: {
    urgency: 'standard',
    severity: 'info',
    audience: 'admin',
    title: (_d, locale) => t('notif.catering_vendor_responded_title', locale),
    // ⚠ T-08: this reads `vendorName` and `marketName`. Every caller used to
    // pass `companyName` and `eventDate`, so every one of these notifications
    // rendered as "undefined accepted the event invitation for undefined".
    // Fixed at the call sites 2026-08-13 (respond + cancel routes). If you add
    // a caller, pass THESE key names.
    message: (d) => `${d.vendorName || 'A vendor'} ${d.responseAction || 'responded to'} the event invitation for ${d.marketName || 'an event'}.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/admin/events`,
  },

  /**
   * T-59 — the organizer's copy of a vendor response. Owner: *"notifications
   * are free and we want to use the free resource."*
   *
   * Deliberately NOT `catering_vendor_responded`: that one is audience 'admin'
   * and its actionUrl goes to /admin/events, which is where an organizer's
   * notification was landing them (T-08, second half).
   *
   * Carries the vendor's own message, which until now was written by the
   * vendor, stored on market_vendors.response_notes, fetched by the select
   * route — and rendered on no organizer surface at all.
   *
   * ⚠ Only reaches organizers with an account: catering_requests.organizer_user_id
   * is null until a logged-in user with the matching email loads /event-manager.
   * Email remains the guaranteed channel; this is additive.
   */
  event_vendor_responded_organizer: {
    urgency: 'standard',
    severity: 'info',
    // Organizer is external and may have no account — audience does not drive
    // routing here, same as event_confirmed.
    audience: 'buyer',
    // M2 (2026-08-13): 'cancelled' branch added so the vendor-cancel route can
    // stop borrowing the accept/decline template, which produced "X cancelled
    // their commitment to the event invitation for Y". A cancellation is a
    // response-lifecycle event, so it lives here rather than as a new type.
    title: (d) => d.responseAction === 'declined'
      ? `${d.vendorName || 'A vendor'} can't make it`
      : d.responseAction === 'cancelled'
        ? `${d.vendorName || 'A vendor'} had to cancel`
        : `${d.vendorName || 'A vendor'} said yes`,
    message: (d) => {
      const who = d.vendorName || 'A vendor'
      const what = d.marketName || 'your event'
      const note = d.responseNotes ? ` They said: "${d.responseNotes}"` : ''
      if (d.responseAction === 'cancelled') {
        return `${who} cancelled their commitment to ${what}.${note} We're checking for available backup ${term(d.vertical || 'food_trucks', 'vendors').toLowerCase()} and will let you know if a replacement is found.`
      }
      return d.responseAction === 'declined'
        ? `${who} declined your invitation to ${what}.${note}`
        : `${who} accepted your invitation to ${what}.${note}`
    },
    actionUrl: (d) => d.eventId
      ? `/${d.vertical || 'food_trucks'}/event-manager/${d.eventId}/dashboard`
      : `/${d.vertical || 'food_trucks'}/event-manager`,
  },

  // ── Event Vendor Fees (V1 2026-08-14, decisions.md) ─────────────────────
  // Caller: the checkout.session.completed webhook handler ONLY
  // (handleEventVendorFeeCheckoutComplete in lib/stripe/webhooks.ts).
  // Required keys: marketName, marketId, amountCents (what the VENDOR paid on
  // the vendor types; what the ORGANIZER receives on the organizer one), plus
  // vendorName + eventId on the organizer type. Keys named here to keep the
  // caller honest — the T-08 class is a caller/template key mismatch.
  event_fee_paid_vendor: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: () => 'Your spot is secured',
    message: (d) =>
      `Your Event Vendor Fee${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} for ${d.marketName || 'the event'} is paid — your spot is confirmed.`,
    actionUrl: (d) => d.marketId
      ? `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketId}`
      : `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
  },

  event_fee_received_organizer: {
    urgency: 'standard',
    severity: 'info',
    // Organizer routing, not audience routing — same note as
    // event_vendor_responded_organizer above.
    audience: 'buyer',
    title: (d) => `${d.vendorName || 'A vendor'} paid their Event Vendor Fee`,
    message: (d) =>
      `${d.vendorName || 'A vendor'} paid the vendor fee for ${d.marketName || 'your event'}.${d.amountCents ? ` Your portion ($${(d.amountCents / 100).toFixed(2)}) is on its way to your account.` : ''}`,
    actionUrl: (d) => d.eventId
      ? `/${d.vertical || 'food_trucks'}/event-manager/${d.eventId}/dashboard`
      : `/${d.vertical || 'food_trucks'}/event-manager`,
  },

  // Phase 3 (2026-08-16): no longer webhook-only — also sent by the vendor
  // cancel route (early_cancel), the fee-waiver route (organizer_waived), and
  // the organizer/admin event-cancel paths (event_cancelled). Branches on
  // feeRefundReason; absent = the original race-loser case.
  event_fee_refunded_vendor: {
    urgency: 'immediate',
    severity: 'warning',
    audience: 'vendor',
    title: (d) =>
      d.feeRefundReason === 'early_cancel' ? 'Your event fee was refunded'
      : d.feeRefundReason === 'organizer_waived' ? 'The organizer waived your forfeited fee'
      : d.feeRefundReason === 'event_cancelled' ? 'Event cancelled — your fee was refunded'
      : d.feeRefundReason === 'deselected' ? 'Selection changed — your fee was refunded'
      : d.feeRefundReason === 'admin_refund' ? 'Your event fee was refunded'
      : 'Event filled — your fee was refunded',
    message: (d) => {
      const amount = d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''
      const eventName = d.marketName || 'the event'
      if (d.feeRefundReason === 'early_cancel') {
        return `You cancelled your spot at ${eventName} before the 72-hour protection window, so your Event Vendor Fee${amount} has been refunded in full.`
      }
      if (d.feeRefundReason === 'organizer_waived') {
        return `The organizer of ${eventName} chose to waive your forfeited Event Vendor Fee${amount}. It has been refunded in full.`
      }
      if (d.feeRefundReason === 'event_cancelled') {
        return `${eventName} was cancelled by the organizer. Your Event Vendor Fee${amount} has been refunded in full.`
      }
      if (d.feeRefundReason === 'deselected') {
        return `The organizer of ${eventName} changed their vendor selection and your spot is no longer confirmed. Your Event Vendor Fee${amount} has been refunded in full — you're on the backup list and will be contacted if a spot reopens.`
      }
      if (d.feeRefundReason === 'admin_refund') {
        return `Our team refunded your Event Vendor Fee${amount} for ${eventName}. If you weren't expecting this, reply to this notification or contact support.`
      }
      return `All vendor spots at ${eventName} were taken before your payment completed. Your Event Vendor Fee${amount} has been refunded in full.`
    },
    actionUrl: (d) => d.marketId
      ? `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketId}`
      : `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
  },

  // ── Backup bench Phase 3 — cancellation money (2026-08-16) ───────────────
  // Model: decisions.md "Backup vendors — model decided". Forfeit moves NO
  // money (the split happened at payment time; forfeiting = not refunding).
  // The organizer holds the waiver lever until event date + 14 days.
  event_fee_forfeited_vendor: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: () => 'Your event fee was forfeited',
    message: (d) =>
      `You cancelled your spot at ${d.marketName || 'the event'} inside the 72-hour protection window, so your Event Vendor Fee${d.amountCents ? ` of $${(d.amountCents / 100).toFixed(2)}` : ''} is forfeited per the event terms. The organizer has been given your reason and can choose to waive the forfeit and refund you — you'll be notified if they do.`,
    actionUrl: (d) => d.marketId
      ? `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketId}`
      : `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
  },

  event_fee_waiver_requested_organizer: {
    urgency: 'standard',
    severity: 'warning',
    // Organizer routing, not audience routing — same note as
    // event_vendor_responded_organizer.
    audience: 'buyer',
    title: (d) => `${d.vendorName || 'A vendor'} cancelled late — their fee is yours to keep or waive`,
    message: (d) => {
      const amount = d.amountCents ? `$${(d.amountCents / 100).toFixed(2)}` : 'Their fee'
      const note = d.reason ? ` Their reason: "${d.reason}"` : ''
      const deadline = d.waivableUntil ? ` You can waive it from your event dashboard until ${d.waivableUntil}.` : ''
      return `${d.vendorName || 'A vendor'} cancelled their spot at ${d.marketName || 'your event'} inside the 72-hour window.${note} ${amount} is forfeited and stays with you by default — it covers the spot if a backup steps in. If you feel the circumstances warrant it, you can waive the forfeit and refund them.${deadline}`
    },
    actionUrl: (d) => d.eventId
      ? `/${d.vertical || 'food_trucks'}/event-manager/${d.eventId}/dashboard`
      : `/${d.vertical || 'food_trucks'}/event-manager`,
  },

  event_backup_spot_covered: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: () => 'Your spot fee is covered',
    message: (d) =>
      `Good news — your Event Vendor Fee for ${d.marketName || 'the event'}${d.amountCents ? ` ($${(d.amountCents / 100).toFixed(2)})` : ''} is covered. The vendor you're replacing forfeited their fee when they cancelled, and that forfeit is your step-in bonus: accept the invitation and your spot is paid for.`,
    actionUrl: (d) => d.marketId
      ? `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketId}`
      : `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
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
  // ── Event change requests ─────────────────────────────────────────────
  //
  // All three are `standard` = email + in_app. Not `immediate` (push + in_app,
  // no email — an admin who is not in the app never learns) and not `urgent`
  // (sms + in_app, no email — costs money and needs phone numbers we do not
  // collect). Email is the strongest channel available without new plumbing,
  // and these are rare: a request only exists when an event was too close for
  // its organizer to change it themselves.
  event_change_requested: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'admin',
    title: () => 'An organizer needs help with a locked event',
    message: (d) => {
      const stake = d.atStakeAmount ? ` ${d.atStakeAmount} is at stake.` : ''
      const reason = d.changeReason ? ` Reason given: ${d.changeReason}.` : ''
      const words = d.organizerExplanation ? ` They wrote: "${d.organizerExplanation}"` : ''
      return `${d.companyName || 'An organizer'} is asking to change ${d.changeSummary || 'their event'} for ${d.eventDate || 'their event'}, which is too close for them to change themselves.${stake}${reason}${words} Nothing happens until you decide.`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/admin/events`,
  },

  event_change_decided: {
    urgency: 'standard',
    severity: 'info',
    // The organizer is external and may have no account — audience does not
    // drive routing here, same as event_confirmed.
    audience: 'buyer',
    title: (d) => d.responseAction === 'approved'
      ? 'Your event change is done'
      : 'We could not make that change',
    message: (d) => {
      if (d.responseAction === 'approved') {
        return `We have updated ${d.changeSummary || 'your event'}. Everyone who committed to your event has been told, and we passed on what you told us. If anyone had already pre-ordered, we will be in touch about those orders.`
      }
      const why = d.declineReason ? ` ${d.declineReason}` : ''
      return `We were not able to change ${d.changeSummary || 'your event'}.${why} If this leaves you stuck, reply to this message and we will work it out with you.`
    },
    actionUrl: (d) => d.eventId
      ? `/${d.vertical || 'food_trucks'}/event-manager/${d.eventId}/dashboard`
      : `/${d.vertical || 'food_trucks'}/event-manager`,
  },

  // B3 (owner spec 2026-08-08, built 2026-08-15, mig 230): the event a buyer
  // pre-ordered for changed its day, place, or start time — they keep their
  // order by saying "I'm still coming" on the token page. Sent for the FIRST
  // ping (from requestEventReconfirmation) and the FINAL ping (isFinal, from
  // the hourly cron, 24h before the refund deadline) — 'standard' urgency =
  // email + in-app, the spec's "email on the first and last only". Keys the
  // caller must pass: orderNumber, changeSummary, eventDate, reconfirmToken.
  order_reconfirm_request: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'buyer',
    title: (d) => d.isFinal
      ? 'Last chance — confirm your event order or it will be refunded'
      : 'Your event changed — are you still coming?',
    message: (d) => d.isFinal
      ? `The event on ${d.eventDate || 'your calendar'} changed (${d.changeSummary || 'details updated'}) and order ${d.orderNumber || ''} still needs your confirmation. If you don't confirm before ordering closes, your order will be refunded so your vendor doesn't cook for no one.`
      : `The organizer changed ${d.changeSummary || 'the details'} for the event on ${d.eventDate || 'your calendar'}. Your pre-order (${d.orderNumber || ''}) still stands — just tap to confirm you can still make it. Orders nobody confirms are refunded before the event.`,
    actionUrl: (d) => d.reconfirmToken
      ? `/${d.vertical || 'food_trucks'}/reconfirm/${d.reconfirmToken}`
      : `/${d.vertical || 'food_trucks'}/buyer/orders`,
  },

  // B3: the +48h nudge between the first and final pings — in-app only
  // ('info' urgency, COMM-3 frugality: no paid email for the middle nudge).
  order_reconfirm_reminder: {
    urgency: 'info',
    severity: 'warning',
    audience: 'buyer',
    title: () => 'Still coming? Your event order needs a quick confirm',
    message: (d) =>
      `Quick reminder: the event on ${d.eventDate || 'your calendar'} changed and your order (${d.orderNumber || ''}) is waiting on your confirmation. One tap keeps it.`,
    actionUrl: (d) => d.reconfirmToken
      ? `/${d.vertical || 'food_trucks'}/reconfirm/${d.reconfirmToken}`
      : `/${d.vertical || 'food_trucks'}/buyer/orders`,
  },

  // Backup bench phase 2 (owner model 2026-08-15, mig 232): sent to a vendor
  // the organizer did NOT select, offering the standby bench. The terms in the
  // message are the owner's 2026-08-08 spec: commit to being ASKED, not to
  // going; decline activation freely. Recipient is an ACCEPTED vendor, so the
  // real event name is fine. Keys the caller must pass: marketName, eventDate,
  // marketId.
  event_standby_offer: {
    urgency: 'standard',
    severity: 'info',
    audience: 'vendor',
    title: () => "You weren't selected — want to be on standby?",
    message: (d) =>
      `The organizer of ${d.marketName || 'the event'} on ${d.eventDate || 'your calendar'} went with other vendors this time. If you'd like, join the standby bench: if a selected vendor cancels, you're first in line to be asked. You're committing to being asked — not to going — and you can decline freely if it no longer works for you.`,
    actionUrl: (d) => d.marketId
      ? `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketId}`
      : `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
  },

  // B1+C merge (owner 2026-08-15): the organizer set, changed, or removed the
  // Event Vendor Fee AFTER this vendor accepted (the retroactive-fee case).
  // Sent to ACCEPTED vendors WITHOUT a paid fee row only — vendors who already
  // paid keep their snapshot amounts (owner decision: no platform refunds on a
  // fee change; they take it up with the organizer). Keys the caller must pass:
  // feeCents (null = removed), previousFeeCents, vendorPaysCents (booth math,
  // what securing the spot costs them), marketName, marketId.
  event_fee_changed_vendor: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: (d) => d.feeCents
      ? 'The vendor fee for your event has changed'
      : 'The vendor fee for your event was removed',
    message: (d) => d.feeCents
      ? `The organizer ${d.previousFeeCents ? 'changed' : 'set'} the Event Vendor Fee for ${d.marketName || 'your event'} — securing your spot now costs $${((d.vendorPaysCents || 0) / 100).toFixed(2)}.`
      : `The organizer removed the Event Vendor Fee for ${d.marketName || 'your event'} — no payment is needed to keep your spot.`,
    actionUrl: (d) => d.marketId
      ? `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketId}`
      : `/${d.vertical || 'food_trucks'}/vendor/dashboard`,
  },

  event_changed_vendor: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'vendor',
    title: () => 'An event you committed to has changed',
    message: (d) => {
      // The organizer's words, attributed. Owner, 2026-08-09: vendors should
      // know the change came from the organizer and not from us.
      const words = d.organizerExplanation
        ? ` The organizer told us: "${d.organizerExplanation}"`
        : ''
      const reason = d.changeReason ? ` (${d.changeReason})` : ''
      return `The organizer has changed ${d.changeSummary || 'the details'} for the event on ${d.eventDate || 'your calendar'}${reason}.${words} Please check the new details and make sure they still work for you.`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketId}`,
  },

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

  event_completed_with_unfulfilled_admin: {
    urgency: 'standard',
    severity: 'warning',
    audience: 'admin',
    title: () => 'Event Completed With Unfulfilled Orders',
    message: (d) => {
      const items = d.orderCount || 0
      return `The event "${d.marketName || 'an event'}" was completed with ${items} unfulfilled order item${items !== 1 ? 's' : ''}. The affected vendors were notified to resolve them — review if follow-up is needed.`
    },
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/admin/events`,
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

  // ── Loyalty Layer 1 (2026-08-25) ────────────────────────────────────
  // Both are FREE-channel by design (comms-frugality): a badge is push +
  // in_app, a vendor milestone is in_app only. Never SMS/email.

  // Buyer earned a badge (lib/loyalty/evaluate.ts). Badges live on the
  // Favorites page (owner: keep the dashboard consolidated).
  badge_earned: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'buyer',
    title: (d) => `${d.badgeEmoji || '🏅'} ${d.badgeName || 'New badge'}`,
    message: (d) => {
      const where = d.vendorName ? ` at ${d.vendorName}` : ''
      return `You earned ${d.badgeName || 'a new badge'}${where}. ${d.badgeDescription || ''}`.trim()
    },
    actionUrl: (d) => `/${d.vertical || 'farmers_market'}/favorites`,
  },

  // A buyer just crossed a segment threshold WITH THIS VENDOR (Regular at 4
  // fulfilled orders, Local Legend at 10 or 3 straight months). The owner's
  // ask: tell the vendor who to appreciate and call by name. In-app only —
  // the vendor sees it on their next visit to the dashboard.
  // A2 (2026-09-04): the nudge now has a button behind it — links to the
  // Your Customers report where "Add to VIP" lives, and says so.
  customer_milestone: {
    urgency: 'info',
    severity: 'info',
    audience: 'vendor',
    title: (d) => `${d.buyerName || 'A customer'} is now a ${d.segmentLabel || 'Regular'}`,
    message: (d) => {
      const n = d.orderCount
      const nth = n ? ` just picked up order #${n} from you` : ' keeps coming back'
      return `${d.buyerName || 'A customer'}${nth} — they're a ${d.segmentLabel || 'Regular'} now. Worth a thank-you by name at the window. Make them a VIP from Your Customers?`
    },
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/insights`,
  },

  // A2 (mig 242, owner 2026-09-04): a vendor hand-picked this buyer as a VIP.
  // Recognition is the feature in Phase A ("getting VIP status feels exclusive
  // and personal"); Phase B perks attach to the same designation. Immediate =
  // push + in_app, both free channels — a delight moment worth a ping.
  vip_added: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'buyer',
    title: (d) => `⭐ You're a VIP at ${d.vendorName || 'one of your vendors'}!`,
    message: (d) =>
      `${d.vendorName || 'A vendor you love'} added you to their VIP list — they know a great customer when they see one.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/favorites`,
  },

  // A3 (2026-09-04): ONE 8am digest per buyer per vertical per day covering
  // every followed/VIP vendor's new items — never a per-vendor ping (owner:
  // "we don't want a user get 5 updates from 5 trucks"). Content-gated: sent
  // only when there IS something new. lib/notifications/vendor-digest.ts.
  followed_vendor_digest: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'buyer',
    title: (d) =>
      d.digestVendorCount && d.digestVendorCount > 1
        ? `🍴 New today from ${d.digestVendorCount} of your vendors`
        : `🍴 New today at ${d.vendorName || 'a vendor you follow'}`,
    message: (d) => d.digestSummary || 'Your vendors added new items today — take a look.',
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/favorites`,
  },

  // Punch build (2026-09-04, D6): the buyer just completed a punch card —
  // their NEXT order at this vendor auto-carries the reward (no codes, no
  // screens to show). Free channels; the earn is exactly the moment to ping.
  vip_reward_ready: {
    urgency: 'immediate',
    severity: 'info',
    audience: 'buyer',
    title: (d) => `🎉 You earned it — ${d.rewardLabel || 'a VIP reward'} at ${d.vendorName || 'your vendor'}!`,
    message: (d) =>
      `Your next order at ${d.vendorName || 'this vendor'} automatically gets ${d.rewardLabel || 'your reward'}. Nothing to show, nothing to enter — just order.`,
    actionUrl: (d) => `/${d.vertical || 'food_trucks'}/favorites`,
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
  // NI-R22 (COMM-8, user decision 2026-07-17): new_paid_order FM → immediate
  // (push + in_app) like FT, dropping the per-order email. Push cheaply carries
  // the "new order" nudge; FM (days-ahead) vendors see it in the in_app bell.
  new_paid_order: { farmers_market: 'immediate' },
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
