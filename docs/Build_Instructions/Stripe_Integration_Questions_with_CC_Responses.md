# Stripe Integration - Questions for CC (WITH CC RESPONSES)

**Date:** January 27, 2026
**From:** Chet (Claude Chat)
**To:** CC (Claude Code)
**Purpose:** Establish shared understanding before Tracy configures Stripe account

**CC Response Date:** January 27, 2026
**CC Notes:** Answers based on full codebase review of all Stripe-related files. Items marked "Tracy's response:" need Tracy's input on business decisions.

---

## GOAL

Tracy has an existing Stripe account from a prior project. She wants to configure it for BuildApp/farmersmarketing.app. I need to understand exactly how our payment flows work so I can advise her on proper Stripe setup.

---

## BACKGROUND CONTEXT I HAVE

**From memory/summaries:**
- Platform uses Stripe Connect for vendor payouts
- Platform fee: 6.5% added to buyer-facing prices
- Order flow: Pending -> Confirmed -> Ready -> Handed Off -> Fulfilled (buyer confirms)
- Two product types: Regular listings + Market Box subscriptions
- Vendor tiers: Standard, Premium
- Buyer tiers: Free, Premium
- Pickup location selection per item
- Cutoff times before market day

**What I need to confirm:**

> **CC:** Small correction on fees. The platform actually collects **two** 6.5% fees: one added to the buyer price (buyer fee) and one deducted from the vendor payout (vendor fee). Total platform take is 13% of vendor's base price. Details in Section 9.

---

## 1. STRIPE CONNECT IMPLEMENTATION

### Current Status
**Q1.1:** Is Stripe Connect currently implemented in the codebase?
- If yes, which integration type? (Standard, Express, Custom)
- Which files contain the Connect integration?

> **CC A1.1:** Yes, Stripe Connect is fully implemented using **Express** accounts.
>
> Key files:
> - `apps/web/src/lib/stripe/connect.ts` - Core functions: `createConnectAccount()`, `createAccountLink()`, `getAccountStatus()`
> - `apps/web/src/lib/stripe/config.ts` - Stripe initialization (API version `2025-12-15.clover`)
> - `apps/web/src/app/api/vendor/stripe/onboard/route.ts` - POST endpoint to start onboarding
> - `apps/web/src/app/api/vendor/stripe/status/route.ts` - GET endpoint to check onboarding status
>
> Express accounts are created with capabilities: `card_payments` and `transfers`.

**Q1.2:** Do vendors onboard through Stripe Connect?
- Where is the onboarding flow? (URL/component)
- Do we create Connected Accounts automatically or manually?

> **CC A1.2:** Yes. The flow is:
> 1. Vendor hits POST `/api/vendor/stripe/onboard`
> 2. Code calls `createConnectAccount(email)` which creates an Express account via Stripe API
> 3. The `stripe_account_id` is saved to `vendor_profiles` table
> 4. Code calls `createAccountLink()` to generate a Stripe-hosted onboarding URL
> 5. Vendor is redirected to Stripe's hosted onboarding form
> 6. On return, GET `/api/vendor/stripe/status` checks and updates: `stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_onboarding_complete`
>
> Accounts are created **automatically** when the vendor initiates onboarding. No admin action needed.

**Q1.3:** Are vendor payouts automated or manual?
- If automated, what triggers a payout?
- If manual, what's the admin workflow?

> **CC A1.3:** **Automated.** When a vendor marks an order item as fulfilled (POST `/api/vendor/orders/[id]/fulfill`), the code calls `transferToVendor()` which creates a Stripe Transfer from the platform account to the vendor's Connect account.
>
> **Important note:** The transfer happens when the **vendor** marks the item as fulfilled, NOT when the buyer confirms receipt. This means money moves to the vendor before buyer confirmation of pickup.
>
> Tracy's response: Is this the intended behavior? Should we instead trigger the transfer when the buyer confirms receipt ("Handed Off" -> "Fulfilled" transition)? Waiting for buyer confirmation is safer but slower for vendors.

---

## 2. PAYMENT FLOW - ONE-TIME PURCHASES

### Checkout Process
**Q2.1:** When buyer checks out, what happens in Stripe?
- Do we create a Payment Intent immediately?
- Do we create a Charge?
- Do we use Checkout Sessions?

> **CC A2.1:** We use **Stripe Checkout Sessions**. The flow in `apps/web/src/app/api/checkout/session/route.ts`:
> 1. Validates cart items and stock
> 2. Calculates fees using `calculateFees()` from `lib/stripe/payments.ts`
> 3. Creates order and order_items records in database (status: `pending`)
> 4. Creates a Stripe Checkout Session with line items
> 5. Returns the Checkout Session URL for redirect
>
> Stripe automatically creates the Payment Intent behind the scenes as part of the Checkout Session.

**Q2.2:** What is the exact payment flow step-by-step?

> **CC A2.2:** Here is the actual implemented flow:
> ```
> 1. Buyer clicks "Checkout"
> 2. POST /api/checkout/session - validates cart, calculates fees, creates order in DB (status: pending), creates Stripe Checkout Session
> 3. Buyer is redirected to Stripe's hosted checkout page
> 4. Buyer completes payment on Stripe's page
> 5. Stripe redirects buyer to /checkout/success?session_id=xxx
> 6. GET /api/checkout/success verifies the session with Stripe, updates order status to 'paid', creates payment record in DB
> 7. ALSO: Stripe sends checkout.session.completed webhook -> handleCheckoutComplete() also creates payment record (NOTE: potential duplicate - see Known Issues)
> 8. Money lands in PLATFORM Stripe account (not vendor)
> 9. Vendor sees order, confirms it, prepares it (status: confirmed -> ready)
> 10. Vendor marks item as fulfilled -> POST /api/vendor/orders/[id]/fulfill
> 11. fulfill route calls transferToVendor() -> creates Stripe Transfer to vendor's Connect account
> 12. Stripe sends transfer.created webhook -> updates vendor_payouts record to 'completed'
> 13. Buyer confirms receipt -> status becomes 'fulfilled' (but money already transferred at step 11)
> ```

**Q2.3:** Are payments captured immediately or on authorization + capture?

> **CC A2.3:** **Captured immediately.** The Checkout Session uses default `payment_intent_data` which captures on completion. There is no separate authorization/capture flow.

**Q2.4:** Where is payment held before vendor fulfillment?
- In platform Stripe account?
- In escrow?
- Direct to vendor Connect account?

> **CC A2.4:** **In the platform Stripe account.** Payment goes to the platform's main Stripe balance. It stays there until vendor fulfills, at which point a Transfer moves the vendor's share to their Connect account.

### Multi-Vendor Orders
**Q2.5:** When a buyer orders from 3 vendors in one checkout, what happens?
- One Stripe session with 3 line items?
- Three separate Stripe sessions?
- How do we split the payment?

> **CC A2.5:** **One Stripe Checkout Session** with all items as line items. The buyer pays once for the entire order.
>
> The split happens **at payout time**, not at checkout. Each order_item has its own `vendor_payout_cents` calculated at checkout. When each vendor fulfills their items, individual Stripe Transfers are created per vendor per item.
>
> So: 1 checkout session, 1 payment, then N separate transfers (one per order item fulfilled).

### Platform Fee Collection
**Q2.6:** How is the 6.5% platform fee collected?
- Application fee on Connect charge?
- Separate charge to buyer?
- Taken from vendor payout?

> **CC A2.6:** **Both added to buyer price AND deducted from vendor payout.** The platform collects two fees:
> 1. **Buyer fee (6.5%):** Added on top of the vendor's base price. Buyer pays `base_price * 1.065`.
> 2. **Vendor fee (6.5%):** Deducted from the vendor's share at payout time. Vendor receives `base_price * 0.935`.
>
> These are NOT Stripe `application_fee` fields - they are calculated in our code and the platform simply keeps the difference between what was charged and what is transferred.

**Q2.7:** The 6.5% is added to buyer price, right? (Not taken from vendor amount)
- Example: Vendor sets $10 -> Buyer pays $10.65 -> Vendor gets $10, Platform gets $0.65?
- Or different math?

> **CC A2.7:** **Different math.** Both sides pay a fee:
> - Vendor sets base price: **$10.00** (1000 cents)
> - Buyer fee (6.5%): $0.65 -> **Buyer pays $10.65**
> - Vendor fee (6.5%): $0.65 -> **Vendor receives $9.35**
> - **Platform keeps: $1.30** (buyer fee + vendor fee = 13% of base price)
>
> This is defined in `lib/stripe/config.ts`:
> ```
> PLATFORM_FEE_PERCENT: 13.0  (total)
> BUYER_FEE_PERCENT: 6.5
> VENDOR_FEE_PERCENT: 6.5
> ```
>
> And calculated in `lib/stripe/payments.ts` -> `calculateFees(basePriceCents)`.

---

## 3. PAYOUTS TO VENDORS

### Payout Timing
**Q3.1:** When exactly does vendor get paid?
- Immediately after buyer confirms pickup?
- On a schedule (daily, weekly)?
- Manual admin trigger?

> **CC A3.1:** **Immediately when vendor marks the item as fulfilled** (vendor clicks "fulfill" button). The Transfer is created in real-time during the fulfill API call.
>
> This is BEFORE buyer confirms receipt. The current flow is:
> - Vendor fulfills -> Transfer created -> money moves to vendor Connect account
> - Buyer confirms receipt later -> just updates status, no financial action
>
> Tracy's response: Should the payout trigger be moved to buyer confirmation instead? Pros: protects against vendor marking fulfilled without actually handing off. Cons: delays vendor payment.

**Q3.2:** What triggers the payout?
- API call when buyer clicks "Confirm Pickup"?
- Cron job that checks fulfilled orders?
- Admin approval required?

> **CC A3.2:** Direct API call in POST `/api/vendor/orders/[id]/fulfill/route.ts`. When the vendor marks an item fulfilled, the route handler calls `transferToVendor()` synchronously. No cron, no admin approval.

**Q3.3:** Which API endpoint handles payouts?
- File path?
- Does it create Stripe Transfer or Payout?

> **CC A3.3:**
> - **File:** `apps/web/src/app/api/vendor/orders/[id]/fulfill/route.ts`
> - **Stripe action:** Creates a **Transfer** (not a Payout). `stripe.transfers.create()` with `destination` set to the vendor's Connect account ID.
> - **Library function:** `transferToVendor()` in `apps/web/src/lib/stripe/payments.ts`
>
> Note: Stripe Transfer moves money from platform balance to vendor Connect balance. Stripe then handles the actual bank payout to the vendor's bank account according to the vendor's own payout schedule (set in their Stripe Express dashboard).

### Payout Records
**Q3.4:** Do we store payout records in our database?
- Table name?
- What columns?
- Do we reconcile with Stripe?

> **CC A3.4:** Yes.
> - **Table:** `vendor_payouts`
> - **Key columns:** `id`, `order_item_id`, `vendor_profile_id`, `amount_cents`, `stripe_transfer_id`, `status` (pending|processing|completed|failed|cancelled), `transferred_at`
> - **Reconciliation:** The `transfer.created` webhook updates the payout status to `completed` and the `transfer.reversed` webhook updates it to `failed`. This provides basic reconciliation.
>
> Migration: `supabase/migrations/20260109_204341_001_orders_and_payments.sql`

**Q3.5:** Can vendors see their payout history?
- URL/component?
- Do we show pending vs completed?

> **CC A3.5:** There is no dedicated vendor payout history page currently. Vendors can see order statuses on their dashboard, but there is no specific UI showing a list of payouts with amounts, dates, and statuses. This would be a good feature to add.
>
> Tracy's response: Should we prioritize building a vendor payout history page? It would show each transfer with amount, status, and date.

---

## 4. MARKET BOX SUBSCRIPTIONS

### Stripe Product Type
**Q4.1:** Are Market Boxes set up as Stripe Subscriptions?
- If yes, do we create Subscription objects?
- If no, how are they billed?

> **CC A4.1:** **No, Market Boxes are NOT using Stripe Subscriptions.** The database schema is built (`market_box_offerings`, `market_box_subscriptions`, `market_box_pickups` tables in migration `20260116_006_market_box_foundation.sql`), but there is NO Stripe Subscription integration.
>
> Current Market Box model: A 4-week offering with a single `price_cents` (total for all 4 weeks). The schema has `order_id` on the subscription, suggesting it's treated as a one-time purchase through the normal checkout flow, not a recurring Stripe subscription.
>
> Tracy's response: How should Market Box billing work? Options:
> 1. **One-time payment** for the full 4-week period (simplest - use existing checkout flow)
> 2. **Stripe Subscription** with weekly/biweekly/monthly recurring billing (more complex but auto-renews)
> 3. **Recurring one-time charges** where each week is a separate order (middle ground)

**Q4.2:** Which billing intervals are supported?
- Weekly, Biweekly, Monthly (from context)
- Do these map to Stripe's standard intervals?
- Or custom billing logic?

> **CC A4.2:** The buyer subscriptions page references weekly, biweekly, and monthly options in the UI. However, the database schema (`market_box_offerings`) only stores a single `price_cents` for a 4-week period. There is no `interval` or `billing_frequency` column.
>
> **No Stripe billing intervals are configured.** This is entirely future work. Stripe supports `week` and `month` intervals natively but not `biweekly` - that would need custom logic (e.g., a `week` interval with `interval_count: 2`).

### Subscription Flow
**Q4.3:** When buyer subscribes to a Market Box, what happens?

> **CC A4.3:** **This flow is NOT yet implemented in Stripe.** The database tables exist and the vendor can create Market Box offerings, but the buyer purchase/subscription flow through Stripe has not been built.
>
> What exists today:
> - Vendor creates offering via POST `/api/vendor/market-boxes`
> - DB schema tracks subscriptions, pickups, statuses
> - Buyer subscriptions page shows active subscriptions from DB
>
> What does NOT exist:
> - No Stripe checkout for Market Boxes
> - No Stripe Subscription objects
> - No recurring billing
> - No automated pickup creation per billing cycle

**Q4.4:** Are subscription payments handled differently than one-time?

> **CC A4.4:** Not yet implemented. When built, the same 6.5% + 6.5% fee structure would likely apply. Tracy should confirm.
>
> Tracy's response: Should Market Box subscriptions use the same 13% total fee, or a different rate?

**Q4.5:** Can buyers cancel subscriptions?

> **CC A4.5:** The DB has `cancelled_at` on `market_box_subscriptions` and a `status` of `cancelled`, but there is no cancel API endpoint and no Stripe cancellation logic. This is future work.

### Subscription Deliveries
**Q4.6:** How do subscriptions translate to pickup events?

> **CC A4.6:** The `market_box_pickups` table tracks individual weeks:
> - `week_number` (1-4), `scheduled_date`
> - `status`: scheduled | ready | picked_up | missed | rescheduled
> - Tracks `ready_at`, `picked_up_at`, `missed_at`, `rescheduled_to`
>
> Each week is a separate pickup record, but creation of these records is not yet automated.

**Q4.7:** If buyer misses a pickup, what happens?

> **CC A4.7:** The schema supports a `missed` status on `market_box_pickups`, but no business logic is implemented for what happens financially.
>
> Tracy's response: What should happen when a buyer misses a pickup? Options:
> 1. Still charged, no credit (vendor prepared the box)
> 2. Credit applied to next week
> 3. Vendor decides per case

---

## 5. REFUNDS & CANCELLATIONS

### Buyer Cancellations
**Q5.1:** Can buyers cancel orders before pickup?
- Where? (URL/component)
- Before which status? (Before confirmed? Before ready?)

> **CC A5.1:** Yes. API endpoint: POST `/api/buyer/orders/[id]/cancel`
>
> Cancellation rules by status:
> - **pending/paid:** Can cancel. Full refund.
> - **confirmed/ready:** Can cancel. 5% platform fee minimum retained, vendor can add up to 45% more.
> - **fulfilled/completed:** Cannot cancel.
>
> The cancel endpoint marks the order_item as `cancelled` with `cancelled_by`, `cancellation_reason`, and `refund_amount_cents`. If all items in an order are cancelled, the parent order status is set to `cancelled`.

**Q5.2:** When buyer cancels, what happens in Stripe?
- Full refund?
- Partial refund (platform keeps fee)?
- Who initiates the Stripe refund?

> **CC A5.2:** **The actual Stripe refund call is NOT implemented yet.** The cancellation endpoint has a TODO comment: "In production, trigger Stripe refund here."
>
> The `createRefund()` function exists in `lib/stripe/payments.ts` and is ready to use, but it is not wired into the cancellation flow. The function calls `stripe.refunds.create()` with the payment intent ID and optional partial amount.
>
> This is a **blocker for production** - cancellations will update the database but won't actually refund money.

**Q5.3:** If vendor already confirmed ready, can buyer still cancel?
- Different refund policy?
- Platform decision or vendor decision?

> **CC A5.3:** Yes, buyer can still cancel after confirmation/ready. The refund amount is reduced: 5% platform fee is kept, and vendor can add a cancellation fee up to 45%. So the buyer gets back 50-95% depending on vendor's cancellation fee setting.
>
> Tracy's response: Are these cancellation fee percentages (5% platform minimum, up to 45% vendor fee) correct? Should they be adjustable per vertical?

### Vendor-Initiated Actions
**Q5.4:** Can vendors cancel/refund orders?
- Where? (URL/component)
- What's the Stripe flow?

> **CC A5.4:** There is no vendor-initiated cancellation endpoint currently. Vendors can mark orders as fulfilled but cannot cancel them through the UI.
>
> Tracy's response: Should vendors be able to cancel orders (e.g., item out of stock after confirmation)? If so, should the buyer get a full refund?

### Handling Disputes
**Q5.5:** If there's a dispute (wrong item, quality issue), who handles it?

> **CC A5.5:** **No dispute handling is implemented.** There are no Stripe dispute webhooks (`charge.dispute.created`, etc.) being listened for. No in-app dispute resolution flow exists.
>
> Tracy's response: How should disputes be handled? Options:
> 1. Platform admin mediates all disputes
> 2. Buyer contacts vendor directly, admin escalation if needed
> 3. Automatic refund under certain conditions

---

## 6. STRIPE CUSTOMERS

### Customer Creation
**Q6.1:** Do we create Stripe Customer objects?

> **CC A6.1:** **No.** The checkout flow does not create Stripe Customer objects. Each checkout is a guest-style payment through the Checkout Session.

**Q6.2:** Do we store Stripe customer_id in our database?

> **CC A6.2:** **No.** There is no `stripe_customer_id` column in any user-facing table. The `vendor_profiles` table has `stripe_account_id` (for Connect), but buyers have no Stripe customer ID stored.

**Q6.3:** Do we save payment methods for repeat purchases?

> **CC A6.3:** **No.** Each purchase requires re-entering payment details. Saving payment methods would require creating Stripe Customer objects first.
>
> Tracy's response: Should we add saved payment methods for repeat buyers? This improves checkout speed but adds complexity. Could be a Phase 2 item.

---

## 7. WEBHOOKS

### Current Implementation
**Q7.1:** Are Stripe webhooks implemented?

> **CC A7.1:** Yes.
> - **Endpoint:** POST `/api/webhooks/stripe` (file: `apps/web/src/app/api/webhooks/stripe/route.ts`)
> - **Handler logic:** `apps/web/src/lib/stripe/webhooks.ts`
>
> **Events handled:**
> 1. `checkout.session.completed` - Updates order to 'paid', creates payment record
> 2. `payment_intent.succeeded` - Updates payment status
> 3. `payment_intent.payment_failed` - Updates payment status to failed
> 4. `account.updated` - Updates vendor Connect account status (charges_enabled, payouts_enabled, onboarding_complete)
> 5. `transfer.created` - Updates vendor_payouts to 'completed'
> 6. `transfer.reversed` - Updates vendor_payouts to 'failed'

**Q7.2:** Critical events we need:

> **CC A7.2:** Currently handled: `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`, `transfer.created`, `transfer.reversed`, `checkout.session.completed`.
>
> **NOT handled but needed for future:**
> - `customer.subscription.updated` - When Market Box subscriptions are built
> - `customer.subscription.deleted` - Subscription cancellations
> - `charge.dispute.created` - When disputes are implemented
> - `charge.refund.updated` - When refund flow is wired up

**Q7.3:** How do we verify webhook signatures?

> **CC A7.3:** Using `stripe.webhooks.constructEvent(body, signature, webhookSecret)` in the webhook route. The secret is stored in the `STRIPE_WEBHOOK_SECRET` environment variable.

---

## 8. TEST MODE vs PRODUCTION

### Current State
**Q8.1:** Is the app currently using Stripe test mode?

> **CC A8.1:** The app uses whatever keys are in the environment variables. Currently in development, there may be test keys or no keys at all (the dev mode bypass handles the no-keys case).
>
> Tracy's response: Have you set up any Stripe API keys in `.env.local` or Vercel yet? If so, are they test mode or live mode keys?

**Q8.2:** From recent summary: "Vendor fulfill now works without Stripe in development mode"

> **CC A8.2:** Yes. In `apps/web/src/app/api/vendor/orders/[id]/fulfill/route.ts`, when the vendor's `stripe_account_id` is missing (no Stripe account set up), the code skips the Stripe Transfer and instead creates a placeholder payout record with `status: 'skipped_dev'`.
>
> What gets skipped: Only the Stripe Transfer call. The order status updates and database records are still created normally.

**Q8.3:** What needs to change to go from test -> production?

> **CC A8.3:** Checklist:
> 1. Swap test API keys for live keys in environment variables
> 2. Update webhook endpoint URL in Stripe Dashboard to production domain
> 3. Update webhook secret env var to match production webhook
> 4. Vendors will need to re-onboard with Express (test Connect accounts don't carry over to live mode)
> 5. Wire up the actual Stripe refund call in the cancellation endpoint (currently TODO)
> 6. Test the full checkout -> fulfill -> transfer flow with real cards
>
> Tracy's response: Are you planning to use Stripe test mode first for staging/QA, then switch to live? Or go straight to live?

---

## 9. FEES & PRICING

### Stripe Fees
**Q9.1:** Who pays Stripe's processing fees (2.9% + 30 cents)?

> **CC A9.1:** **The platform absorbs Stripe's processing fees** from its revenue. The code does not add Stripe processing fees to the buyer's total or deduct them from the vendor's payout. The platform's 13% take covers Stripe's ~3% fee.
>
> Tracy's response: Is this the intended approach? The platform nets ~10% after Stripe fees. Confirm this is acceptable.

**Q9.2:** Example calculation:

> **CC A9.2:** Exact math for a $10.00 vendor-priced item:
>
> ```
> Vendor base price:           $10.00  (1000 cents)
> Buyer fee (6.5%):           + $0.65  (65 cents)
> BUYER PAYS:                  $10.65  (1065 cents)
>
> Stripe processing (2.9%+30c): -$0.61  (30.885 + 30 = 60.885, rounds to 61 cents)
> Platform receives after Stripe: $10.04
>
> Vendor payout (base - 6.5%): -$9.35  (935 cents) transferred to vendor
>
> PLATFORM NET:                 $0.69  ($10.04 - $9.35)
> VENDOR RECEIVES:              $9.35
> STRIPE TAKES:                 $0.61
> BUYER PAID:                  $10.65
> ```
>
> Platform effective rate: ~6.9% of base price (after Stripe fees eat into the 13% gross).

### Multi-Vendor Split
**Q9.3:** With 3 vendors in one order:

> **CC A9.3:**
> ```
> Vendor A base: $10.00 -> buyer line: $10.65
> Vendor B base: $15.00 -> buyer line: $15.98 (15.975 rounded)
> Vendor C base: $20.00 -> buyer line: $21.30
> TOTAL BUYER PAYS: $47.93
>
> Stripe processes ONE payment of $47.93
> Stripe fee: $47.93 * 2.9% + $0.30 = $1.39 + $0.30 = $1.69
> Platform receives: $47.93 - $1.69 = $46.24
>
> Transfer to Vendor A: $10.00 * 0.935 = $9.35
> Transfer to Vendor B: $15.00 * 0.935 = $14.03 (14.025 rounded)
> Transfer to Vendor C: $20.00 * 0.935 = $18.70
> Total transfers: $42.08
>
> PLATFORM NET: $46.24 - $42.08 = $4.16 (9.2% of $45.00 base)
> ```
>
> Key point: Only ONE Stripe processing fee because it's one checkout session. Transfers to vendor Connect accounts are free (no additional Stripe fee). This is favorable for multi-vendor orders.

---

## 10. BUYER TIERS (PREMIUM)

### Premium Membership
**Q10.1:** Do buyer tiers affect payment flow?

> **CC A10.1:** **Not currently.** The database has buyer tier fields and the buyer subscriptions page exists, but there is no code that adjusts fees based on buyer tier. The 6.5% buyer fee is hardcoded in `lib/stripe/config.ts`.
>
> Tracy's response: Should premium buyers get a reduced platform fee? E.g., 3% instead of 6.5%?

**Q10.2:** If premium buyer membership is paid:

> **CC A10.2:** **Not implemented.** The DB schema has `stripe_subscription_id` fields on user profiles (from the tier system), but no Stripe Subscription is created for buyer premium memberships. This is entirely future work.
>
> Tracy's response: How should premium buyer memberships be billed? Monthly subscription? Annual? One-time? What price?

---

## 11. VENDOR TIERS (PREMIUM)

### Premium Vendor Membership
**Q11.1:** Do vendor tiers affect payment flow?

> **CC A11.1:** **Not currently for fees.** Vendor tiers affect feature access (e.g., `standard` vendors limited to 2 Market Box subscribers, `premium` gets unlimited), but the 6.5% vendor fee is the same regardless of tier.
>
> No Stripe Subscription exists for vendor premium memberships. Same situation as buyer tiers - DB fields exist but no Stripe integration.
>
> Tracy's response: Should premium vendors get a reduced platform fee? Should vendor premium memberships have a monthly fee via Stripe?

---

## 12. ADMIN ACTIONS

### Manual Overrides
**Q12.1:** Can admins manually trigger payouts?

> **CC A12.1:** **No.** There is no admin UI or API endpoint for manually triggering payouts. Payouts are automated via the vendor fulfill action only.

**Q12.2:** Can admins issue refunds on behalf of vendors?

> **CC A12.2:** **No.** There is no admin refund UI. The `createRefund()` function exists in `lib/stripe/payments.ts` but is not exposed through any admin endpoint.

**Q12.3:** Can admins see all Stripe transactions?

> **CC A12.3:** **Partially.** The CSV Reports system includes "Vendor Payouts" and "Revenue & Platform Fees" reports that pull from the `vendor_payouts` and `payments` database tables. However, there is no real-time admin dashboard showing live Stripe transactions. Admins would need to use the Stripe Dashboard directly for that.

---

## 13. CURRENT BLOCKERS

### Implementation Gaps
**Q13.1:** What Stripe features are NOT yet implemented?

> **CC A13.1:** Comprehensive list of gaps:
>
> **Critical (blocking production payments):**
> 1. **Refund execution** - `createRefund()` exists but is NOT called from the cancellation endpoint (has a TODO comment)
> 2. **Stripe Customer objects** - Not created; buyers can't save payment methods
>
> **Important (needed before full launch):**
> 3. **Market Box Stripe billing** - Schema exists, no Stripe integration
> 4. **Buyer premium membership billing** - No Stripe Subscription
> 5. **Vendor premium membership billing** - No Stripe Subscription
> 6. **Vendor-initiated cancellation/refund** - No endpoint
> 7. **Admin manual refund** - No endpoint
> 8. **Admin manual payout trigger** - No endpoint
> 9. **Dispute handling** - No webhooks, no UI
> 10. **Vendor payout history page** - No UI
>
> **Nice to have:**
> 11. Saved payment methods for repeat buyers
> 12. Stripe Tax integration
> 13. Stripe Radar fraud rules
> 14. Receipt/invoice generation

**Q13.2:** What works in test mode but might break in production?

> **CC A13.2:** Known risks:
> 1. **Duplicate payment records** - Both the success page redirect AND the webhook create payment records. In production with real latency, both could fire and create duplicates. Need idempotency check.
> 2. **Payout before buyer confirmation** - Vendor gets paid on fulfill, not buyer confirmation. A dishonest vendor could mark fulfilled without handing off.
> 3. **No refund execution** - Cancellations update DB but don't refund via Stripe.
> 4. **Dev mode bypass** - The `skipped_dev` payout logic should be removed or gated more carefully for production.

**Q13.3:** Are there any Stripe-related errors in logs?

> **CC A13.3:** No production logs to check (app is in development). No known Stripe errors in current codebase.

---

## 14. CONFIGURATION NEEDED

### Stripe Dashboard Setup
**Q14.1:** What does Tracy need to configure in her Stripe account?

> **CC A14.1:** Tracy's Stripe Dashboard checklist:
>
> **Required:**
> 1. **Enable Stripe Connect** - Go to Settings -> Connect -> Enable Express accounts
> 2. **Set Connect branding** - Upload platform logo, set brand color, set business name to "Farmers Marketing" (or platform name)
> 3. **Configure webhook endpoint** - Add endpoint URL: `https://farmersmarketing.app/api/webhooks/stripe`
>    - Events to subscribe to: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`, `transfer.created`, `transfer.reversed`
> 4. **Copy API keys** - Get Publishable Key and Secret Key (test mode first, then live)
> 5. **Copy Webhook Signing Secret** - After creating the webhook endpoint
>
> **Recommended:**
> 6. **Set payout schedule for platform** - Settings -> Payouts (e.g., daily automatic)
> 7. **Enable Stripe Radar** (basic fraud protection is on by default)
> 8. **Set business details** - Complete account verification for the platform business
>
> **NOT needed (code handles these):**
> - No need to create Products/Prices in Stripe Dashboard (checkout uses dynamic line items)
> - No need to configure tax settings (not implemented yet)
> - No need to set up Stripe Invoicing

**Q14.2:** Are there any specific Stripe settings required?

> **CC A14.2:**
> - **Connect account types:** Must allow Express accounts
> - **Connect capabilities:** `card_payments` and `transfers` must be available
> - **Payout schedule:** Platform payout schedule is separate from vendor payout schedules. Set platform to daily or as preferred.
> - **No special Radar rules needed** at this time
>
> Tracy's response: Does your existing Stripe account already have Connect enabled? If it was used for a different project, you may want to consider whether to reuse it or create a fresh account for farmersmarketing.app.

---

## 15. ENVIRONMENT VARIABLES

### Required Keys
**Q15.1:** Which Stripe keys are required?

> **CC A15.1:** Three keys required:
> ```
> STRIPE_SECRET_KEY=sk_test_... (or sk_live_... for production)
> NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... (or pk_live_...)
> STRIPE_WEBHOOK_SECRET=whsec_...
> ```
>
> **NOT needed:** `STRIPE_CONNECT_CLIENT_ID` - The code uses Express account creation via the API (not OAuth), so no Connect client ID is required.

**Q15.2:** Where are these stored?

> **CC A15.2:**
> - **Local development:** `.env.local`
> - **Production (Vercel):** Vercel Environment Variables (Settings -> Environment Variables)
> - Both locations should have matching keys (test keys for local, live keys for production)
>
> The `NEXT_PUBLIC_` prefix on the publishable key makes it available to client-side code (needed for Stripe.js). The other two must be server-only.

---

## CC SUMMARY: IMPLEMENTATION STATUS

| Feature | Status | Notes |
|---------|--------|-------|
| Stripe Connect (Express) | **Done** | Vendor onboarding, status checks |
| Checkout Sessions | **Done** | Single session per order, all items |
| Fee Calculation | **Done** | 6.5% buyer + 6.5% vendor = 13% |
| Vendor Transfers | **Done** | On vendor fulfill action |
| Webhook Handling | **Done** | 6 events handled |
| Order Cancellation (DB) | **Done** | Status updates, fee calculation |
| Order Cancellation (Stripe) | **NOT DONE** | Refund call is TODO |
| Market Box Billing | **NOT DONE** | Schema only, no Stripe |
| Buyer Premium Billing | **NOT DONE** | Schema only, no Stripe |
| Vendor Premium Billing | **NOT DONE** | Schema only, no Stripe |
| Stripe Customers | **NOT DONE** | No customer objects created |
| Saved Payment Methods | **NOT DONE** | Requires Stripe Customers first |
| Admin Refund UI | **NOT DONE** | No admin Stripe actions |
| Dispute Handling | **NOT DONE** | No webhooks or UI |
| Vendor Payout History | **NOT DONE** | No dedicated page |

## KNOWN ISSUES TO FIX

1. **Duplicate payment records** - Both success redirect and webhook create records. Add idempotency check using `stripe_payment_intent_id` as unique key.
2. **Refund not wired up** - `createRefund()` exists but cancellation endpoint doesn't call it.
3. **Payout timing risk** - Money transfers to vendor on fulfill, before buyer confirms receipt.

---

## NEXT STEPS

After CC answers:
1. I'll review and create a Stripe setup guide for Tracy
2. Tracy configures her Stripe account
3. We test end-to-end payment flows
4. We move to production when ready

---

**CC: All questions answered. Items marked "Tracy's response:" need Tracy's business decisions before we can finalize the implementation. The most critical decisions are:**
1. **Payout timing** - On vendor fulfill (current) vs. on buyer confirmation?
2. **Market Box billing model** - One-time vs. recurring Stripe subscription?
3. **Who absorbs Stripe fees** - Platform (current) vs. passed through?
4. **Premium tier pricing** - Monthly fees for buyer/vendor premium?
5. **Cancellation fee percentages** - 5% platform + up to 45% vendor correct?
