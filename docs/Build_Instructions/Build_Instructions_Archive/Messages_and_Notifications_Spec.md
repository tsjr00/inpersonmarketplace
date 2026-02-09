# Messages & Notifications Specification (Revised)

## Overview
This document outlines communications between parties on the marketplace platform.

**Philosophy:** Only send messages that provide actionable value. If users can see the information on their dashboard, don't clutter their inbox. Focus on time-sensitive notifications and transaction issues.

**Parties:**
- **Buyer** - Customer purchasing products
- **Vendor** - Seller offering products
- **Platform** - Automated system messages
- **Admin** - Platform administrators

**Channels:**
- **Email** - Primary channel for most notifications
- **SMS** - For time-critical notifications (marked with 📱)
- **In-App** - Badge/alert within the platform

---

# PART 1: NECESSARY - ORDER LIFECYCLE

## 1.1 Order Placed

**To Buyer:**
| Field | Value |
|-------|-------|
| **Trigger** | Buyer completes checkout |
| **Channel** | Email |
| **Content** | Order confirmation: order #, items, quantities, vendor(s), pickup location(s), pickup date/time window, total paid |
| **In-App** | Yes - appears in order history |

**To Vendor:**
| Field | Value |
|-------|-------|
| **Trigger** | Buyer completes checkout |
| **Channel** | Email |
| **Content** | New order: order #, items, quantities, buyer name, pickup location, pickup date |
| **In-App** | Yes - badge on Orders |

---

## 1.2 Item Ready for Pickup 📱

| Field | Value |
|-------|-------|
| **Trigger** | Vendor marks item as "ready" |
| **To** | Buyer |
| **Channel** | **SMS recommended** + Email |
| **Content** | "Your [item] from [Vendor] is ready! Pickup at [location] until [end time]." |
| **In-App** | Yes - prominent alert |

**Why SMS:** Time-sensitive, buyer may be on their way to market. Email could be missed.

---

## 1.3 Pickup Confirmation Mismatch 📱

| Field | Value |
|-------|-------|
| **Trigger** | One party marks transaction complete but other does not within [X hours] |
| **To** | Both parties (separate messages) |
| **Channel** | **SMS recommended** + Email |
| **Content** | To party who didn't confirm: "[Other party] marked your order as complete. Please confirm in app or contact us if there's an issue." |
| **In-App** | Yes - action required |

**Why SMS:** Resolves disputes quickly, prevents stuck orders.

---

## 1.4 Item Cancelled by Vendor

| Field | Value |
|-------|-------|
| **Trigger** | Vendor cancels an item |
| **To** | Buyer |
| **Channel** | Email |
| **Content** | "[Vendor] was unable to fulfill [item]. Reason: [reason]. Refund of [amount] has been issued to your original payment method." |
| **In-App** | Yes |

---

## 1.5 Pickup Missed (No-Show)

**To Buyer:**
| Field | Value |
|-------|-------|
| **Trigger** | Market day/pickup window ends without confirmation |
| **To** | Buyer |
| **Channel** | Email |
| **Content** | "We noticed you didn't pick up [item] from [Vendor]. Please contact us if you need assistance." |
| **In-App** | Yes |

**To Vendor:**
| Field | Value |
|-------|-------|
| **Trigger** | Pickup window ends without confirmation |
| **To** | Vendor |
| **Channel** | Email |
| **Content** | "[Buyer] did not pick up [item]. Please mark as missed or confirm if they picked up late." |
| **In-App** | Yes - action required |

---

# PART 2: NECESSARY - FLASH SALES 📱

## 2.1 Flash Sale Posted - Premium Members

| Field | Value |
|-------|-------|
| **Trigger** | Vendor posts flash sale |
| **To** | Premium buyer members who: (1) purchased from this vendor in past 365 days, (2) within 25 miles, (3) opted-in to flash sale notifications |
| **Channel** | **SMS recommended** + Email |
| **Timing** | Immediate |
| **Content** | "FLASH SALE: [Vendor] has [item] available now! [X] left. You have 15-min exclusive access. [link]" |

**Why SMS:** Time-critical (15-min exclusive window), high value for premium members.

---

## 2.2 Flash Sale Posted - VIPs (Non-Members)

| Field | Value |
|-------|-------|
| **Trigger** | Vendor posts flash sale |
| **To** | VIP customers of this vendor (tagged by premium vendor) |
| **Channel** | **SMS recommended** + Email |
| **Timing** | 5 minutes after premium notification |
| **Content** | "FLASH SALE: [Vendor] has [item] available! As their VIP, you get early access. [X] left. [link]" |

**Why SMS:** Still time-critical, VIP status is a privilege worth delivering quickly.

---

## 2.3 Flash Sale Posted - Free Tier

| Field | Value |
|-------|-------|
| **Trigger** | Vendor posts flash sale |
| **To** | Free tier users who: (1) purchased from this vendor in past 365 days, (2) within 25 miles, (3) opted-in |
| **Channel** | Email only |
| **Timing** | 10 minutes after premium notification |
| **Content** | "[Vendor] has a flash sale! [item] - [X] remaining. [link]" |

**Why Email only:** Less time-critical for free tier, SMS would feel spammy without the exclusive window benefit.

---

## 2.4 Flash Sale Consolidation Rules

- **Max 1 flash sale notification per user per day** (across all vendors)
- **Time window:** 8am - 6pm only
- **Multiple vendors:** Consolidate into single email when possible
- **Opt-in required:** Users must enable flash sale notifications

---

# PART 3: NECESSARY - MARKET BOX SUBSCRIPTIONS

## 3.1 Subscription Started

| Field | Value |
|-------|-------|
| **Trigger** | Buyer purchases market box subscription |
| **To** | Buyer |
| **Channel** | Email |
| **Content** | "Welcome to [Market Box Name]! Your [X]-week subscription starts [date]. First pickup: [date] at [location], [time window]. You'll receive a reminder before each pickup." |
| **In-App** | Yes |

**To Vendor:**
| Field | Value |
|-------|-------|
| **Trigger** | Buyer purchases subscription |
| **To** | Vendor |
| **Channel** | Email |
| **Content** | "New subscriber: [Buyer] subscribed to [Market Box] for [X] weeks starting [date]." |
| **In-App** | Yes - badge on Market Boxes |

---

## 3.2 Weekly Pickup Reminder 📱

| Field | Value |
|-------|-------|
| **Trigger** | 24 hours before scheduled pickup |
| **To** | Buyer |
| **Channel** | **SMS recommended** + Email |
| **Content** | "Reminder: Your [Market Box] pickup is tomorrow at [location], [time]." |
| **In-App** | Yes |

**Why SMS:** Helps ensure they don't forget - missed pickups hurt both parties.

---

## 3.3 Week Skipped by Vendor

| Field | Value |
|-------|-------|
| **Trigger** | Vendor skips a week |
| **To** | Buyer |
| **Channel** | Email |
| **Content** | "[Vendor] needs to skip this week's [Market Box]. Reason: [reason]. Your subscription has been extended by 1 week automatically. New end date: [date]." |
| **In-App** | Yes |

---

## 3.4 Subscription Renewal Prompt

| Field | Value |
|-------|-------|
| **Trigger** | 1 week before final pickup |
| **To** | Buyer |
| **Channel** | Email |
| **Content** | "Your [Market Box] ends next week! Want to keep receiving [Vendor]'s fresh products? Renew for another [X] weeks. [link]" |
| **In-App** | Yes |

---

# PART 4: NECESSARY - VENDOR ACCOUNT

## 4.1 Application Submitted

**To Vendor:**
| Field | Value |
|-------|-------|
| **Trigger** | Vendor submits signup |
| **To** | Vendor |
| **Channel** | Email |
| **Content** | "Thanks for applying to sell on [Platform]! We'll review your application within [X] business days. Here's what to expect... [onboarding info about how the platform works, order flow, payout timing, etc.]" |
| **In-App** | Dashboard shows "Pending" status |

**To Admin:**
| Field | Value |
|-------|-------|
| **Trigger** | Vendor submits signup |
| **To** | Admin |
| **Channel** | Email / Admin queue |
| **Content** | "New vendor application: [Business Name] in [Vertical]" |

---

## 4.2 Application Approved

| Field | Value |
|-------|-------|
| **Trigger** | Admin approves vendor |
| **To** | Vendor |
| **Channel** | Email |
| **Content** | "Congratulations! Your vendor account has been approved. Here's how to get started: 1) Connect your bank account for payouts, 2) Create your first listing, 3) [other onboarding steps]. The order and pickup flow works like this: [explanation]" |
| **In-App** | Dashboard unlocks |

---

## 4.3 Application Rejected

| Field | Value |
|-------|-------|
| **Trigger** | Admin rejects vendor |
| **To** | Vendor |
| **Channel** | Email |
| **Content** | "We're unable to approve your application at this time. Reason: [reason]. You may reapply after [conditions]." |
| **In-App** | Dashboard shows rejection |

---

## 4.4 Listing Flagged/Removed by Admin

| Field | Value |
|-------|-------|
| **Trigger** | Admin removes listing |
| **To** | Vendor |
| **Channel** | Email |
| **Content** | "Your listing '[title]' has been removed. Reason: [reason]. Please review our guidelines: [link]" |
| **In-App** | Yes - alert |

---

## 4.5 Payout Failed

| Field | Value |
|-------|-------|
| **Trigger** | Payout fails |
| **To** | Vendor |
| **Channel** | Email |
| **Content** | "Your payout of [amount] failed. Please update your payment settings: [link]" |
| **In-App** | Yes - urgent alert |

---

# PART 5: NECESSARY - VIP SYSTEM

## 5.1 Added to VIP List

| Field | Value |
|-------|-------|
| **Trigger** | Vendor adds customer as VIP |
| **To** | Customer (buyer) |
| **Channel** | Email |
| **Content** | "You're now a VIP at [Vendor]! As a VIP, you get: 5-minute early access to their flash sales, notifications when they post new items. Thank you for being a valued customer!" |
| **In-App** | Optional badge |

---

## 5.2 VIP Daily Bundle Digest

| Field | Value |
|-------|-------|
| **Trigger** | Daily at 8am if any VIP vendor posted new bundles yesterday |
| **To** | Customers who are VIPs of those vendors |
| **Channel** | Email |
| **Content** | "New from your favorite vendors: [Vendor 1] posted '[Bundle]' - $XX, [Vendor 2] posted '[Bundle]' - $XX. [link]" |
| **Consolidation** | Max 5 vendors per email, max 1 email per day |

---

# PART 6: NECESSARY - ADMIN TOOLS

## 6.1 Individual Vendor Warning

| Field | Value |
|-------|-------|
| **Trigger** | Admin sends warning |
| **To** | Specific vendor |
| **Channel** | Email |
| **Content** | Warning about policy violation, performance issue, etc. |
| **In-App** | Yes - requires acknowledgment |

---

## 6.2 Vendor Account Suspended

| Field | Value |
|-------|-------|
| **Trigger** | Admin suspends vendor |
| **To** | Vendor |
| **Channel** | Email |
| **Content** | "Your vendor account has been suspended. Reason: [reason]. Appeal process: [details]." |
| **In-App** | Dashboard locked |

**To Affected Buyers:**
| Field | Value |
|-------|-------|
| **Trigger** | Vendor suspended with pending orders |
| **To** | Buyers with pending orders from this vendor |
| **Channel** | Email |
| **Content** | "Your order with [Vendor] has been cancelled and refunded due to vendor account issues. We apologize for the inconvenience." |

---

# PART 7: NECESSARY - MARKET SUGGESTIONS

## 7.1 Market Suggestion Thank You (Approved)

| Field | Value |
|-------|-------|
| **Trigger** | Admin approves vendor's market suggestion |
| **To** | Vendor who suggested it |
| **Channel** | Email |
| **Content** | "Thank you for suggesting [Market Name]! It's now available on the platform. Vendors like you help us grow and serve more communities. Keep the suggestions coming!" |

*Note: No notification for rejection - vendor will simply not see it appear in the market list.*

---

# PART 8: NICE-TO-HAVE

## 8.1 Abandoned Cart Reminder

| Field | Value |
|-------|-------|
| **Trigger** | Items in cart for 24+ hours |
| **To** | Buyer |
| **Channel** | Email |
| **Content** | "You left items in your cart! [items] from [vendors]. Complete your order before the market. [link]" |
| **Priority** | High - directly impacts revenue |

---

## 8.2 Weekly Sales Summary (Vendor)

| Field | Value |
|-------|-------|
| **Trigger** | Weekly (Sunday night) |
| **To** | Vendors with sales that week |
| **Channel** | Email |
| **Content** | "This week: [X] orders, [amount] in sales. Top seller: [item]." |
| **Priority** | Medium - engagement/retention |

---

## 8.3 Milestone Celebrations

| Field | Value |
|-------|-------|
| **Trigger** | 10th sale, 50th sale, 100th sale, 1 year anniversary |
| **To** | Vendor |
| **Channel** | Email |
| **Content** | "Congratulations on [milestone]! You're making a real impact in your community." |
| **Priority** | Low - nice for engagement |

---

# PART 9: SMS-PRIORITY SUMMARY

Messages that benefit significantly from SMS delivery:

| Message | Why SMS |
|---------|---------|
| **Item Ready for Pickup** | Buyer may be en route to market |
| **Pickup Confirmation Mismatch** | Resolves disputes quickly |
| **Flash Sale - Premium Members** | 15-min exclusive window is time-critical |
| **Flash Sale - VIPs** | 5-min early access is time-critical |
| **Market Box Weekly Reminder** | Prevents missed pickups |

**SMS Implementation Notes:**
- Require opt-in for SMS notifications
- Allow users to choose Email-only if preferred
- Consider SMS costs in pricing model
- Twilio or similar service for delivery

---

# PART 10: ADMIN SETTINGS NEEDED

## Notification Preferences (Vendor)
- [ ] Order notifications: Email / In-app / Both
- [ ] Flash sale posting confirmation: On/Off
- [ ] Weekly summary: On/Off

## Notification Preferences (Buyer)
- [ ] Order updates: Email / In-app / Both
- [ ] Pickup reminders: Email / SMS / Both
- [ ] Flash sale notifications: On/Off (opt-in)
- [ ] VIP notifications from vendors: On/Off

## Admin Controls
- [ ] Email service provider configuration
- [ ] SMS service configuration
- [ ] Template editor for email content
- [ ] Enable/disable specific notification types globally
- [ ] Notification logs/audit trail

---

# PART 11: IMPLEMENTATION PRIORITY

## Phase 1 - Orders Work (MVP)
1. Order placed (buyer + vendor)
2. Item ready for pickup
3. Pickup confirmation mismatch
4. Item cancelled
5. Pickup missed

## Phase 2 - Vendor Onboarding
6. Application submitted/approved/rejected
7. Listing flagged/removed
8. Payout failed
9. Vendor warning/suspension

## Phase 3 - Flash Sales
10. Flash sale notifications (premium → VIP → free timing)
11. Flash sale consolidation logic

## Phase 4 - Market Box
12. Subscription started
13. Weekly pickup reminder
14. Week skipped
15. Renewal prompt

## Phase 5 - VIP System
16. Added to VIP list
17. VIP daily bundle digest

## Phase 6 - Nice-to-Have
18. Abandoned cart
19. Weekly sales summary
20. Milestone celebrations

---

# Appendix: Message Templates (Examples)

## Order Placed - Buyer
```
Subject: Order Confirmed - #[ORDER_NUMBER]

Hi [BUYER_NAME],

Your order is confirmed!

Order #[ORDER_NUMBER]
Placed: [DATE]

Items:
- [ITEM_NAME] from [VENDOR_NAME] - [PRICE]
  Pickup: [MARKET_NAME], [DATE], [TIME_WINDOW]

Total Paid: [TOTAL]

What's next:
1. [VENDOR] will prepare your order
2. You'll get a notification when it's ready
3. Pick up at [MARKET] during your time window
4. Show your order confirmation to the vendor

Questions? Reply to this email.

Thanks for supporting local!
[PLATFORM]
```

## Flash Sale - Premium Member (SMS)
```
FLASH SALE from [VENDOR]!
[ITEM] - $[PRICE]
Only [QTY] left!
15-min exclusive access.
[SHORT_LINK]
```

## Market Box Pickup Reminder (SMS)
```
Reminder: Your [BOX_NAME] pickup is tomorrow!
[MARKET], [TIME]
Don't forget!
```
