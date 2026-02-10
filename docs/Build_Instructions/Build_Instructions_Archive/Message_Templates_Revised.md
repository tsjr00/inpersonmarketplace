# Message Templates - Revised Draft (Round 2)

**Document Purpose:** Draft message content for all platform communications. Review and edit as needed.

**Platform Philosophy:**
- Platform provides technical infrastructure for prepaid marketplace transactions
- Platform does NOT mediate disputes between buyers and vendors - they handle issues directly
- Prepaid orders signal buyer commitment; vendors should prioritize quality for these customers
- Pickups are scheduled for specific future dates, not "today" (except flash sales)
- Vendor workflow: Confirm inventory → Set aside → Prepare → Mark Ready → Handoff → Confirm

**Variable Notation:** `[VARIABLE_NAME]` = dynamic content inserted at send time

**Platform Variables:**
- `[PLATFORM_NAME]` = "FastWrks" or vertical-specific name
- `[SUPPORT_EMAIL]` = support email address (for technical platform issues only)
- `[APP_URL]` = platform URL

---

# SECTION 1: ORDER LIFECYCLE

---

## 1.1 Order Placed - To Buyer

| Field | Value |
|-------|-------|
| **Name** | order_placed_buyer |
| **Sender** | Platform |
| **Recipient** | Buyer |
| **Method** | Email |

**Subject:** Order Received - #[ORDER_NUMBER]

**Body:**
```
Hi [BUYER_FIRST_NAME],

Your order has been received and the vendor has been notified!

ORDER #[ORDER_NUMBER]
Placed: [ORDER_DATE] at [ORDER_TIME]

─────────────────────────────────

ITEMS:

[FOR EACH ITEM:]
[ITEM_NAME]
Qty: [QUANTITY] | [ITEM_PRICE]
From: [VENDOR_NAME]
Pickup: [MARKET_NAME]
        [MARKET_ADDRESS]
        [PICKUP_DATE], [PICKUP_TIME_WINDOW]

─────────────────────────────────

TOTAL PAID: [ORDER_TOTAL]

─────────────────────────────────

WHAT HAPPENS NEXT:

1. [VENDOR_NAME] will confirm and prepare your order
2. You'll receive a notification when it's ready for pickup
3. Head to [MARKET_NAME] on [PICKUP_DATE] during your pickup window
4. Show your order confirmation to the vendor and complete the transaction in the app

─────────────────────────────────

View your order: [ORDER_LINK]

Thank you for supporting local vendors!

[PLATFORM_NAME]
```

---

## 1.2 Order Placed - To Vendor

| Field | Value |
|-------|-------|
| **Name** | order_placed_vendor |
| **Sender** | Platform |
| **Recipient** | Vendor |
| **Method** | Email |

**Subject:** New Prepaid Order #[ORDER_NUMBER]

**Body:**
```
Hi [VENDOR_FIRST_NAME],

You have a new prepaid order! Please prioritize this order according to the pickup information below.

Customers prepay because they want to ensure they get high-quality products. Please choose the best from your inventory or harvest for prepaid customers.

ORDER #[ORDER_NUMBER]
Received: [ORDER_DATE] at [ORDER_TIME]

─────────────────────────────────

CUSTOMER: [BUYER_DISPLAY_NAME]

ITEMS ORDERED:

[FOR EACH ITEM:]
[ITEM_NAME]
Qty: [QUANTITY]
Price: [ITEM_PRICE]

─────────────────────────────────

PICKUP DETAILS:

Location: [MARKET_NAME]
Date: [PICKUP_DATE]
Time Window: [PICKUP_TIME_WINDOW]

─────────────────────────────────

NEXT STEPS:

1. Confirm you have sufficient inventory to fulfill this order
2. Mark the order as "Confirmed" and set this inventory aside
3. Use your Vendor Dashboard pick list to prepare for each market
4. Mark items as "Ready" when prepared for pickup
5. Customer will pick up during the time window
6. Confirm the handoff in the app

─────────────────────────────────

Manage this order: [ORDER_LINK]

[PLATFORM_NAME]
```

---

## 1.3 Item Ready for Pickup - To Buyer

| Field | Value |
|-------|-------|
| **Name** | item_ready_buyer |
| **Sender** | Platform |
| **Recipient** | Buyer |
| **Method** | Email + SMS |

**Email Subject:** Your order from [VENDOR_NAME] is ready for pickup

**Email Body:**
```
Hi [BUYER_FIRST_NAME],

[VENDOR_NAME] has marked your order as ready for pickup. It will be available for you on [PICKUP_DATE] at [MARKET_NAME].

─────────────────────────────────

YOUR ORDER:

[ITEM_NAME] from [VENDOR_NAME]
Qty: [QUANTITY]

─────────────────────────────────

PICKUP DETAILS:

[MARKET_NAME]
[MARKET_ADDRESS]
[PICKUP_DATE], [PICKUP_TIME_WINDOW]

─────────────────────────────────

WHAT TO DO:

1. Head to [MARKET_NAME] on [PICKUP_DATE]
2. Show your order confirmation to [VENDOR_NAME] at their booth
3. Confirm the pickup in the app

Enjoy your day at the market!

View your order: [ORDER_LINK]

[PLATFORM_NAME]
```

**SMS:**
```
[VENDOR_NAME] has marked your order as ready! Pickup at [MARKET_NAME] on [PICKUP_DATE], [PICKUP_TIME_WINDOW]. [SHORT_LINK]
```

---

## 1.4 Pickup Confirmation Mismatch - To Non-Confirming Party

| Field | Value |
|-------|-------|
| **Name** | pickup_mismatch |
| **Sender** | Platform |
| **Recipient** | Party who hasn't confirmed |
| **Method** | Email + SMS |

**Email Subject:** Action needed: Please confirm completion of Order #[ORDER_NUMBER]

**Email Body (To Buyer when Vendor confirmed):**
```
Hi [BUYER_FIRST_NAME],

[VENDOR_NAME] has marked your order as picked up, but we haven't received your confirmation yet.

ORDER #[ORDER_NUMBER]
[ITEM_NAME]

─────────────────────────────────

DID YOU PICK UP YOUR ORDER?

Yes, I picked it up: [CONFIRM_LINK]

─────────────────────────────────

If you picked up your order, please confirm so [VENDOR_NAME] can receive their payment.

If there's an issue with your order, please contact [VENDOR_NAME] directly to resolve it.

Please respond within 24 hours.

[PLATFORM_NAME]
```

**Email Body (To Vendor when Buyer confirmed):**
```
Hi [VENDOR_FIRST_NAME],

[BUYER_DISPLAY_NAME] has confirmed picking up their order, but we haven't received your confirmation yet.

ORDER #[ORDER_NUMBER]
[ITEM_NAME]

─────────────────────────────────

DID YOU COMPLETE THIS HANDOFF?

Yes, order was picked up: [CONFIRM_LINK]

─────────────────────────────────

Please confirm so we can complete this transaction.

If there's an issue and you need to contact the customer, please reply to this email and we will facilitate the connection.

[PLATFORM_NAME]
```

**SMS:**
```
[OTHER_PARTY] marked order #[ORDER_NUMBER] as complete. Please confirm in the app: [SHORT_LINK]
```

**IMPLEMENTATION NOTE:** When a vendor reports a problem (which may affect platform revenue), platform will facilitate contact with buyer since vendor may not have buyer's contact info. When a buyer has a problem, they contact the vendor directly.

---

## 1.5 Item Cancelled by Vendor - To Buyer

| Field | Value |
|-------|-------|
| **Name** | item_cancelled_vendor |
| **Sender** | Platform |
| **Recipient** | Buyer |
| **Method** | Email |

**Subject:** Order Update - [VENDOR_NAME] was unable to fulfill [ITEM_NAME]

**Body:**
```
Hi [BUYER_FIRST_NAME],

Unfortunately, [VENDOR_NAME] was unable to fulfill part of your order.

─────────────────────────────────

CANCELLED ITEM:

[ITEM_NAME]
Qty: [QUANTITY]
Amount: [ITEM_PRICE]

Reason: [CANCELLATION_REASON]

─────────────────────────────────

REFUND:

[REFUND_AMOUNT] has been refunded to your original payment method.

Please allow 5-10 business days for the refund to appear on your statement.

─────────────────────────────────

[IF OTHER ITEMS REMAIN:]
YOUR REMAINING ORDER:

The following items are still scheduled for pickup:

[REMAINING_ITEM_NAME]
Pickup: [MARKET_NAME], [PICKUP_DATE]

If you'd like to cancel your remaining order for a full refund, you can do so here: [CANCEL_ORDER_LINK]

Or log in to your account and cancel from your order history.

─────────────────────────────────

If you have questions about this cancellation, please contact [VENDOR_NAME] directly.

[PLATFORM_NAME]
```

**DECISION NEEDED:** Who pays the platform fee when a vendor cancels? Options:
1. Buyer pays 5% (doesn't seem fair)
2. Vendor pays the fee
3. Platform absorbs the cost to maintain vendor relationships

---

## 1.6 Pickup Missed - To Buyer

| Field | Value |
|-------|-------|
| **Name** | pickup_missed_buyer |
| **Sender** | Platform |
| **Recipient** | Buyer |
| **Method** | Email |

**Subject:** Missed pickup - Order #[ORDER_NUMBER]

**Body:**
```
Hi [BUYER_FIRST_NAME],

It looks like you weren't able to pick up your order.

ORDER #[ORDER_NUMBER]
[ITEM_NAME] from [VENDOR_NAME]

Scheduled pickup: [PICKUP_DATE] at [MARKET_NAME]

─────────────────────────────────

Please contact [VENDOR_NAME] directly to discuss your options.

[IF VENDOR_CONTACT_AVAILABLE:]
[VENDOR_CONTACT_INFO]
[ELSE:]
Reply to this email and we will help connect you with the vendor.

─────────────────────────────────

Please note: Vendors prepare orders specifically for you based on your prepaid commitment. Missed pickups affect their business.

[PLATFORM_NAME]
```

**IMPLEMENTATION NOTE:** Need app feature to facilitate buyer-vendor connection for missed pickups. Add disclosure to buyer terms that platform will share contact info with vendor in case of missed pickup.

---

## 1.7 Pickup Missed - To Vendor

**CLARIFICATION NEEDED:** How does the platform know a pickup was missed? Current options:
1. Time window expires without both parties confirming
2. Vendor marks it as missed
3. Automated check after market day ends

The current email assumes the platform knows and is telling the vendor, but we need to clarify the actual flow.

| Field | Value |
|-------|-------|
| **Name** | pickup_missed_vendor |
| **Sender** | Platform |
| **Recipient** | Vendor |
| **Method** | Email |

**Subject:** Unconfirmed pickup - Order #[ORDER_NUMBER]

**Body:**
```
Hi [VENDOR_FIRST_NAME],

The pickup window has passed for Order #[ORDER_NUMBER] without confirmation from both parties.

ORDER #[ORDER_NUMBER]
[ITEM_NAME]
Qty: [QUANTITY]
Customer: [BUYER_DISPLAY_NAME]

Scheduled: [PICKUP_DATE] at [MARKET_NAME]

─────────────────────────────────

PLEASE UPDATE THIS ORDER:

Did the customer pick up their order?
- Yes, confirm late pickup: [CONFIRM_LINK]

Did the customer not show up?
- Mark as missed: [MISSED_LINK]

─────────────────────────────────

How you handle missed pickups is between you and your customer.

[PLATFORM_NAME]
```

---

# SECTION 2: FLASH SALES

**DEFERRED:** Flash sales messages will be finalized after the module is implemented so we can speak specifically to actual app functionality.

---

# SECTION 3: MONTHLY MARKET BOX SUBSCRIPTIONS

**TERMINOLOGY NOTE:** Always use "Monthly Market Box" (or "Monthly Box") rather than just "Market Box" to reinforce the subscription commitment. "Market Box" alone could be confused with a regular listing.

---

## 3.1 Subscription Started - To Buyer

| Field | Value |
|-------|-------|
| **Name** | subscription_started_buyer |
| **Sender** | Platform |
| **Recipient** | Buyer |
| **Method** | Email |

**Subject:** Welcome to your Monthly Market Box from [VENDOR_NAME]!

**Body:**
```
Hi [BUYER_FIRST_NAME],

Your Monthly Market Box subscription has been received and [VENDOR_NAME] has been notified!

─────────────────────────────────

YOUR SUBSCRIPTION

[MARKET_BOX_NAME]
From: [VENDOR_NAME]
Duration: [TERM_WEEKS] weeks
Total Paid: [TOTAL_PAID]

─────────────────────────────────

YOUR PICKUP SCHEDULE

[FOR EACH PICKUP:]
Week [WEEK_NUMBER]: [PICKUP_DATE]
[MARKET_NAME], [PICKUP_TIME_WINDOW]

─────────────────────────────────

WHAT TO EXPECT

Each week, [VENDOR_NAME] will have your box ready at [MARKET_NAME].

If [VENDOR_NAME] ever needs to skip a week (weather, crop issues, etc.), we'll notify you and your subscription will be extended automatically at no extra cost.

─────────────────────────────────

FIRST PICKUP

[FIRST_PICKUP_DATE] at [MARKET_NAME]
[PICKUP_TIME_WINDOW]

Mark your calendar!

View your subscription: [SUBSCRIPTION_LINK]

Thank you for supporting [VENDOR_NAME]!

[PLATFORM_NAME]
```

---

## 3.2 Subscription Started - To Vendor

| Field | Value |
|-------|-------|
| **Name** | subscription_started_vendor |
| **Sender** | Platform |
| **Recipient** | Vendor |
| **Method** | Email |

**Subject:** New Monthly Market Box Subscriber - [BUYER_DISPLAY_NAME]

**Body:**
```
Hi [VENDOR_FIRST_NAME],

You have a new Monthly Market Box subscriber!

This customer has prepaid for [TERM_WEEKS] weeks of your [MARKET_BOX_NAME]. They're counting on you for high-quality products each week.

─────────────────────────────────

NEW SUBSCRIPTION

Customer: [BUYER_DISPLAY_NAME]
Monthly Box: [MARKET_BOX_NAME]
Duration: [TERM_WEEKS] weeks
Starts: [START_DATE]
Your payout: [VENDOR_PAYOUT]

─────────────────────────────────

PICKUP SCHEDULE

This customer will pick up at [MARKET_NAME] on:

[FOR EACH PICKUP:]
Week [WEEK_NUMBER]: [PICKUP_DATE]

─────────────────────────────────

You now have [ACTIVE_SUBSCRIBER_COUNT] active subscriber(s) for this Monthly Box.

Manage your Monthly Boxes: [MARKET_BOX_LINK]

[PLATFORM_NAME]
```

---

## 3.3 Weekly Pickup Reminder

**REMOVED:** We are not sending weekly reminder emails. Pickup reminders are between the buyer and vendor. We've done our part to facilitate the transaction.

---

## 3.4 Week Skipped by Vendor - To Buyer

| Field | Value |
|-------|-------|
| **Name** | market_box_skipped |
| **Sender** | Platform |
| **Recipient** | Buyer |
| **Method** | Email + SMS |

**Email Subject:** [MARKET_BOX_NAME] - This week's pickup has been skipped

**Email Body:**
```
Hi [BUYER_FIRST_NAME],

[VENDOR_NAME] needs to skip this week's Monthly Box pickup.

─────────────────────────────────

SKIPPED WEEK

Original pickup: [ORIGINAL_PICKUP_DATE]
Reason: [SKIP_REASON]

─────────────────────────────────

YOUR SUBSCRIPTION HAS BEEN EXTENDED

We've automatically added an extra week to your subscription at no additional cost.

Original end date: [ORIGINAL_END_DATE]
New end date: [NEW_END_DATE]

─────────────────────────────────

YOUR UPDATED SCHEDULE

[FOR REMAINING PICKUPS:]
Week [WEEK_NUMBER]: [PICKUP_DATE] [IF EXTENSION: (Extended)]

─────────────────────────────────

Vendors occasionally need to skip due to weather, crop conditions, or other circumstances. Your subscription value is preserved through the automatic extension.

If you have questions, please contact [VENDOR_NAME] directly.

[PLATFORM_NAME]
```

**SMS:**
```
[VENDOR_NAME] needs to skip this week's [MARKET_BOX_NAME]. Your subscription has been extended by 1 week. Check email for details.
```

---

## 3.5 Subscription Renewal Prompt - To Buyer

| Field | Value |
|-------|-------|
| **Name** | market_box_renewal |
| **Sender** | Platform |
| **Recipient** | Buyer |
| **Method** | Email |

**Subject:** Your Monthly Box from [VENDOR_NAME] ends next week

**Body:**
```
Hi [BUYER_FIRST_NAME],

Your Monthly Market Box subscription is almost complete!

─────────────────────────────────

[MARKET_BOX_NAME]
From [VENDOR_NAME]

Final pickup: [FINAL_PICKUP_DATE]

─────────────────────────────────

WANT TO KEEP IT GOING?

If you've enjoyed your weekly boxes from [VENDOR_NAME], check the app to see what Monthly Market Boxes are available and act soon to secure your spot.

[VIEW_MONTHLY_BOXES_BUTTON]

─────────────────────────────────

If you choose not to renew, your subscription will end after your final pickup next week.

Browse Monthly Boxes and other products on the app to find what you need.

Thank you for supporting [VENDOR_NAME]!

[PLATFORM_NAME]
```

---

# SECTION 4: VENDOR ACCOUNT

---

## 4.1 Application Submitted - To Vendor

| Field | Value |
|-------|-------|
| **Name** | vendor_app_submitted |
| **Sender** | Platform |
| **Recipient** | Vendor applicant |
| **Method** | Email |

**Subject:** We received your vendor application!

**Body:**
```
Hi [VENDOR_FIRST_NAME],

Thank you for applying to sell on [PLATFORM_NAME]!

We've received your application for [BUSINESS_NAME]. We will review it as soon as we can, usually within 2-3 business days.

─────────────────────────────────

WHAT'S NEXT

If approved, you'll be notified and can start setting up your listings right away. When your account is approved, any draft listings will automatically go live.

If for some reason your application is not approved, you will be notified.

─────────────────────────────────

WHILE YOU WAIT - HOW [PLATFORM_NAME] WORKS

PREPAID ORDERS:
Customers browse and prepay for your products before market day. This gives you guaranteed sales and helps you plan your inventory. In return, customers expect your best products - they're paying ahead because they want quality.

YOUR WORKFLOW:
1. Receive an order notification
2. Confirm you have inventory and mark the order "Confirmed"
3. Use your pick list to prepare for each market or private pickup location
4. Mark orders "Ready" when prepared
5. Customer picks up and you both confirm in the app

PICKUP LOCATIONS:
You can sell at farmers markets, craft fairs, and other public markets - as well as private pickup locations like your farm, studio, or home.

GETTING PAID:
- Payments are processed through Stripe
- Funds are deposited directly to your bank account
- Typical deposit time: 2 business days after pickup confirmation
- Platform fee: 6.5% (this covers credit card processing fees on your behalf)

─────────────────────────────────

Questions? Reply to this email.

We look forward to having you on the platform!

[PLATFORM_NAME]
```

---

## 4.2 Application Submitted - To Admin

| Field | Value |
|-------|-------|
| **Name** | vendor_app_admin |
| **Sender** | Platform |
| **Recipient** | Admin |
| **Method** | Email |

**Subject:** New Vendor Application - [BUSINESS_NAME]

**Body:**
```
New vendor application received.

Business: [BUSINESS_NAME]
Vertical: [VERTICAL_NAME]
Applicant: [VENDOR_NAME]
Email: [VENDOR_EMAIL]
Phone: [VENDOR_PHONE]

Submitted: [SUBMISSION_DATE]

Review in admin: [ADMIN_LINK]
```

---

## 4.3 Application Approved - To Vendor

| Field | Value |
|-------|-------|
| **Name** | vendor_app_approved |
| **Sender** | Platform |
| **Recipient** | Vendor |
| **Method** | Email |

**Subject:** You're approved! Welcome to [PLATFORM_NAME]

**Body:**
```
Hi [VENDOR_FIRST_NAME],

Your vendor application has been approved!

Welcome to [PLATFORM_NAME]. We're excited to have [BUSINESS_NAME] on the platform.

─────────────────────────────────

GETTING STARTED

1. Familiarize yourself with your Vendor Dashboard: [DASHBOARD_LINK]

2. Set up your Vendor Profile so buyers can learn about you and your business

3. Connect your bank account through Stripe to receive payments: [STRIPE_SETUP_LINK]

4. Set your pickup locations - you can sell at markets AND private pickup locations (farm, studio, etc.): [LOCATIONS_LINK]

5. Create your first listings so buyers can find you: [CREATE_LISTING_LINK]

─────────────────────────────────

HOW PREPAID ORDERS WORK

WHEN YOU GET AN ORDER:
- You'll receive an email notification
- Confirm you have inventory and mark the order "Confirmed"
- Use your Vendor Dashboard pick list to prepare for each market or pickup location

AT PICKUP:
- Mark orders "Ready" when prepared
- Customer will show their order confirmation
- Hand off the order and both of you confirm in the app

GETTING PAID:
- Payment releases after both parties confirm pickup
- Funds deposit to your bank in ~2 business days
- Platform fee: 6.5% (this covers credit card processing fees on your behalf)

QUALITY MATTERS:
Customers prepay because they want to guarantee they get your products. They expect your best. Choose quality items from your inventory or harvest for prepaid orders.

─────────────────────────────────

Questions? Reply to this email anytime.

[PLATFORM_NAME]
```

---

## 4.4 Application Rejected - To Vendor

| Field | Value |
|-------|-------|
| **Name** | vendor_app_rejected |
| **Sender** | Platform |
| **Recipient** | Vendor |
| **Method** | Email |

**Subject:** Update on your vendor application

**Body:**
```
Hi [VENDOR_FIRST_NAME],

Thank you for your interest in selling on [PLATFORM_NAME].

After reviewing your application, we're unable to approve [BUSINESS_NAME] at this time.

─────────────────────────────────

[IF REJECTION_REASON PROVIDED:]
REASON

[REJECTION_REASON]

─────────────────────────────────

[END IF]

[IF REAPPLY_ALLOWED:]
You're welcome to reapply after addressing any issues. If you have questions about what's needed, please reply to this email.
[ELSE:]
If you believe this decision was made in error, please reply to this email with additional information.
[END IF]

Respectfully,

[PLATFORM_NAME]
```

**IMPLEMENTATION NOTE:** The REASON section is conditional - only include if the admin provides a reason. Need to determine how flexible email template logic can be.

---

## 4.5 Listing Removed by Admin - To Vendor

| Field | Value |
|-------|-------|
| **Name** | listing_removed |
| **Sender** | Platform |
| **Recipient** | Vendor |
| **Method** | Email |

**Subject:** Your listing has been removed - [LISTING_TITLE]

**Body:**
```
Hi [VENDOR_FIRST_NAME],

Your listing "[LISTING_TITLE]" has been removed from [PLATFORM_NAME].

─────────────────────────────────

REASON

[REMOVAL_REASON]

─────────────────────────────────

WHAT THIS MEANS

- The listing is no longer visible to buyers
- Any pending orders for this listing have been cancelled and refunded
- This action may affect your account standing

─────────────────────────────────

NEXT STEPS

Please review our vendor guidelines: [GUIDELINES_LINK]

If you believe this was done in error, reply to this email with any relevant information.

[PLATFORM_NAME]
```

---

## 4.6 Payout Failed - To Vendor

| Field | Value |
|-------|-------|
| **Name** | payout_failed |
| **Sender** | Platform |
| **Recipient** | Vendor |
| **Method** | Email |

**Subject:** Action Required: Your payout failed

**Body:**
```
Hi [VENDOR_FIRST_NAME],

We weren't able to send your payout of [PAYOUT_AMOUNT].

─────────────────────────────────

PAYOUT DETAILS

Amount: [PAYOUT_AMOUNT]
Date attempted: [PAYOUT_DATE]
Reason: [FAILURE_REASON]

─────────────────────────────────

HOW TO FIX THIS

Please check with your bank or review your Stripe account to make sure everything is in order.

Update your payment settings here: [UPDATE_PAYMENT_SETTINGS_LINK]

Once updated, we'll retry your payout within 1-2 business days.

─────────────────────────────────

Your earnings are safe. Hopefully this is just a temporary issue with the transfer.

If you have additional questions, please contact us.

[PLATFORM_NAME]
```

---

# SECTION 5: VIP SYSTEM

**DEFERRED:** VIP system messages will be finalized after the module is implemented so we can speak specifically to actual app functionality.

---

# SECTION 6: ADMIN TOOLS

---

## 6.1 Vendor Warning - To Vendor

| Field | Value |
|-------|-------|
| **Name** | vendor_warning |
| **Sender** | Admin |
| **Recipient** | Vendor |
| **Method** | Email |

**Subject:** Important: Action required for your vendor account

**Body:**
```
Hi [VENDOR_FIRST_NAME],

We need to bring something to your attention regarding your vendor account on [PLATFORM_NAME].

─────────────────────────────────

ISSUE

[WARNING_DESCRIPTION]

─────────────────────────────────

WHAT WE NEED FROM YOU

[REQUIRED_ACTION]

Please address this within [DEADLINE_DAYS] days.

─────────────────────────────────

WHY THIS MATTERS

[CONSEQUENCE_IF_NOT_ADDRESSED]

─────────────────────────────────

If you have questions or believe this warning was issued in error, please reply to this email.

[ADMIN_NAME]
[PLATFORM_NAME]
```

---

## 6.2 Vendor Suspended - To Vendor

| Field | Value |
|-------|-------|
| **Name** | vendor_suspended |
| **Sender** | Platform |
| **Recipient** | Vendor |
| **Method** | Email |

**Subject:** Your vendor account has been suspended

**Body:**
```
Hi [VENDOR_FIRST_NAME],

Your vendor account on [PLATFORM_NAME] has been suspended, effective immediately.

─────────────────────────────────

REASON

[SUSPENSION_REASON]

─────────────────────────────────

WHAT THIS MEANS

- Your listings are no longer visible to buyers
- You cannot accept new orders
- Pending orders have been cancelled and customers refunded
- You will not receive payouts for cancelled orders

─────────────────────────────────

QUESTIONS?

Please review the Vendor Agreement and Terms of Service for more information: [TERMS_LINK]

If your questions are not answered there, you may reply to this email.

─────────────────────────────────

APPEAL PROCESS

If you believe this suspension was made in error, you may appeal by replying to this email with:

1. An explanation of the circumstances
2. Any supporting documentation
3. Steps you'll take to prevent future issues

Appeals are typically reviewed within 5 business days.

[PLATFORM_NAME]
```

---

## 6.3 Vendor Suspended - To Affected Buyers

| Field | Value |
|-------|-------|
| **Name** | vendor_suspended_buyer |
| **Sender** | Platform |
| **Recipient** | Buyers with pending orders from suspended vendor |
| **Method** | Email |

**Subject:** Your order from [VENDOR_NAME] has been cancelled

**Body:**
```
Hi [BUYER_FIRST_NAME],

Your order from [VENDOR_NAME] has been cancelled.

─────────────────────────────────

CANCELLED ORDER

Order #[ORDER_NUMBER]
[ITEM_NAME]
Amount: [ORDER_TOTAL]

─────────────────────────────────

REFUND

A full refund of [REFUND_AMOUNT] has been issued to your original payment method.

Please allow 5-10 business days for the refund to appear on your statement.

─────────────────────────────────

We apologize for the inconvenience. This cancellation was necessary due to an issue with the vendor's account.

If you'd like to find similar products from other vendors: [BROWSE_LINK]

[PLATFORM_NAME]
```

---

# SECTION 7: MARKET SUGGESTIONS

---

## 7.1 Market Suggestion Thank You - To Vendor

| Field | Value |
|-------|-------|
| **Name** | market_suggestion_thanks |
| **Sender** | Platform |
| **Recipient** | Vendor who suggested the market |
| **Method** | Email |

**Subject:** Thank you! [MARKET_NAME] is now on [PLATFORM_NAME]

**Body:**
```
Hi [VENDOR_FIRST_NAME],

Thank you for suggesting [MARKET_NAME]!

We've reviewed and added it to the platform. You and other vendors can now select this market as a pickup location.

─────────────────────────────────

[MARKET_NAME]
[MARKET_ADDRESS]
[MARKET_SCHEDULE]

─────────────────────────────────

Vendors like you help us grow and serve more communities.

Got more markets we should add? You can suggest them anytime from your dashboard.

[PLATFORM_NAME]
```

---

# SECTION 8: NICE-TO-HAVE

---

## 8.1 Abandoned Cart Reminder - To Buyer

| Field | Value |
|-------|-------|
| **Name** | abandoned_cart |
| **Sender** | Platform |
| **Recipient** | Buyer |
| **Method** | Email |
| **Timing** | TBD - research optimal timing |

**Subject:** Still interested in these items?

**Body:**
```
Hi [BUYER_FIRST_NAME],

You have items in your cart from local vendors:

─────────────────────────────────

YOUR CART

[FOR EACH ITEM:]
[ITEM_NAME] from [VENDOR_NAME]
[PRICE]

Cart Total: [CART_TOTAL]

─────────────────────────────────

WHY PREPAY?

When you prepay, vendors set aside their best products for you. You're guaranteed quality items waiting at pickup - no racing to the market hoping your favorites aren't sold out.

[COMPLETE_ORDER_BUTTON]

─────────────────────────────────

Note: Inventory is limited and items may sell out before the next market day.

[PLATFORM_NAME]
```

**RESEARCH NEEDED:** What is the optimal timing for abandoned cart emails? Need to research best practices before implementing.

---

# APPENDIX: OPEN QUESTIONS

## 1.4 - Asymmetric Contact Handling
When a VENDOR has a problem with an order (which may affect platform revenue), they may not have buyer contact info. Platform should facilitate this connection. When a BUYER has a problem, they contact the vendor directly. Is this the right approach?

## 1.5 - Platform Fee on Vendor Cancellations
Who pays the platform fee when a vendor cancels an item? Options:
- Buyer pays 5% (doesn't seem fair to penalize buyer for vendor's issue)
- Vendor pays the fee
- Platform absorbs the cost

## 1.6/1.7 - Missed Pickup Flow
How does the platform know a pickup was missed? What is the trigger for these emails?
- Time window expires without confirmation from both parties?
- Vendor marks it as missed?
- Automated check after market day?

Also: Need app feature to facilitate buyer-vendor connection when vendor doesn't have buyer's contact info.

## 4.4 - Conditional Email Logic
How flexible can our email template system be? We need conditional sections (e.g., only show rejection reason if admin provides one).

## 8.1 - Abandoned Cart Timing
Research needed on optimal timing for abandoned cart emails.

---

# APPENDIX: VARIABLE REFERENCE

## Buyer Variables
- `[BUYER_FIRST_NAME]` - Buyer's first name
- `[BUYER_DISPLAY_NAME]` - Buyer's display name
- `[BUYER_EMAIL]` - Buyer's email address

## Vendor Variables
- `[VENDOR_FIRST_NAME]` - Vendor's first name
- `[VENDOR_NAME]` - Business/vendor name
- `[VENDOR_EMAIL]` - Vendor's email
- `[VENDOR_CONTACT_INFO]` - Vendor's contact info (if available)
- `[BUSINESS_NAME]` - Registered business name

## Order Variables
- `[ORDER_NUMBER]` - Unique order identifier
- `[ORDER_DATE]` - Date order was placed
- `[ORDER_TIME]` - Time order was placed
- `[ORDER_TOTAL]` - Total amount charged to buyer
- `[ORDER_LINK]` - Link to order details
- `[CANCEL_ORDER_LINK]` - Link to cancel remaining order

## Item Variables
- `[ITEM_NAME]` - Product/listing name
- `[ITEM_PRICE]` - Price of item
- `[QUANTITY]` - Quantity ordered
- `[ITEM_COUNT]` - Number of different items

## Market/Location Variables
- `[MARKET_NAME]` - Market name
- `[MARKET_ADDRESS]` - Full market address
- `[PICKUP_DATE]` - Scheduled pickup date
- `[PICKUP_TIME_WINDOW]` - Pickup time range (e.g., "9am - 12pm")
- `[PICKUP_END_TIME]` - End of pickup window

## Subscription Variables
- `[MARKET_BOX_NAME]` - Name of monthly market box offering
- `[TERM_WEEKS]` - Subscription length in weeks
- `[TOTAL_PAID]` - Total subscription cost
- `[CURRENT_WEEK]` - Current week number
- `[TOTAL_WEEKS]` - Total weeks (including extensions)
- `[SUBSCRIPTION_LINK]` - Link to subscription details

## Platform Variables
- `[PLATFORM_NAME]` - Platform name
- `[SUPPORT_EMAIL]` - Support email address (for technical platform issues only)
- `[APP_URL]` - Main application URL
- `[DASHBOARD_LINK]` - Link to user's dashboard
- `[TERMS_LINK]` - Link to Terms of Service and Vendor Agreement
