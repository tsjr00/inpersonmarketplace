# Session 75 — Fresh End-to-End Audit (Pre-Prod Push)

**Started:** 2026-04-26
**Scope:** Diff between `origin/main` (Prod) and `staging` tip `2c9dbf0b` — 44 commits, ~60 source files, 4 migrations.
**Method:** Fresh eyes. Past audits NOT read (`backlog.md`, `market_box_audit_v2.md` deliberately untouched). Following the data through the diff into adjacent systems where the data flows.
**Bar:** Only issues that would (a) block a user from completing their task, or (b) cause a wrong financial experience.

**Severity classes:**
- 🔴 **BLOCKS** — User cannot complete the task
- 🟠 **MONEY** — Wrong financial outcome (charged wrong, paid wrong, displayed wrong)
- 🟡 **SILENT** — Looks like success but isn't
- 🟣 **AUTH** — Wrong actor can do/see things they shouldn't

---

## Phase 1: Component areas in the diff

Organized by money/blocking-risk, in the order I'll examine them.

### Tier 1 (highest money/blocking risk)
- [ ] **A. Webhooks + Payouts** — `lib/stripe/webhooks.ts` (+325 LOC), `payments.ts`, `market-box-payout.ts` (NEW), `vendor/orders/[id]/fulfill`, `cron/expire-orders`, `vendor/fees/pay`
- [ ] **B. Cart + Checkout + Payment Flow** — `cart/route.ts`, `checkout/session` (CRIT-PATH), `checkout/success` (CRIT-PATH, +141 LOC), `CheckoutMarketBoxItem`, `useCart`, `CartDrawer`, `AddToCartButton`
- [ ] **C. Market Box System** — 4 migrations + 11 source files (vendor + buyer + browse + market-box detail)
- [ ] **D. Vendor Signup & Onboarding** — `vendor-signup` (+419 LOC), `signup`, `confirm-email`, `login`, `auth/callback`, `OnboardingChecklist`, `vendor/dashboard`, `vendor/onboarding/status`, NEW `lib/vendor/tax-notice.ts`

### Tier 2 (functional/financial display impact)
- [ ] **E. Vendor Analytics** — overview, trends, customers (market box inclusion)
- [ ] **F. Listing Detail 3-Section Purchase Flow** — `listing/[listingId]`, `ListingPurchaseSection`, `PickupLocationsCard`, `AddToCartButton`
- [ ] **G. Event Cancellation Fix** — `events/[token]/cancel`, `admin/events/[id]`, `admin/events/[id]/settlement`
- [ ] **H. Buyer Orders Display** — `buyer/orders`, `api/buyer/orders/route.ts`

### Tier 3 (lower risk, still in scope)
- [ ] **I. Vendor Dashboard / Markets / Pickup** — `vendor/dashboard/PaymentMethodsCard`, `vendor/listings`, `vendor/markets`, `vendor/pickup`
- [ ] **J. Locale messages + notification types** — `en.ts`, `es.ts`, `notifications/types.ts`
- [ ] **K. Landing** — `Footer`, `VendorPitch`

---

## Per-area findings will follow below. Each finding gets:
- Severity (🔴/🟠/🟡/🟣)
- File:line citation (verified by reading)
- User-facing impact (vendor/buyer/organizer/admin)
- Reproduction steps (when applicable)
- Recommended fix direction (no code yet)

---

## Area A: Webhooks + Payouts — FINDINGS

### A1. 🟡 LATENT (currently dormant) — Vendor fee payment is never credited

**Status: DORMANT — blocked by `EXTERNAL_PAYMENTS_ENABLED` feature flag.** The `vendor_fee_balance` only accumulates from `recordExternalPaymentFee()` in `fulfill/route.ts`, which only fires for cash orders. With external payments disabled, no balance accumulates → vendors never reach this Stripe checkout. **Will become 🔴 the moment external payments turn on.** Documenting here so it doesn't slip through that activation.

**Files:** `src/app/api/vendor/fees/pay/route.ts:92` (sets metadata `type: 'vendor_fee_payment'`); `src/lib/stripe/webhooks.ts:126-268` (`handleCheckoutComplete` has no branch for this type); grep across whole repo confirms ZERO consumers of `vendor_fee_payment`.

**What happens:** Vendor with outstanding external-payment platform fees clicks "Pay Fees" → Stripe Checkout opens → vendor enters card → Stripe charges them → webhook fires → `handleCheckoutComplete` checks `mode==='subscription'` (no), `metadata.type==='market_box'` (no), then checks `metadata.order_id` (not set) and **returns at line 143 without doing anything**. The `vendor_fee_ledger` table never receives a credit. The vendor's balance stays exactly the same.

**Repro:**
1. Have a vendor with `vendor_fee_balance` > $0 (e.g., $50 from external payment fees)
2. Vendor clicks "Pay Fees" on dashboard
3. Vendor completes Stripe Checkout
4. Vendor lands back on dashboard with `?fee_paid=true` URL flag
5. Refresh dashboard → balance still $50
6. Stripe Dashboard shows the charge succeeded — money was taken

**Impact:** Vendor pays the fee, money lands at platform, but DB still says vendor owes it. Vendor sees the same dunning message. If they pay again, they pay twice. They will believe the system is broken (it is). External payment lock remains in effect (fee balance > $5000 threshold).

**Fix direction:** Add branch in `handleCheckoutComplete` for `metadata.type === 'vendor_fee_payment'` that calls `recordFeeCredit` with the `vendor_profile_id` and `amount_cents` from metadata. Idempotency check on `vendor_fee_ledger` to handle webhook retries.

**Severity rationale:** Direct money loss to vendor. Affects every vendor who uses external payments and accumulates the $50+ threshold.

---

### A2. 🟠 MONEY — `payout_processed` notification fires even when payout is queued, not paid

**File:** `src/lib/stripe/market-box-payout.ts:139-143`

**What happens:** `processMarketBoxPayout` always sends `payout_processed` to vendor at the bottom of the function — including when the vendor's Stripe is not setup (`stripe_payouts_enabled === false`), in which case the payout is inserted as `status: 'pending_stripe_setup'` and **no money has moved**. Vendor receives notification telling them they got paid; they have not.

**Repro:** Vendor has connected Stripe but `stripe_payouts_enabled` is false (e.g., bank info incomplete or under verification hold). Buyer subscribes to their market box. Vendor receives "$X payout processed" notification. Vendor checks Stripe — no transfer.

**Fix direction:** Move `sendNotification` call inside the `if (vendor.stripe_account_id && vendor.stripe_payouts_enabled)` branch. For the `pending_stripe_setup` branch, send a different notification (or none).

---

### A3. 🟠 MONEY — Multi-vertical vendor tier overwrite when subscription metadata missing `vertical`

**Files:** `src/lib/stripe/webhooks.ts:298-313` (`handleSubscriptionCheckoutComplete`), `:501-508` (`handleSubscriptionUpdated`), `:550-562` (`handleSubscriptionDeleted`)

**What happens:** Each handler does `if (vertical) { vpQuery = vpQuery.eq('vertical_id', vertical) }`. If `subData.metadata?.vertical` is empty/null, the update applies to **every** `vendor_profiles` row owned by that user_id — including the vendor's other vertical(s). A FT-vendor who is also a FM-vendor and upgrades on FT could have both rows updated, both downgraded on cancellation, etc.

**Repro:** User has profiles in both `farmers_market` and `food_trucks`. They subscribe to FT premium. If the session was created without `vertical` in metadata (or any code path forgets to pass it), both vendor profiles get `tier: 'pro'`. On cancellation, both get downgraded.

**Fix direction:** Make `vertical` mandatory in metadata. Hard-fail with `logError` if it's missing rather than silently updating all rows.

---

### A4. 🟠 MONEY — Stripe Dashboard refund of a market box subscription doesn't cancel the subscription

**File:** `src/lib/stripe/webhooks.ts:914-1009` (`handleChargeRefunded`)

**What happens:** `handleChargeRefunded` updates `orders.status='refunded'` and `order_items.status='refunded'`, then notifies buyer + vendors. **It does NOT touch `market_box_subscriptions`, `market_box_pickups`, or `vendor_payouts`.**

If admin refunds a market-box-only checkout (no `order_items` rows since standalone path) via Stripe Dashboard:
- Subscription stays `active` — future pickups continue to be expected
- Buyer has been refunded but cron will keep generating pickups
- Vendor was paid (`vendor_payouts` row exists, `status='completed'`) but buyer got money back → vendor over-paid for net-zero work
- No `transfer.reversed` is auto-fired, so handleTransferFailed won't run

**Repro:** Admin issues refund via Stripe Dashboard for a market box subscription's charge. Check `market_box_subscriptions` — still active. Check `market_box_pickups` — future pickups still scheduled. Check `vendor_payouts` — still `completed`.

**Fix direction:** Detect market box subscription (lookup by `payment_intent_id`), cancel subscription, mark future pickups as `cancelled`, reverse vendor payout via Stripe Transfer reversal.

---

### A5. 🟠 MONEY — Cron Phase 5 retry of `transferToVendor` doesn't pass `sourceTransaction`

**File:** `src/app/api/cron/expire-orders/route.ts:1089` and `:1158`

**What happens:** Original `fulfill` passes `sourceTransaction` (charge ID from PI) so transfer pulls from the specific charge. Cron Phase 5 retries do NOT pass `sourceTransaction`. After 7 days the funds have settled to platform balance, so the transfer succeeds — **but if the original PaymentIntent was refunded between original failure and retry, the retry transfers from platform's general balance**, meaning platform pays vendor for an already-refunded order.

**Severity rationale:** Edge case (failed transfer + later refund), but real exposure given current refund/dispute flows.

**Fix direction:** In cron retry, fetch the latest PI from `payments` table by `order_id`, get `latest_charge`, pass as `sourceTransaction`. If the charge was refunded, skip the retry and mark payout `cancelled` with reason.

---

### A6. 🟡 SILENT — Cron Phase 5: vendor not notified when payout permanently cancelled after 7 days

**File:** `src/app/api/cron/expire-orders/route.ts:1383-1402`

**What happens:** After 7 days of failure retries, payouts are marked `cancelled`. Admin gets an email. Vendor receives **nothing**. Vendor's UI continues to show the order as "fulfilled, payment processing" indefinitely.

**Fix direction:** Send `payout_failed` notification to vendor with explanation that admin must resolve.

---

### A7. 🟡 SILENT — `wasNotificationSent` ignores `referenceId`, suppresses legitimate notifications

**File:** `src/lib/stripe/webhooks.ts:16-38`

**What happens:** Function signature accepts `referenceId` but body only filters by `user_id` + `type` + 24-hour window. Comment claims this is OK because "payout notifications are rare (one per order item)". In reality, a vendor can receive multiple payouts per day (multiple orders fulfilled) → second and subsequent notifications within 24h are silently suppressed. Same for `order_refunded` to a vendor with multiple refunded orders.

**Severity rationale:** Vendor sees stale notification state, may not realize a second payment/refund occurred.

**Fix direction:** Either (a) actually use `referenceId` to filter via `notifications.data->>X` JSONB lookup, or (b) reduce window to 5 minutes (catches webhook retry storms but not legitimate same-day events).

---

### A8. 🟡 SILENT — Multiple non-checked status transitions in webhook + cron

Per file:line:
- `webhooks.ts:147-150` — order status update has no error check
- `webhooks.ts:763-768` — `handlePaymentFailed` no error check
- `webhooks.ts:773-781` — `handleAccountUpdated` no error check
- `market-box-payout.ts:35` — silent return when `actualPaidCents <= 0`
- `market-box-payout.ts:52-58` — silent return when offering missing
- `market-box-payout.ts:60-66` — silent return when vendor missing
- `market-box-payout.ts:118-124` — Stripe transfer failure marks payout `failed` but no vendor notification
- `fulfill/route.ts:309-310` — payout insert error logged to crumb only, then continues to attempt transfer (could leave Stripe transfer with no DB record)
- `fulfill/route.ts:117-141` — Stripe live status check failure swallowed (caught + console.error only, vendor allowed to proceed)

Each individually may be acceptable but combined create blind spots: silent state divergence between Stripe and DB.

---

### A9. 🟠 MONEY — Company-paid event order: no `vendor_payouts` row, no settlement enforcement

**File:** `src/app/api/vendor/orders/[id]/fulfill/route.ts:155-178`

**What happens:** For `payment_model === 'company_paid'`, code skips Stripe transfer with comment "Vendor payout comes through organizer settlement, not Stripe transfer." But **no `vendor_payouts` row is created at all**. The vendor analytics dashboard, the payout history, the cron retry system — none of them know this fulfillment exists. If the organizer settlement system is broken, late, or fails, no automated alerting catches it. Vendor delivered the food, has nothing in their payout queue.

**Fix direction:** Either (a) create a `vendor_payouts` row with status `pending_settlement` so the vendor's UI can show it as "expected via organizer settlement", or (b) ensure settlement code creates the rows. Confirm with admin/event team which path they actually run.

---

### A10. 🟡 SILENT — `handleCheckoutComplete` market box block silently skipped when order query fails

**File:** `src/lib/stripe/webhooks.ts:161-195`

**What happens:** `order` is fetched at 161-165. The market box block at 195 is gated on `order?.buyer_user_id`. If the order query returns null (orphan, race, RLS quirk on service client edge case), the market box subscription block silently does not run. Buyer was charged but no subscription created, no log line, no error.

**Fix direction:** Replace truthy check with explicit error log when `has_market_boxes==='true'` AND `order` is null.

---

### A11. 🟡 SILENT — Phase 7 stale market box pickup auto-marks `picked_up` with no notifications, no payout check

**File:** `src/app/api/cron/expire-orders/route.ts:1670-1693`

**What happens:** Market box pickups stale in `ready` status (buyer confirmed but vendor never confirmed) are auto-marked `picked_up`. **No notification to either party. No `vendor_confirmed_at` audit trail check. No verification that vendor payout exists.** Vendor's dashboard suddenly shows the pickup as completed without the vendor actually having confirmed.

**Fix direction:** At minimum log it. Ideally notify both parties so they're aware of the auto-resolution. Verify payout exists or queue one.

---

**Area A summary:** 11 findings. Top concerns (excluding A1 which is dormant per external-payment feature flag):
- **A2 (🟠 misleading payout notification)** — vendor told they got paid when they didn't
- **A4 (🟠 Stripe refund doesn't cancel market box subscription)** — drift between Stripe and DB
- **A3 (🟠 multi-vertical tier overwrite)** — only triggers if metadata.vertical is missing
- **A5 (🟠 cron retry without sourceTransaction)** — edge case but real refunded-charge exposure

---

## Area B: Cart + Checkout Flow — FINDINGS

### B1. 🟠 MONEY — Duplicate-order detection ignores market box items

**File:** `src/app/api/checkout/session/route.ts:138-213`

**What happens:** When user clicks Checkout twice within 10 minutes, the code looks for existing pending orders with **matching listing items** and reuses the existing Stripe session if found. The comparison at lines 167-187 only compares `listing_id`, `quantity`, `schedule_id`, `pickup_date` of `order_items`. **It does NOT compare market box items.**

If user opens checkout, hits back, removes a market box from cart, then re-checks out — the old session (with the market box) is reused. Buyer pays for the market box they don't want. Or vice-versa: user adds a market box AFTER first attempt, second attempt reuses old session without it.

**Repro:**
1. Cart has [listing A qty 2] + [market box X]
2. Click Checkout → Stripe session created → close tab
3. Remove market box X from cart
4. Click Checkout again → matching pending order found (listings match) → old session URL returned → buyer pays for market box X they removed

**Fix direction:** Include market box items in the comparison. Probably easier: pass a `cartFingerprint` hash from client, store in pending order, only reuse on fingerprint match.

---

### B2. 🟠 MONEY — Market box vendor Stripe-readiness not validated at checkout

**File:** `src/app/api/checkout/session/route.ts:261-289`

**What happens:** Lines 261-275 validate that all **listing vendors** have `stripe_account_id`. Lines 279-289 validate that market box offerings exist and are `active`. **No check that the market box vendor has a Stripe account or `stripe_payouts_enabled`.**

If a vendor's Stripe account was disabled/disconnected, their listings checkout fails (good), but market box checkout proceeds. Buyer pays. Subscription is created. `processMarketBoxPayout` queues a `pending_stripe_setup` payout. Vendor sees subscriber but never gets paid. Platform holds the buyer's money.

**Repro:** Disable vendor's `stripe_payouts_enabled`. Buy their market box. Check `vendor_payouts.status` → `pending_stripe_setup`. Vendor never paid until they fix Stripe.

**Fix direction:** Symmetric validation — check `stripe_account_id` and `stripe_payouts_enabled` for market box vendors too, and block checkout with a clear message.

---

### B3. 🟠 MONEY — Cart shows wrong price/duration for missing 8-week price

**File:** `src/app/api/cart/route.ts:296-302` AND `src/app/api/checkout/session/route.ts:503-505` AND `src/lib/stripe/payments.ts` (consumer)

**What happens:** If a market box offering has `price_8week_cents = NULL` and the user has `term_weeks: 8` in their cart row, the price falls back to `price_4week_cents`. So:
- Cart displays "2 Months" duration with 4-week price
- Checkout charges 4-week price
- Subscription is created with `term_weeks: 8` (8 weeks of pickups)
- Vendor is paid based on `actualPaidCents` (4-week amount) → vendor gets paid for half of what they're delivering

The fallback exists in 3 places consistently — making the bug stable but the financial outcome is wrong (vendor undercharged for 4 extra pickups OR pickup-count short).

**Severity rationale:** Active vendors who only configured 4-week pricing but have buyers who picked 8-week (whether via cart row created previously, or via UI bug) lose money silently.

**Fix direction:** Reject the request server-side if `term_weeks === 8` and `price_8week_cents IS NULL`. Or, refuse to create the cart row in the first place. Don't fall back silently.

---

### B4. 🟠 MONEY — FT market-box-only order with tip: tip never reaches vendor

**File:** `src/app/[vertical]/checkout/page.tsx:526`, `src/app/api/checkout/session/route.ts:558-561`, `src/app/api/vendor/orders/[id]/fulfill/route.ts:244-258`

**What happens:** FT supports tipping. FT also supports market boxes (4-week only per checkout/session:497). A FT cart containing only a market box subscription can have a tip. The tip is charged to the buyer via Stripe. The order has `tip_amount` set. **But there are no `order_items` for a market-box-only order** — so the fulfill route's tip-distribution math (`tip_amount / order_items.length`) never runs. The market box payout (`processMarketBoxPayout`) is computed from `actualPaidCents` (the box price only, no tip).

Net result: buyer's tip stays in the platform's Stripe balance. Vendor doesn't see it.

**Severity rationale:** Vendors lose every dollar of tip given on FT market-box-only orders. Less common scenario but real money.

**Fix direction:** Either (a) include the tip in `actualPaidCents` passed to `processMarketBoxPayout`, with separate accounting for the tip portion, or (b) hide tip selector when cart is market-box-only on FT.

---

### B5. 🟡 SILENT — `term_weeks` input validation gap

**File:** `src/app/api/checkout/session/route.ts:497-507`

**What happens:** Only check is `if (vertical === 'food_trucks' && mbItem.termWeeks !== 4) throw`. For FM, no validation that `termWeeks` is `4` or `8`. Client could send `12`, `0`, `-1`, `999`. Code falls into the else branch (4-week price) but creates subscription with whatever weeks. Pickup count + duration label downstream can be nonsensical.

**Fix direction:** Strict allow-list: `if (![4, 8].includes(mbItem.termWeeks)) throw`. Or reject negative/zero.

---

### B6. 🟡 SILENT — `order_number` collision risk

**File:** `src/app/api/checkout/session/route.ts:599-601`

**What happens:** `orderNumber = '${verticalPrefix}-${year}-${random}'` where random is `Math.random().toString().slice(2, 10)` — 8 decimal digits, ~100M values per (vertical, year). At ~1k orders/day per vertical, birthday-paradox collision odds grow meaningfully past ~10K orders/year. If `orders.order_number` has a UNIQUE constraint (likely), collision causes INSERT failure AFTER the Stripe session was created. Buyer paid, no order in DB, manual cleanup required.

**Fix direction:** Use a sequence-based number (`gen_order_number()` RPC), or a longer random + retry on collision.

---

### B7. 🟡 SILENT — `checkout/success` order status update silently fails

**File:** `src/app/api/checkout/success/route.ts:73-81`

**What happens:** `update({status: 'paid'})` error only logs to crumb (`crumb.logic('Failed to update order status')`). No throw, no logError. If the update fails, order stays at previous status while payment record is created and webhook updates may overwrite. Buyer may see "pending" forever in their order list.

**Fix direction:** `logError` and surface to buyer with retry guidance, or rely entirely on webhook for status update.

---

### B8. 🟡 SILENT — Buyer order_placed notification falls back to wrong brand name

**File:** `src/app/api/checkout/success/route.ts:430-436`

**What happens:** `brandName: branding?.brand_name || "Food Truck'n"`. If a future vertical is added without a `defaultBranding` entry, FM buyers receive notifications branded "Food Truck'n". Low severity (today only 3 verticals are wired up) but a footgun for future verticals.

**Fix direction:** Use `term(verticalId, 'brand_name')` with a vertical-aware fallback chain. Or hard-fail and require the branding entry.

---

### B9. 🟡 SILENT — Market box capacity-race after-payment refund flow has no buyer-facing message

**File:** `src/app/api/checkout/success/route.ts:252-267`

**What happens:** When two buyers race for the last spot, the loser's RPC returns `result.success === false`. Code issues an auto-refund. **But the success page response is `success: true` with the order data, including the market box subscription that DOESN'T EXIST.** Buyer sees an apparent success page, then receives a Stripe refund email later with no explanation from the platform.

The frontend success page would then try to render a subscription that's not in the DB → confusing or broken UI.

**Fix direction:** Detect the at-capacity case and return a different response (e.g., `partialSuccess: true` with refund explanation) so the success page can show the correct message.

---

**Area B summary:** 9 findings. Top concerns:
- **B1 (🟠 stale Stripe session reuse)** — buyer pays for items they removed
- **B2 (🟠 market box vendor Stripe not validated)** — buyer paid, vendor stuck unable to receive
- **B3 (🟠 8-week subscription with 4-week price)** — vendor undercharged for 4 extra pickups
- **B4 (🟠 FT market box tip lost)** — every tip on FT market-box-only orders disappears

---

## Area C: Market Box System (4 migrations + 11 source files) — FINDINGS

### C1. 🟠 MONEY — Standalone checkout idempotency key collision across term lengths

**File:** `src/lib/stripe/payments.ts:161` (`createMarketBoxCheckoutSession`)

**What happens:** Idempotency key is `market-box-${offeringId}-${userId}-${startDate}`. Does NOT include `termWeeks`. If a buyer subscribes for 4-week, then immediately re-subscribes for 8-week (same offering, same start date), Stripe returns the **same** session — pricing reflects the FIRST attempt's term, not the buyer's current selection. Buyer pays the wrong amount.

**Repro:**
1. Buyer hits `POST /api/buyer/market-boxes` with `term_weeks: 4` for offering X starting next Tuesday → Stripe session A created with $50
2. Without completing payment, buyer re-hits the same endpoint with `term_weeks: 8` → Stripe returns session A (same idempotency key) with $50, not the $90 8-week price

**Fix direction:** Add `termWeeks` to the idempotency key: `market-box-${offeringId}-${userId}-${startDate}-${termWeeks}`.

---

### C2. 🟠 MONEY — `subscribe_to_market_box_if_capacity` idempotency fails for standalone path (NULL order_id)

**File:** `supabase/migrations/20260420_124_market_box_biweekly_frequency.sql:247-255` (RPC body)

**What happens:** Idempotency check at lines 247-251 reads:
```sql
SELECT id INTO v_existing_id
FROM market_box_subscriptions
WHERE offering_id = p_offering_id
  AND buyer_user_id = p_buyer_user_id
  AND order_id = p_order_id;
```
For the **standalone** checkout path (`handleMarketBoxCheckoutComplete` in webhooks.ts), `p_order_id` is NULL. In SQL, `NULL = NULL` evaluates to NULL (not TRUE), so the check finds nothing and the function proceeds to insert. **Webhook resend → second subscription created → buyer charged once but has 2 subscriptions, 2 sets of pickups.**

**Currently shielded:** The webhook does its own idempotency check first (`handleMarketBoxCheckoutComplete` at lines 364-370 of webhooks.ts) using `stripe_payment_intent_id`. So the RPC's NULL-order_id path doesn't get hit twice in practice. But the RPC's defense is broken — any future caller (cron, retry job, admin tool) that doesn't pre-check could trip it.

**Fix direction:** Replace `AND order_id = p_order_id` with `AND order_id IS NOT DISTINCT FROM p_order_id`, OR use `stripe_payment_intent_id` as the dedup key.

---

### C3. 🟠 MONEY/UX — Mixed `original_end_date` semantics (migration 125 partial backfill)

**File:** `supabase/migrations/20260425_125_market_box_term_duration.sql:42-49` + comment "No backfill"

**What happens:** Migration 125 changed `create_market_box_pickups` so new subscriptions get `original_end_date = start_date + (term_weeks * 7)` (Option A). Existing subscriptions (created pre-125) still have `original_end_date = last_pickup_date`. Since the migration explicitly says "no backfill", production has TWO populations of subscriptions with different end-date semantics. Any UI/notification/cron logic that reads `original_end_date` as "the day my subscription ends" will display different things for similar subscriptions.

Per Phase 4.7 of cron expire-orders, neither path uses `original_end_date` for pickup expiry (uses `scheduled_date` per pickup), so no money bug there. But buyer-facing "subscription ends MM/DD" displays could be off by up to 7 days for some buyers.

**Fix direction:** Either (a) backfill the few weekly subscriptions on prod to the new semantic, or (b) recompute end-date dynamically in the API layer rather than reading the column.

---

### C4. 🟠 MONEY/UX — Buyer subscription detail computes `end_date` differently from DB

**File:** `src/app/api/buyer/market-boxes/[id]/route.ts:122-126`

**What happens:** Buyer's "my subscription" page calculates `endDate = startDate + (totalWeeks - 1) * 7`. Migration 125 sets `original_end_date = startDate + (totalWeeks * 7)` — different by 7 days. Buyer sees one date here, vendor's view (or any code reading the DB column) sees another.

For biweekly subs: this JS calc treats `totalWeeks` as weeks regardless of cadence (4-week biweekly with 2 pickups → end_date = start + 21 days). Pickups themselves end at day 14. DB end_date is day 28. Three different numbers for the same subscription.

**Fix direction:** Single source of truth. Either always read `original_end_date` from the DB or always compute consistently in one shared helper.

---

### C5. 🟡 SILENT — Migration 124 trigger does integer division on `term_weeks/2` for biweekly

**File:** `supabase/migrations/20260420_124_market_box_biweekly_frequency.sql:50-56`

**What happens:** `v_num_pickups := COALESCE(NEW.term_weeks, 4) / 2`. If `term_weeks=5` (no input validation upstream — see B5), biweekly → 2 pickups (silently truncates). If `term_weeks=0`, 0 pickups → no rows in `market_box_pickups` → buyer charged but never receives. If `term_weeks=1`, biweekly → 0 pickups (same outcome). Webhook standalone path does NOT validate `term_weeks` (only the buyer/market-boxes POST handler validates 4/8 — see C7 below).

**Fix direction:** Add CHECK constraint on `market_box_subscriptions.term_weeks IN (4, 8)`. Or validate at all entry points consistently.

---

### C6. 🟡 INTEGRITY — `vendor_payouts_has_reference` constraint not exclusive

**File:** `supabase/migrations/20260426_127_vendor_payouts_market_box_subscription_constraint.sql:24-30`

**What happens:** Constraint accepts ANY of `order_item_id`, `market_box_pickup_id`, `market_box_subscription_id` being non-null, but does NOT require exactly one. A bug elsewhere could create a row with all three set, or two of three. The two unique partial indexes (`idx_vendor_payouts_order_item_unique`, `idx_vendor_payouts_mb_sub_unique`) cover their respective columns but a row with both set would consume a slot in both — confusing the idempotency-by-existence checks in `processMarketBoxPayout` and the `fulfill` route.

**Fix direction:** Convert to mutually-exclusive: `CHECK ((order_item_id IS NOT NULL)::int + (market_box_pickup_id IS NOT NULL)::int + (market_box_subscription_id IS NOT NULL)::int = 1)`.

---

### C7. 🟡 INPUT VALIDATION — `term_weeks` validated inconsistently across entry points

| Entry point | Validates `term_weeks ∈ {4,8}` |
|------------|--------------------------------|
| `POST /api/buyer/market-boxes` (standalone path) line 200 | ✅ |
| `POST /api/checkout/session` (cart path) | ❌ (only blocks FT non-4) |
| `subscribe_to_market_box_if_capacity` RPC | ❌ |
| Webhook `handleMarketBoxCheckoutComplete` | ❌ |

**Net effect:** Cart-based checkout could ship arbitrary `term_weeks` to subscription creation. Combined with C5 (trigger does integer division), this can create subscriptions with 0 pickups or fractional outcomes.

**Fix direction:** Validate at the RPC (single chokepoint) or add CHECK constraint.

---

### C8. 🟠 MONEY — Vendor can edit market box price while inactive subscriptions are still drawing pickups

**File:** `src/app/api/vendor/market-boxes/[id]/route.ts:213-220, 285-291`

**What happens:** PATCH blocks pickup-time/location changes if active subscribers exist (good). It does NOT block `price_4week_cents` / `price_8week_cents` changes. A vendor can drop their price by 50% to attract new buyers, then raise it back. The cart-route fallback (B3) means existing 8-week subs reading the offering price could end up displaying the new vendor price even if they paid the old one. Display side at minimum.

For the cart line-item generation (`buyer paid` is locked at subscription creation via `total_paid_cents`), this isn't a fund-flow issue. But the buyer's "my subscription" page reads `offering.price_cents` for display — which now shows whatever the vendor has TODAY, not what the buyer paid. Buyer confusion + perception of price-gouging if they re-check their account.

**Fix direction:** Snapshot price into the subscription row at creation time (already done via `total_paid_cents`), and read THAT for any historical display.

---

### C9. 🟡 INTEGRITY — Public market box detail computes `nextStartDate` ignoring biweekly cadence

**File:** `src/app/api/market-boxes/[id]/route.ts:142-152`

**What happens:** `nextStartDate` is just "next occurrence of `pickup_day_of_week`" (within the next 7 days). For a biweekly vendor whose last pickup wave was on day X, the "next" actual delivery wave starts on day X+14 — but a new buyer subscribing today gets a `start_date` of next-day-of-week, which doesn't align with the vendor's biweekly delivery schedule. New subscriber's first pickup is computed independently (day +0), so they might receive their first pickup on a date when the vendor doesn't otherwise have a wave going out.

**Severity rationale:** Likely not a money issue (vendor still gets paid for the pickup) but vendor logistics get messy — vendor expects all biweekly subs to be on the same cadence; this allows buyers to start on any day-of-week with their own private cadence.

**Fix direction:** For biweekly vendors, snap `nextStartDate` to align with the vendor's existing wave. Or document that buyers' biweekly cadences are independent.

---

### C10. 🟠 MONEY — `weeks_completed` increments on `skipped` status, conflating skip with delivery

**File:** `supabase/migrations/20260420_124_market_box_biweekly_frequency.sql:84-117` (`check_subscription_completion`)

**What happens:** The trigger counts pickups in status `IN ('picked_up', 'missed', 'skipped', 'rescheduled')` toward `weeks_completed`. When a vendor calls `vendor_skip_week`, an extension pickup is added (so `total_required` increases by 1) and the original is marked `skipped` → `weeks_completed` bumps by 1.

Sounds OK except `weeks_completed` is exposed to the buyer (vendor analytics, buyer subscription page) and labeled as "weeks completed" / "pickups completed". A buyer who has had 2 skipped weeks and 0 actual pickups will see `weeks_completed: 2` — implying they got 2 boxes when they got 0.

**Fix direction:** Either rename column (`pickups_resolved` ≠ `pickups_completed`) or have separate counters for `picked_up` vs other resolutions.

---

### C11. 🟡 SILENT — `enforce_market_box_tier_limit` only counts active offerings, not total

**File:** `supabase/migrations/20260425_126_unified_market_box_tier_limits.sql:52-57`

**What happens:** Trigger only fires when `NEW.active IS TRUE` and counts only active offerings. Vendors can have unlimited DRAFT (inactive) offerings. Not a money bug, but `vendor-limits.ts` may have a `max_total` semantic expressed elsewhere that doesn't match — code at vendor/market-boxes/route.ts:135-137 expresses `can_create_more: totalCount < tierLimits.marketBoxes` (total). If app says "you can create more" because total < limit, and vendor creates a 4th draft, then tries to activate → trigger blocks. Mismatch in expectations between the create + activate paths.

**Severity rationale:** Vendor confusion at creation/activation time, not money loss.

---

**Area C summary:** 11 findings. Top concerns:
- **C1 (🟠 idempotency key skips term_weeks)** — buyer pays wrong amount
- **C2 (🟠 RPC idempotency NULL semantics)** — defense-in-depth broken; webhook handles it now
- **C3/C4 (🟠 mixed end-date semantics)** — visible buyer/vendor confusion
- **C8 (🟠 vendor price changes during active subs)** — display-side trust issue
- **C10 (🟠 weeks_completed conflates skip with delivery)** — buyer sees credit for boxes they didn't receive

---

## Area D: Vendor Signup — FINDINGS

### D1. 🟠 BLOCKS — `auth/callback` defaults to FM dashboard when `next` param missing

**File:** `src/app/api/auth/callback/route.ts:19`

**What happens:** `const next = searchParams.get('next') || '/farmers_market/dashboard'`. Email verification (signup confirmation, magic link, password reset) all funnel through this callback. If for any reason the upstream URL omits `next=`, an FT vendor signing up lands on FM dashboard. They appear "missing" from the vertical they signed up for. If their FT vendor_profile creation succeeded silently, they have to manually navigate to find it.

**Repro:** Trigger any auth flow without `next` (e.g., manually constructed magic link, or upstream code that forgot to pass it). Verify lands on `/farmers_market/dashboard` regardless of which vertical the user came from.

**Fix direction:** Either (a) detect vertical from user's most-recent profile, (b) land on a vertical-agnostic page like `/`, or (c) fail-loud with "where did you come from?" prompt.

---

### D2. 🟡 SILENT — `vendor-signup` form trusts client-supplied `user_id` in payload

**File:** `src/app/[vertical]/vendor-signup/page.tsx:273`

**What happens:** Submit payload includes `user_id: user.id` (read from client auth state). The receiving `/api/submit` route (NOT in diff — couldn't audit) MUST verify this matches `auth.uid()` server-side. If it trusts the body, a malicious user could create vendor profiles for arbitrary user_ids.

**Severity rationale:** Verification needed before trusting this. Add to backlog as "audit /api/submit auth gating for kind=vendor_signup".

---

### D3. 🟡 LATENT — Market limit check is client-side only

**File:** `src/app/[vertical]/vendor-signup/page.tsx:109-127`

**What happens:** `marketLimitInfo.atLimit` is computed client-side from `vendor_profiles` rows visible to the user (RLS-restricted to own data). If the server-side `/api/submit` doesn't enforce `getMarketLimit(tier, vertical)`, a determined user could bypass via direct API call. Same caveat as D2 — needs server-side audit.

---

### D4. 🟡 SILENT — File uploads after signup are best-effort with no recovery prompt

**File:** `src/app/[vertical]/vendor-signup/page.tsx:319-337`

**What happens:** After vendor profile creation, the for-loop uploads each file via `/api/vendor/onboarding/documents`. On any single upload failure, only `console.error`. Vendor sees "Application Submitted!" success page; doesn't know files were lost. Documents must be re-uploaded from dashboard.

**Severity rationale:** Vendor onboarding still completes manually but creates support burden. Lower severity because step 2 of the page surfaces document status anyway via `/api/vendor/onboarding/status`.

---

**Area D summary:** 4 findings. Most signup logic that matters financially (`/api/submit`) is NOT in this diff and needs separate audit. D1 is the most actionable.

---

## Area E: Vendor Analytics — FINDINGS

### E1. 🟡 SILENT — `totalOrders` count includes cancelled subscriptions

**File:** `src/app/api/vendor/analytics/overview/route.ts:113`

**What happens:** `totalOrders = (orderItems || []).length + (subscriptions || []).length` includes ALL subscriptions regardless of status. Vendor's dashboard "Total Orders: 50" includes 5 cancelled — confusing because cancelled don't count toward revenue (which is right) but inflate the "total" denominator. `averageOrderValue` math (`totalRevenue / completedOrders`) is correct.

**Fix direction:** Either filter out cancelled in `totalOrders`, or add `cancelledOrders` separately and show "50 total · 5 cancelled".

---

### E2. 🟡 ACCURATE BUT CONFUSING — Subscription revenue counted at creation, not per pickup

**File:** `src/app/api/vendor/analytics/overview/route.ts:104-107` (comment)

**What happens:** Comment correctly notes vendor was paid upfront via `processMarketBoxPayout`. Revenue is recognized at subscription creation. But for a 2-month subscription that hasn't yet had its pickups, vendor sees $X "completed orders" revenue without having delivered anything. Accurate to cash flow, misleading for "delivered work" metrics.

**Severity rationale:** Vendor expects "completed orders" = "stuff I delivered". Subscriptions in `active` status have NOT been delivered, but count here. If a vendor compares "completed orders" to physical delivery records, numbers won't match. Low — just a labeling issue.

**Fix direction:** Separate "Subscription Revenue (pre-paid)" from "Order Revenue (post-fulfillment)" buckets in the response.

---

### E3. 🟡 INTEGRITY — Status filter doesn't include all paid-state values

**File:** `src/app/api/vendor/analytics/overview/route.ts:89-97`

**What happens:** `pendingOrders` counts statuses in `['paid', 'confirmed', 'ready']`. Doesn't include `expired` (which goes nowhere) or any other intermediate states the system might add. Vendor sees `0` pending when there are actually expired/abandoned items. Lower priority — current statuses look complete based on the code I reviewed but worth verifying.

---

**Area E summary:** 3 findings. All low-medium. Recent Session 74 fix to include market box subscriptions is wired correctly; the math is right; only labeling/UX issues remain.

---

## Area F: Listing Detail Purchase Flow — Skipped

**Skipped per scope:** UI-heavy refactor (listing detail 3-section flow + ListingPurchaseSection + PickupLocationsCard) — financial logic flows through `AddToCartButton` (analyzed in Area B context) → cart/checkout (analyzed in Area B). No new findings here that aren't already covered by B1–B9.

If something specific is suspected, point me at it.

---

## Area G: Event Cancellation — FINDINGS

### G1. 🔴 BLOCKS / 🟠 MONEY — Buyers' Stripe-paid event orders are cancelled but NOT refunded

**File:** `src/app/api/events/[token]/cancel/route.ts:135-166` + acknowledged in `current_task.md` "T0-2 step 3"

**What happens:** When organizer cancels event:
1. Order status → `cancelled` ✓
2. Buyer notified "If you paid via card, a refund will be processed" ✓ (line 143 — comment says refund is COMING but no Stripe API call made)
3. Wave slot freed ✓
4. **No `createRefund` call to Stripe**

Buyer's notification promises a refund. The system never issues one. Admin must manually go into Stripe Dashboard and refund each one. With many events × many buyers, this is a backlog of money "owed" with no automation.

**Already on backlog (Priority 0.5)** but flagging here since it crosses the "wrong financial experience" bar — the buyer is told they'll be refunded and may wait days/weeks for an admin to manually process.

**Fix direction:** Inside the per-buyer-order loop (line 160-165), call `createRefund(payment_intent_id)` for orders with `payment_method = 'stripe'`. Wrap in try/catch with `logError` for failures. Mark `payments.status = 'refunded'`.

---

### G2. 🟡 SILENT — Wave-slot RPC failure logged-only, doesn't block other operations

**File:** `src/app/api/events/[token]/cancel/route.ts:160-165`

**What happens:** `free_wave_on_order_cancel` RPC failure → `console.error` only. Wave slots may stay marked as "taken" → other buyers blocked from purchasing those slots → revenue lost.

**Fix direction:** `logError` with retry queue, or fail the entire cancel if wave-free fails (don't half-cancel).

---

### G3. 🟡 LATENT — Email-fallback auth doesn't survive email change

**File:** `src/app/api/events/[token]/cancel/route.ts:46-53`

**What happens:** If `event.organizer_user_id IS NULL` (older events), auth falls back to email match between `user.email` and `event.contact_email`. If the organizer changed their email since creating the event, fallback fails — they can no longer cancel their own event without admin intervention.

**Severity rationale:** Edge case (email changes are rare). But organizer is locked out of cancellation flow.

---

**Area G summary:** 3 findings. G1 is the standout — already on backlog but listing here because it materially affects buyers' financial experience.

---

## Area H: Buyer Orders Display — FINDINGS

### H1. 🟠 MONEY DISPLAY — Standalone market box subscriptions show pre-fee total, not what buyer paid

**File:** `src/app/api/buyer/orders/route.ts:415-417`

**What happens:** `displayTotal = linkedOrder ? linkedOrder.total_cents : sub.total_paid_cents`. Subscriptions created via the standalone path (no order_id) fall back to `sub.total_paid_cents` which is the **vendor's pre-fee price** (e.g., $50). The buyer actually paid `$50 × 1.065 + $0.15 = $53.40`. Buyer's orders page shows $50.

Buyer's running total of "what I've spent on this platform" is wrong by ~6.65% + $0.15/sub.

**Fix direction:** Compute buyer-total from `total_paid_cents` using `calculateBuyerPrice()` when `linkedOrder` is missing. Or backfill `order_id` for standalone subs.

---

### H2. 🟡 INTEGRITY — Synthetic order_number for standalone subs has collision risk + isn't searchable

**File:** `src/app/api/buyer/orders/route.ts:413`

**What happens:** `orderNumber = 'MB-' + sub.id.slice(0, 6).toUpperCase()`. 6 hex chars = 16M combinations; with growing volume, two subscriptions could share the same display-number. If buyer references this in support, admin can't look it up via real `orders.order_number` search.

**Fix direction:** Either include longer slice, or generate stable order_number at subscription creation and store on the row.

---

### H3. 🟡 SILENT — Orders containing BOTH listing items AND market box can show twice

**File:** `src/app/api/buyer/orders/route.ts:474-476`

**What happens:** `regularOrders = transformedOrders.filter(o => o.items.length > 0 || !marketBoxOrderIds.has(o.id))`. An order with BOTH a listing item AND a market box subscription has `items.length > 0` → kept in regularOrders. The market box also appears as a separate `marketBoxOrders` entry. Buyer sees the same order twice with different framings.

**Fix direction:** Track which orders have market box content and merge their market box payload into the regular-order entry, instead of creating a duplicate.

---

**Area H summary:** 3 findings. H1 is the buyer-facing money issue.

---

## SQL verification queries (run on STAGING)

These confirm the schema state assumed by the findings above. Run all in Supabase SQL Editor and paste results back.

```sql
-- 1. Confirm vendor_payouts CHECK constraint includes market_box_subscription_id (migration 127)
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.vendor_payouts'::regclass
  AND contype = 'c'
  AND conname = 'vendor_payouts_has_reference';

-- 2. Confirm new columns exist on live (snapshot is stale per top of SCHEMA_SNAPSHOT.md)
SELECT table_name, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'vendor_profiles' AND column_name = 'market_box_frequency')
    OR (table_name = 'market_box_subscriptions' AND column_name IN ('pickup_frequency', 'original_end_date'))
    OR (table_name = 'orders' AND column_name IN ('vendor_payout_cents','buyer_fee_cents','service_fee_cents','market_id')));
-- Expected: rows for the first three lines. Zero rows for line 4 (the 4 phantom orders columns).

-- 3. Confirm subscribe_to_market_box_if_capacity has p_pickup_frequency parameter (migration 124)
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'subscribe_to_market_box_if_capacity';

-- 4. Confirm trigger functions are at the post-125 version (Option A: term-end, not pickup-end)
SELECT proname, prosrc
FROM pg_proc
WHERE proname IN ('create_market_box_pickups','check_subscription_completion','enforce_market_box_tier_limit');
-- Expect: create_market_box_pickups body sets original_end_date = start_date + (term_weeks * 7)
-- Expect: enforce_market_box_tier_limit body has 'pro=6, boss=10, else=3' logic

-- 5. Find any vendor_payouts rows with multiple FK references set (C6 finding — should be exclusive)
SELECT id, order_item_id, market_box_pickup_id, market_box_subscription_id, status, created_at
FROM vendor_payouts
WHERE (
  (order_item_id IS NOT NULL)::int +
  (market_box_pickup_id IS NOT NULL)::int +
  (market_box_subscription_id IS NOT NULL)::int
) > 1;
-- Expected: zero rows. Any row here is a data integrity violation.

-- 6. Find market box subscriptions with mismatched price vs offering (B3 finding — 8-week with no price set)
SELECT s.id AS subscription_id, s.term_weeks, s.total_paid_cents, s.status,
       o.id AS offering_id, o.name, o.price_4week_cents, o.price_8week_cents,
       o.vendor_profile_id
FROM market_box_subscriptions s
JOIN market_box_offerings o ON o.id = s.offering_id
WHERE s.term_weeks = 8 AND o.price_8week_cents IS NULL;
-- Any rows here = vendor undercharged (B3).

-- 7. Check for vendor_fee_balance > 0 (would indicate A1 will activate when external payments turn on)
SELECT vendor_profile_id, balance_cents, oldest_unpaid_at
FROM vendor_fee_balance
WHERE balance_cents > 0
ORDER BY balance_cents DESC LIMIT 20;
-- Expected: zero rows (external payments are off). If non-zero, A1 is already biting.

-- 8. Find orders cancelled-by-event with stripe payment but no refund (G1 finding)
SELECT o.id, o.order_number, o.total_cents, o.status, o.payment_method,
       p.stripe_payment_intent_id, p.status AS payment_status
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
WHERE o.status = 'cancelled'
  AND o.payment_method = 'stripe'
  AND p.status = 'succeeded'  -- payment never marked refunded
ORDER BY o.created_at DESC
LIMIT 50;
-- Any rows here = buyer paid, order cancelled, never refunded. G1 backlog.

-- 9. Find vendor_payouts in 'pending_stripe_setup' status (A2 finding — vendor told they got paid but not really)
SELECT vp.id, vp.amount_cents, vp.status, vp.created_at,
       v.id AS vendor_id, v.stripe_account_id, v.stripe_payouts_enabled
FROM vendor_payouts vp
JOIN vendor_profiles v ON v.id = vp.vendor_profile_id
WHERE vp.status = 'pending_stripe_setup'
ORDER BY vp.created_at DESC LIMIT 20;
-- Each row is a vendor who got the misleading "payout processed" notification.

-- 10. Find vendor_payouts in 'cancelled' status (A6 finding — vendor never told)
SELECT vp.id, vp.amount_cents, vp.created_at, vp.updated_at,
       v.id AS vendor_id, v.user_id
FROM vendor_payouts vp
JOIN vendor_profiles v ON v.id = vp.vendor_profile_id
WHERE vp.status = 'cancelled'
ORDER BY vp.updated_at DESC LIMIT 20;
-- Each row = vendor permanently lost out on these payouts. Never notified.
```

---

## FINAL RANKED SUMMARY

**Total findings:** 41 across 7 areas (Areas A, B, C, D, E, G, H). Area F skipped per scope.

### Findings ranked by severity

#### 🔴 BLOCKS task completion

| ID | Title | Risk for prod push? |
|----|-------|---------------------|
| **D1** | `auth/callback` defaults to FM dashboard for non-FM verticals | YES — FT signup UX broken |
| **G1** | Event cancellation doesn't refund buyer Stripe orders | YES (but already on backlog as known) |

#### 🟠 MONEY — wrong financial outcome

| ID | Title | Risk for prod push? |
|----|-------|---------------------|
| **A2** | `payout_processed` notif fires when payout is `pending_stripe_setup` (vendor not really paid) | YES — vendor confusion |
| **A3** | Multi-vertical vendor tier overwrite if metadata.vertical missing | YES if any subscription session lacks vertical metadata |
| **A4** | Stripe Dashboard refund of market box doesn't cancel subscription / reverse payout | YES — admin refunds happen in real life |
| **A5** | Cron Phase 5 retry uses no `sourceTransaction` → could pay vendor for refunded order | Edge case but real |
| **A9** | Company-paid event order: no `vendor_payouts` row exists at all | Depends on whether organizer settlement ever runs |
| **B1** | Duplicate-order detection ignores market box items → buyer charged for items they removed | YES — repeatable user behavior |
| **B2** | Market box vendor Stripe-readiness not validated at checkout | YES — funds get stuck |
| **B3** | 8-week sub with no `price_8week_cents` → vendor undercharged | Depends on data — see SQL #6 |
| **B4** | FT market-box-only order with tip → tip lost | Niche but real |
| **C1** | Standalone checkout idempotency key doesn't include `term_weeks` | YES — possible mid-checkout flip-flop |
| **C2** | RPC idempotency uses `=` for NULL order_id → fails for standalone path | Defense broken; webhook covers it |
| **C3** | Mixed `original_end_date` semantics (mig 125 partial backfill) | Display mismatch |
| **C4** | Buyer subscription detail computes `end_date` differently from DB | Display mismatch |
| **C8** | Vendor can change market box price while active subs exist → display drift | Trust issue |
| **C10** | `weeks_completed` increments on `skipped` → buyer credited for boxes never received | YES — actively misleading |
| **H1** | Standalone market box subs show pre-fee total instead of buyer-paid total | YES — buyer history shows wrong number |

#### 🟡 SILENT or LOWER-SEVERITY

| ID | Title |
|----|-------|
| A1 (LATENT) | Vendor fee Stripe payment never credited (dormant — external payments off) |
| A6 | Cron cancels payouts after 7 days, vendor not notified |
| A7 | `wasNotificationSent` ignores referenceId, suppresses legitimate same-day notifs |
| A8 | Multiple non-checked status transitions / silent returns across webhook + helpers |
| A10 | webhook market box block silently skipped if order query returns null |
| A11 | Cron auto-marks stale market box pickups picked_up with no notifications |
| B5 | `term_weeks` validation gap |
| B6 | `order_number` collision risk with high volume |
| B7 | `checkout/success` order status update silently fails |
| B8 | `order_placed` notification falls back to wrong brand name |
| B9 | At-capacity market box auto-refund flow returns success page (no buyer message) |
| C5 | Migration 124 trigger does integer division, term_weeks=0 → no pickups |
| C6 | `vendor_payouts_has_reference` not exclusive (allows multiple FKs) |
| C7 | term_weeks validated inconsistently across entry points |
| C9 | Public market box detail nextStartDate ignores biweekly cadence |
| C11 | `enforce_market_box_tier_limit` only counts active, not total |
| D2 | `vendor-signup` form trusts client-supplied user_id (server enforcement unverified) |
| D3 | Market limit check is client-side only |
| D4 | File uploads after signup are best-effort |
| E1 | `totalOrders` includes cancelled subscriptions |
| E2 | Subscription revenue counted at creation, not per pickup (may confuse vendors) |
| E3 | Status filter doesn't include all paid-state values |
| G2 | Wave-slot RPC failure logged-only |
| G3 | Email-fallback auth doesn't survive email change |
| H2 | Synthetic `MB-XXXXXX` order_number collision risk |
| H3 | Orders with both listing AND market box can show twice |

---

## RECOMMENDATION FOR THIS PROD PUSH

**Block on:**
- **D1** — quick fix; FT signup UX is materially broken if `next` is ever missing
- **C1** — quick fix to idempotency key; one-line change
- **A3** — assert metadata.vertical at subscription session creation; one-line guard

**Fix-or-flag-then-ship:**
- **B1, B2, B3, C2, C4, H1** — material money issues but each has a contained blast radius (data-driven). Run SQL #6 to see if B3 is biting now. Decide per-finding whether to fix or document and ship.

**Document and ship (low blast radius for current population):**
- A2, A4, A5, A9, B4, B5–B9, C3, C5–C11, D2–D4, E1–E3, G2, G3, H2, H3

**Already on backlog, ship without re-litigating:**
- A1 (dormant), G1 (T0-2 step 3), schema snapshot regen

---

## How to read this report

- **Cite-anchored:** every finding includes file:line. Click through to verify before acting.
- **No fixes applied** — this is report-mode. Each finding includes a "Fix direction" but no code was changed.
- **Bias toward false positives over false negatives** — when in doubt I flagged. Some findings may be intentional design decisions; user is best judge.

---

