# Business Rules Audit & Testing Protocol
**Created**: 2026-02-25 (Session 46)
**Purpose**: Persistent reference for building a business rules test suite that prevents recurring audit problems and protects against conflicting fixes across sessions.

---

## THE PROBLEM WE'RE SOLVING

### Observed Pattern (Sessions 43-46)
Multiple comprehensive audits keep rediscovering the same issues — even after they've been fixed. Root causes:

1. **Breadth vs depth tradeoff**: 6 parallel agents scanning "everything" resort to pattern matching (grep) rather than line-by-line verification. An agent sees a pattern that *looks* like an old finding and flags it without checking if that specific instance was already resolved.

2. **Stateless audits**: Each session starts fresh. No mechanism to say "this was fixed in Session 43, don't re-flag it." The audit re-walks ground already covered.

3. **Category vs instance confusion**: "311 `any` types" gets flagged every audit. But maybe 200 are intentional, 80 were fixed, and 31 are new. Scanning-speed audits can't distinguish.

4. **Conflicting fixes risk**: Session A fixes tip calculation one way. Session B doesn't realize it was fixed, "fixes" it differently, undoing Session A's work. Neither code nor documentation catches the conflict.

### The Solution: Business Rules Tests

Instead of relying on audits (stateless, subjective, prone to rediscovery), codify expected behavior into **tests** (stateful, objective, pass or fail):

- **Tests persist** — A test written after Session 43's fix doesn't need rediscovery.
- **Tests are specific** — Not "check if emails are vertical-branded" but "when vertical=food_trucks, email FROM domain must be foodtruckn.app."
- **Tests catch conflicts** — If Session A fixes something and Session B tries to change it, Session A's test fails immediately.
- **Tests become source of truth** — Green = working. Red = broken. No ambiguity.

### Workflow for Using These Tests

1. Identify a problem or build a feature
2. Write/update business rules tests that codify expected behavior
3. User validates the tests make business sense
4. Implement the fix/feature
5. Tests pass → commit
6. **Before any future commit**: Run business rules tests against proposed changes. If anything breaks, stop and evaluate.

---

## 8 AUDIT DOMAINS (Narrow + Deep)

Instead of "audit everything," the codebase is divided into 8 focused domains. Each is narrow enough for a single deep-dive that reads every relevant file line by line.

### Batch 1 (This Session — Revenue + User-Facing)

| # | Domain | Why First | Key Files |
|---|--------|-----------|-----------|
| 1 | **Money Path** | Errors = lost revenue, chargebacks | `pricing.ts`, checkout routes, webhooks, payout cron |
| 2 | **Order Lifecycle** | Core buyer-vendor interaction | Order API routes, cron phases, confirm routes |
| 3 | **Vertical Isolation** | Foundational architecture | `middleware.ts`, `vertical/`, `branding/`, `design-tokens.ts` |
| 4 | **Vendor Journey** | Vendor acquisition/retention | Vendor pages, onboarding, listing form, Stripe Connect |

### Batch 2 (Next Session — Operational + Infrastructure)

| # | Domain | Why | Key Files |
|---|--------|-----|-----------|
| 5 | **Subscription Lifecycle** | Recurring revenue path | Market box routes, subscription pages, cron phases |
| 6 | **Auth & Access Control** | Security foundation | All 140 API routes, middleware, RLS |
| 7 | **Notification Integrity** | User engagement | `notifications/service.ts`, `types.ts`, call sites |
| 8 | **Infrastructure Reliability** | Operational health | Crons, error system, CI pipeline, service worker |

---

## DOMAIN 1: MONEY PATH

### Named Workflows

**MP-W1: Stripe Checkout**
Cart → fee calculation → Stripe session → payment → order creation → inventory decrement → notification

**MP-W2: External Payment Checkout**
Cart → fee calculation → order creation → inventory decrement → vendor notification → external payment collection → vendor confirms

**MP-W3: Vendor Payout (Stripe Orders)**
Order fulfilled → payout record created → Stripe transfer initiated → webhook confirms → vendor notified

**MP-W4: Vendor Payout (Market Box Pickups)**
Pickup fulfilled → payout record created → Stripe transfer → webhook confirms

**MP-W5: Refund Flow**
Buyer cancels OR admin refunds → Stripe refund issued → inventory restored → vendor/buyer notified

**MP-W6: Fee Ledger (External Payments)**
External order fulfilled → vendor fee calculated → ledger entry created → balance tracked → future deduction

**MP-W7: Tip Flow (FT Only)**
Buyer selects tip % at checkout → tip applied to displayed subtotal (not base) → tip split: vendor gets tip on food cost, platform gets tip on platform fee portion → `tip_on_platform_fee_cents` stored on orders table → vendor tip included in payout transfer → platform tip portion retained

### Tip Business Rules (MP-W7)

| ID | Rule | What to Test |
|----|------|-------------|
| MP-R19 | Tips are FT-only. FM checkout has no tip UI | FT checkout shows tip selector; FM checkout does not |
| MP-R20 | Tip % applied to displayed subtotal (sum of per-item display prices), NOT base food cost | Tip 10% on 2×$9.59 displayed = $1.92, NOT 10% on 2×$9.00 base = $1.80 |
| MP-R21 | Tip capped at $50 (5000 cents). Values above silently capped, negative values floored to 0 | tipAmountCents=6000 → stored as 5000. tipAmountCents=-100 → stored as 0 |
| MP-R22 | Tip percentage is integer only (Math.round applied) | tipPercentage=15.7 → rounded to 16 |
| MP-R23 | Vendor tip = `min(totalTip, round(baseSubtotal × tipPercentage / 100))` — tip on food cost only | $18.00 base, 10% tip on $19.18 displayed = $1.92 total → vendor gets $1.80, platform gets $0.12 |
| MP-R24 | `tip_on_platform_fee_cents` = totalTip - vendorTip — retained in platform Stripe balance (not transferred to vendor) | Platform balance includes this amount; vendor transfer excludes it |
| MP-R25 | Vendor tip prorated evenly across all items: `round(vendorTipCents / totalItemsInOrder)` per item, added to payout | 3-item order with $1.80 vendor tip → 60 cents per item added to each vendor payout |
| MP-R26 | Stripe processing cost on tip absorbed by the tip itself — platform fee % NOT diluted by tip | Platform fee calculated on subtotal only; tip added as separate Stripe line item |
| MP-R27 | Cron Phase 4 (no-show) uses vendor tip (excluding platform fee portion) for payout, same as fulfill route | Phase 4 payout = vendor_payout_cents + round((tip_amount - tip_on_platform_fee_cents) / totalItems) |
| MP-R28 | All payout paths (fulfill, confirm-handoff, cron Phase 4) must calculate tip share identically | Same vendorTipCents formula across all 3 paths |

### Business Rules (Prioritized)

#### CRITICAL (Revenue Loss if Violated)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| MP-R1 | Buyer fee is exactly 6.5% of base subtotal + $0.15 flat fee (Stripe only) | MP-W1 | `calculateBuyerPrice(1000)` returns correct value; flat fee excluded for external |
| MP-R2 | Vendor fee is exactly 6.5% of base subtotal, prorated per item | MP-W1, MP-W3 | Payout amount = item price - (item price × 0.065) - prorated flat fee |
| MP-R3 | Tip percentage applied to displayed subtotal (sum of per-item display prices), NOT base subtotal | MP-W1 | Tip on $19.18 displayed subtotal (2 × $9.59) not $18.00 base |
| MP-R4 | Vendor receives tip on food cost only; platform fee portion tracked in `tip_on_platform_fee_cents` | MP-W1 | vendor_tip = tip_amount - tip_on_platform_fee_cents |
| MP-R5 | Small order fee ($0.50) applies when displayed subtotal (base+6.5%) < $5.00 (configurable per vertical) | MP-W1, MP-W2 | Fee applied before tip calculation; threshold compared against displayed price |
| MP-R6 | Double payout prevention: unique index on `vendor_payouts(order_item_id)` WHERE status NOT IN ('failed','cancelled') | MP-W3 | Cannot insert two non-failed payouts for same order_item |
| MP-R7 | Stripe idempotency keys are deterministic: `checkout-{orderId}`, `transfer-{orderId}-{orderItemId}`, `refund-{paymentIntentId}-{amount}` | MP-W1, MP-W3, MP-W5 | Never use Date.now() or random values in idempotency keys |
| MP-R8 | Inventory decremented atomically via `atomic_decrement_inventory()` RPC at checkout time, restored on cancellation/expiration per order_item | MP-W1, MP-W2, MP-W5 | quantity never goes negative; restored items match decremented count for specific item |

#### HIGH (Financial Accuracy)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| MP-R9 | Per-item rounding: `calculateItemDisplayPrice(900)` = round(900×1.065) = 959 per item. Display subtotal = sum of per-item prices (not bulk calculation) | MP-W1 | 2 items at $9.00 each: display subtotal = $19.18 (not $19.17) |
| MP-R10 | External payment orders charge 3.5% vendor fee (not 6.5%) because no Stripe processing cost | MP-W2, MP-W6 | Ledger entry = subtotal × 0.035 |
| MP-R11 | External payment buyer fee is 6.5% but NO $0.15 flat fee | MP-W2 | Buyer total = subtotal × 1.065 + small_order_fee (if applicable) |
| MP-R12 | Flat fee ($0.15) prorated across items in order: `Math.round(15 / totalItemsInOrder)` per item | MP-W3 | 3-item order: items get 5, 5, 5 cents (not 15 each) |
| MP-R13 | No minimum order rejection. Orders below vertical threshold get a small order fee added as a line item with notice "order more to avoid fee". Thresholds (displayed price): FT=$5, FM=$10, FW=$40. Fee amounts: FT=$0.50, FM=$1.00, FW=$4.00 | MP-W1, MP-W2 | FT order $4.50 displayed → $0.50 fee line item + notice. FM order $12.00 → no fee |
| MP-R14 | Market box RPC failure after payment triggers auto-refund via `createRefund()` with idempotency key `refund-{paymentIntentId}-{amount}`. Handles both DB errors and at-capacity. Runs in both webhook and success route (whichever first). If refund also fails, error logged at critical severity (admin email alert). Buyer never charged for a subscription that wasn't created | MP-W1 | RPC fails → buyer refunded. RPC returns at_capacity → buyer refunded. Refund fails → critical error logged |

#### MEDIUM (Operational Correctness)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| MP-R15 | Pending Stripe orders expire after 10 minutes (cron Phase 2) | MP-W1 | Order with stripe_checkout_session_id older than 10min → cancelled, inventory restored |
| MP-R16 | External payment vendor fee eligibility: vendor must have Stripe connected AND fee balance < $50 AND oldest unpaid fee < 40 days | MP-W2 | Ineligible vendors can't accept external payments |
| MP-R17 | Payout retry window: failed payouts retried for 7 days (cron Phase 5), then permanently cancelled. Vendor notified AND vertical+platform admins notified as urgent matter | MP-W3 | Day 8: payout status → cancelled, vendor notified, admins notified (urgent) |
| MP-R18 | Webhook + success route both process same payment idempotently: payment record UNIQUE on stripe_payment_intent_id (second insert skipped), order status checked before update, vendor notification deduplicated by orderNumber, market box RPC returns already_existed. Net: 1 charge, 1 payment record, 1 order update, 1 vendor notification, 1 subscription regardless of execution order | MP-W1 | Both webhook and success route fire → no duplicates in any table or notification |

#### CODE-VERIFIED DETAILS (Deep Dive Agent — 2026-02-25)

**Exact constants from `pricing.ts`:**
- `FEES.buyerFeePercent: 6.5` (line 15)
- `FEES.vendorFeePercent: 6.5` (line 16)
- `FEES.buyerFlatFeeCents: 15` (line 17)
- `FEES.vendorFlatFeeCents: 15` (line 18)
- `FEES.minimumOrderCents: 1000` (line 19)
- Small order: `thresholdCents: 500, feeCents: 50` (lines 56-62)
- Vertical minimums: FM=$10, FT=$5, Fireworks=$40 (lines 37-41)


**Exact formulas from `pricing.ts`:**
- `calculateOrderPricing()` (lines 124-154): `buyerTotal = subtotal + round(subtotal×0.065) + 15`
- `calculateItemDisplayPrice(base)` (line 176): `round(base × 1.065)` — percentage only, no flat fee
- `calculateBuyerPrice(subtotal)` (line 164): `round(subtotal × 1.065) + 15`
- `calculateVendorPayout(base)` (line 186): `round(base × 0.935) - 15`


**Exact formulas from checkout/session:**
- Prorated vendor flat fee: `Math.round(15 / items.length)` (line 491)
- Tip cap: $50 max (5000 cents, line 71)
- Tip allocation (lines 527-530): `vendorTipCents = Math.min(validTipAmount, round(subtotalCents × tipPercentage / 100))`, `tipOnPlatformFeeCents = validTipAmount - vendorTipCents`


**External payment formulas (vendor-fees.ts):**
- External buyer fee: `round(subtotal × 0.065)` — NO flat fee (line 40)
- External vendor fee: 3.5% (line 48-50) — invoiced via ledger, NOT deducted from transfer


**Cancellation fee (cancellation-fees.ts):**
- Grace period: 1 hour (line 14)
- Within grace OR vendor hasn't confirmed: 100% refund
- After grace + vendor confirmed: 75% refund, 25% cancellation fee
- Cancellation fee split: 13% to platform, 87% to vendor (line 71-72)


**Idempotency keys (confirmed):**
- Checkout session: reuses pending order by matching listing_id+schedule_id+pickup_date+quantity (line 184)
- Payment record: unique constraint on `stripe_payment_intent_id` (success/route.ts line 83)
- Vendor notifications: checks existing by order_number before sending (success/route.ts line 283)
- Market box subscriptions: RPC returns `already_existed` flag (success/route.ts line 262)


**CRITICAL FINDING — External fee ledger:**
- `recordExternalPaymentFee()` is DEFINED in vendor-fees.ts but NOT CALLED in checkout/external/route.ts
- Fee ledger entry creation happens at vendor confirm time (confirm-external-payment route), NOT at checkout
- For cash orders: fees deferred further to fulfill time


### Business Rules Still Needing Investigation

| ID | Question | Status |
|----|----------|--------|
| MP-Q1 | Market box payout: is there a unique index on `market_box_pickup_id` similar to `order_item_id`? Session 46 flagged this as missing. | CODE VERIFIED — buyer and vendor percentage fees are always identical (6.5% each). Both use `FEES.buyerFeePercent` and `FEES.vendorFeePercent` from `pricing.ts`. No code path allows them to differ. The `as const` object makes them compile-time immutable. Still needs verification on market_box_pickup_id unique index. |
| MP-Q2 | External payment fee difference (13% Stripe vs 10% external) — confirmed intentional by user? | CONFIRMED BY USER — External payments: Buyer fee = 6.5%, Vendor fee = 3.5% (10% total vs 13% for Stripe). Lower vendor fee because platform has no payment processing cost to pass along. |
| MP-Q3 | Tip on platform fee portion — is this clearly communicated to the buyer in the UI? | CONFIRMED BY USER — NOT communicated to buyer at checkout by design. Must be disclosed in Terms & Conditions only. Not supposed to be visible to the buyer at checkout. |

---

## DOMAIN 2: ORDER LIFECYCLE

**Four separate status systems exist — same words mean different things in each:**
- **Order status** (`orders.status`): the container — pending/paid/completed/cancelled/refunded
- **Item status** (`order_items.status`): what buyer & vendor interact with — pending/confirmed/ready/fulfilled/cancelled/refunded
- **Payment status** (`payments.status`): Stripe money in — pending/processing/succeeded/failed/cancelled/refunded
- **Payout status** (`vendor_payouts.status`): vendor money out — pending/processing/completed/failed/cancelled
- **Display-only**: `handed_off` (buyer sees when vendor fulfilled but buyer hasn't acknowledged — NOT in DB, computed in buyer orders API) and `expired` (buyer sees for cron-cancelled items — NOT in DB)

### Named Workflows

**OL-W1: Stripe Order — Happy Path**
Order: `pending` (awaiting payment) → `paid` (Stripe charged) → `completed` (all items done)
Items: `pending` (awaiting vendor) → `confirmed` (vendor accepted) → `ready` (vendor prepared) → `fulfilled` (pickup confirmed)
Payment: `pending` → `processing` → `succeeded`
Payout: created at fulfill → `pending` → `processing` → `completed` (money in vendor's Stripe account)

**OL-W2: External Order — Happy Path**
Order: `pending` → `paid` (vendor confirms they received Venmo/cash/etc.) → `completed`
Items: same as OL-W1
Payment: N/A (no Stripe charge — money exchanged outside platform)
Payout: N/A (no Stripe transfer — platform fees tracked in ledger only)

**OL-W3: Buyer Cancellation**
Items: any pre-`fulfilled` item status → `cancelled` (inventory restored)
Payment: `succeeded` → `refunded` or `partially_refunded` (Stripe orders only; external = no Stripe refund)
Payout: not created yet (or `cancelled` if already `pending`)

**OL-W4: Vendor Rejection**
Items: `pending` → `cancelled` (inventory restored, buyer notified, always 100% refund)

**OL-W5: Automated Expiration (Cron)**
Cron detects stale orders → items `cancelled`, inventory restored, buyer notified

**OL-W6: Pickup Confirmation (Mutual — 30s Window)**
Vendor marks item `ready` → buyer clicks "I received this" (sets `buyer_confirmed_at`, starts 30s window) → vendor clicks "Fulfill" within 30s (sets `vendor_confirmed_at`, item → `fulfilled`, payout record created). If window expires: `buyer_confirmed_at` reset, buyer must re-acknowledge. Cron Phase 7 auto-fulfills stale windows >5min.

**OL-W7: Stale Recovery (Cron)**
Item `confirmed` (vendor accepted but never prepared) past pickup date → escalating notifications → eventual auto-cancel

### Status Systems Reference (4 independent enums — same word can mean different things)

| System | DB Column | Enum Values | End States (no further transitions) |
|--------|-----------|-------------|--------------------------------------|
| **Order** | `orders.status` | `pending`, `paid`, `completed`, `cancelled`, `refunded` | `completed`, `cancelled`, `refunded` |
| **Item** | `order_items.status` | `pending`, `confirmed`, `ready`, `fulfilled`, `cancelled`, `refunded` | `fulfilled`, `cancelled`, `refunded` |
| **Payment** | `payments.status` | `pending`, `processing`, `succeeded`, `failed`, `cancelled`, `refunded`, `partially_refunded` | `refunded`, `partially_refunded`, `failed`, `cancelled` |
| **Payout** | `vendor_payouts.status` | `pending`, `processing`, `completed`, `failed`, `cancelled` | `completed`, `cancelled` |

**Display-only statuses** (computed, never stored in DB):
- `handed_off` — buyer orders API returns this when `order_items.status = 'fulfilled'` AND `order_items.buyer_confirmed_at IS NULL`
- `expired` — computed from `order_items.status = 'cancelled'` + cancellation source was cron expiration

### Business Rules

| ID | Rule | Test Assertion (pass/fail) |
|----|------|---------------------------|
| OL-R1 | **`orders.status` — Forward-only transitions, set by system events (not buyer/vendor directly)**. Valid progression: `'pending'` (order created, awaiting payment) → `'paid'` (Stripe/external payment confirmed) → `'completed'` (all `order_items.status` are end states). End states: `'completed'`, `'cancelled'`, `'refunded'`. | `orders.status = 'paid'` → update to `'pending'` MUST fail. `orders.status = 'cancelled'` → update to `'paid'` MUST fail. `orders.status = 'completed'` → update to anything MUST fail. |

| OL-R2 | **`order_items.status` — Forward-only transitions, driven by buyer/vendor/cron actions**. Valid progression: `'pending'` (awaiting vendor acceptance) → `'confirmed'` (vendor accepted, preparing) → `'ready'` (vendor finished prep, awaiting pickup) → `'fulfilled'` (pickup confirmed by both parties). End states: `'fulfilled'`, `'cancelled'`, `'refunded'`. | `order_items.status = 'fulfilled'` → update to `'confirmed'` MUST fail. `order_items.status = 'cancelled'` → update to `'ready'` MUST fail. `order_items.status = 'refunded'` → update to anything MUST fail. |

| OL-R3 | **`order_items.status` → `'cancelled'` triggers inventory restore**. When any item reaches `order_items.status = 'cancelled'` (by buyer, vendor, or cron), inventory MUST be restored for the exact `order_items.quantity` that was decremented at checkout. Uses `atomic_decrement_inventory` RPC (per-listing). | Given `order_items.quantity = 3` and `listings.quantity_available` was decremented by 3 at checkout → after `order_items.status` set to `'cancelled'` → `listings.quantity_available` MUST increase by exactly 3. |

| OL-R4 | **`vendor_payouts` row created ONLY when `order_items.status = 'fulfilled'`**. No payout record exists for items at `'pending'`, `'confirmed'`, or `'ready'`. Payout row is inserted with `vendor_payouts.status = 'pending'` (queued for Stripe transfer). Later Stripe processes it to `vendor_payouts.status = 'completed'` (transfer succeeded). 
| When `order_items.status = 'confirmed'` → `SELECT FROM vendor_payouts WHERE order_item_id = X` MUST return 0 rows. When `order_items.status` set to `'fulfilled'` → same query MUST return 1 row with `vendor_payouts.status = 'pending'`. |

| OL-R5 | **Buyer can cancel items where `order_items.status` IN (`'pending'`, `'confirmed'`, `'ready'`)**. Once `order_items.status = 'fulfilled'`, cancel is blocked — vendor has been paid. A cancellation fee may apply (see OL-R7/R8), but the status path is valid for all three pre-fulfillment statuses. | Buyer cancel where `order_items.status = 'pending'` → `order_items.status` set to `'cancelled'`. Buyer cancel where `order_items.status = 'confirmed'` → `order_items.status` set to `'cancelled'`. Buyer cancel where `order_items.status = 'ready'` → `order_items.status` set to `'cancelled'`. Buyer cancel where `order_items.status = 'fulfilled'` → API returns error, `order_items.status` unchanged. |

| OL-R6 | **Display-only `handed_off` status — computed, not stored**. Buyer orders API returns `status: 'handed_off'` when `order_items.status = 'fulfilled'` AND `order_items.buyer_confirmed_at IS NULL`. This means: vendor marked handoff complete but buyer hasn't acknowledged receipt yet. DB column `order_items.status` remains `'fulfilled'`. | `order_items.status = 'fulfilled'`, `buyer_confirmed_at = NULL` → API response shows `status: 'handed_off'`. Same item with `buyer_confirmed_at IS NOT NULL` → API response shows `status: 'fulfilled'`. In both cases, `order_items.status` in DB = `'fulfilled'`. |

| OL-R7 | **Buyer cancel with 100% refund — within early cancel window OR pre-confirm**. Early cancel window is per-vertical: FM = 1 hour, FT = 15 minutes. Conditions for 100% refund (either one): (a) buyer cancels within the vertical's early cancel window of `orders.created_at`, OR (b) `order_items.status = 'pending'` (vendor hasn't confirmed yet), even if past the early cancel window. Result: `order_items.status` → `'cancelled'`, `payments.status` → `'refunded'` (full Stripe refund issued), no cancellation fee. | FM order: cancel at created_at + 59min → `payments.status = 'refunded'`, refund = 100%. FM order: cancel at created_at + 61min with `order_items.status = 'pending'` → `payments.status = 'refunded'`, refund = 100% (pre-confirm override). FT order: cancel at created_at + 14min → `payments.status = 'refunded'`, refund = 100%. FT order: cancel at created_at + 16min with `order_items.status = 'pending'` → `payments.status = 'refunded'`, refund = 100% (pre-confirm override). |

| OL-R8 | **Buyer cancel with 75% refund + 25% fee — past early cancel window AND vendor confirmed**. Both conditions must be true: (a) buyer cancels AFTER the vertical's early cancel window (FM = 1 hour, FT = 15 minutes), AND (b) `order_items.status` is `'confirmed'` or later (vendor already accepted). Result: `order_items.status` → `'cancelled'`, `payments.status` → `'partially_refunded'`, 75% refunded to buyer, 25% fee split: 13% to platform, 87% to vendor. | FM order: cancel at created_at + 61min with `order_items.status = 'confirmed'` → `payments.status = 'partially_refunded'`, refund = 75%, fee = 25% (13% platform, 87% vendor). FT order: cancel at created_at + 16min with `order_items.status = 'confirmed'` → same result. FT order: cancel at created_at + 16min with `order_items.status = 'pending'` → does NOT trigger this rule (OL-R7 applies instead, 100% refund). |

| OL-R9 | **Stripe refund only for Stripe-paid orders**. Refund API call to Stripe only when `payments.status = 'succeeded'` AND `orders.payment_method != 'external'`. For external payments (Venmo/cash/etc.), no Stripe charge exists — fee adjustments tracked in ledger only, `payments.status` unchanged. | External payment order cancel → no Stripe refund API call. `payments.status` does NOT change to `'refunded'`. Stripe payment order cancel → Stripe refund API called, `payments.status` changes to `'refunded'` or `'partially_refunded'`. |

| OL-R10 | **Vendor confirm: `order_items.status` `'pending'` → `'confirmed'`**. Preconditions: (a) vendor owns the listing (`order_items.listing_id` → `listings.vendor_id` = authenticated user), (b) `order_items.status = 'pending'`, (c) for Stripe orders in production, `vendor_profiles.stripe_account_id IS NOT NULL`. | Non-owner vendor → HTTP 403. `order_items.status = 'confirmed'` (already confirmed) → error returned. Valid confirm → `order_items.status = 'confirmed'`. |

| OL-R11 | **Vendor reject: `order_items.status` `'pending'` → `'cancelled'` + always 100% refund**. Regardless of time elapsed, vendor rejection triggers full refund. Increments `vendor_profiles.orders_cancelled_after_confirm_count`. Warning threshold: count / total_confirmed ≥ 10% after 10+ confirmed orders. | Vendor reject → `order_items.status = 'cancelled'`, `payments.status = 'refunded'`, refund = 100%. `vendor_profiles.orders_cancelled_after_confirm_count` increments by 1. |

| OL-R12 | **Pickup confirmation window — 30 seconds, mutual**. BUYER clicks "I received this" → sets `order_items.buyer_confirmed_at = NOW()` and `order_items.confirmation_window_expires_at = NOW() + 30s`. VENDOR must click "Fulfill" within 30s → sets `order_items.vendor_confirmed_at`, `order_items.status` → `'fulfilled'`, payout row created. If window expires: `order_items.buyer_confirmed_at` reset to NULL, buyer must re-acknowledge. If stale >5min: cron Phase 7 auto-fulfills. | After buyer confirm: `buyer_confirmed_at IS NOT NULL`, `confirmation_window_expires_at = buyer_confirmed_at + 30s`. After window expires without vendor action: `buyer_confirmed_at = NULL`. After vendor clicks within window: `order_items.status = 'fulfilled'`, `vendor_confirmed_at IS NOT NULL`, new row in `vendor_payouts` with `status = 'pending'`. |

| OL-R13 | **One notification per item status transition, no duplicates**. Notification types mapped to transitions: `order_confirmed` → `order_items.status` became `'confirmed'`, `order_ready` → became `'ready'`, `order_fulfilled` → became `'fulfilled'`, `order_cancelled_by_vendor` → vendor set `'cancelled'`, `order_cancelled_by_buyer` → buyer set `'cancelled'`, `order_expired` → cron set `'cancelled'`. | Given `order_items.status` transitions from `'pending'` to `'confirmed'` → exactly 1 notification row with `type = 'order_confirmed'` for that item. Calling the same transition endpoint again → no additional notification row created. |

| OL-R14 | **Cron Phase 1: expire unaccepted items (per-vertical expiration timing)**. Matches: `order_items.expires_at <= NOW()` AND `order_items.status = 'pending'`. Action: `order_items.status` → `'cancelled'`, inventory restored (`listings.quantity_available` += `order_items.quantity`), notification sent with `type = 'order_expired'`. Expiration timing differs by vertical: **FT** = 24hr from order creation. **FM** = 24hr after start of the pickup window time for the purchased items (not from order creation). The `expires_at` value is set at checkout based on vertical. | FT item: `expires_at` set to `created_at + 24hr`. Item with `expires_at` 25hr ago, `order_items.status = 'pending'` → after cron: `order_items.status = 'cancelled'`, `listings.quantity_available` increased, notification `type = 'order_expired'`. FM item: `expires_at` set to `pickup_window_start + 24hr`. FM item with `expires_at` 1hr ago, `order_items.status = 'pending'` → after cron: same result. |

| OL-R15 | **Cron Phase 2: cancel abandoned Stripe checkouts**. Matches: `orders.status = 'pending'` AND `orders.stripe_checkout_session_id IS NOT NULL` AND `orders.created_at < NOW() - 10min`. Action: `orders.status` → `'cancelled'`, all associated `order_items.status` → `'cancelled'`, inventory restored for each item. | Order created 11min ago, `orders.status = 'pending'`, has `stripe_checkout_session_id` → after cron: `orders.status = 'cancelled'`, all `order_items.status = 'cancelled'`, `listings.quantity_available` restored per item. |

| OL-R16 | **Cron Phase 3: cancel expired external payment orders (per-vertical timing)**. Matches: `orders.status = 'pending'` AND `orders.payment_method = 'external'` AND items past the vertical's cancel window. Per-vertical: **FT regular listings** = orders from yesterday (`order_items.pickup_date < TODAY`). **FM regular listings** = day after item pickup date (`order_items.pickup_date < TODAY - 1day`). Action: `orders.status` → `'cancelled'`, all `order_items.status` → `'cancelled'`, inventory restored. | FT external order, `pickup_date = yesterday` → after cron: cancelled + inventory restored. FM external order, `pickup_date = 2 days ago` → after cron: cancelled + inventory restored. FM external order, `pickup_date = yesterday` → NOT cancelled yet (FM gets 1 extra day). |

| OL-R17 | **Cron Phase 3.5: reminder only, no status changes (per-vertical timing)**. Matches: `orders.status = 'pending'` AND `orders.payment_method = 'external'`. Per-vertical reminder timing: **FT** = 15min after `orders.created_at`. **FM** = 12hrs after `orders.created_at`. Action: sends vendor notification `type = 'external_payment_reminder'`. Does NOT change `orders.status` or any `order_items.status`. | FT external order 20min old → reminder sent, no status changes. FM external order 13hrs old → reminder sent, no status changes. FT external order 10min old → no reminder yet. FM external order 6hrs old → no reminder yet. |

| OL-R18 | **Cron Phase 3.6: auto-confirm digital external payments**. Matches: `orders.status = 'pending'` AND `orders.payment_method` IN (`'venmo'`, `'cashapp'`, `'paypal'`) — NOT `'cash'` — AND all `order_items.pickup_date <= TODAY - 24hr`. Action: `orders.status` → `'paid'`, `order_items.status` → `'confirmed'`, `orders.external_payment_confirmed_at = NOW()`, fees recorded in ledger. | Venmo order, pickup 24hr+ past → after cron: `orders.status = 'paid'`, `order_items.status = 'confirmed'`, `external_payment_confirmed_at IS NOT NULL`. Cash order same conditions → NO changes (cash excluded). |

| OL-R19 | **Cron Phase 4: no-show buyer, vendor still paid (per-vertical timing needed)**. Current code: `order_items.status = 'ready'` AND `order_items.pickup_date < TODAY` — no per-vertical logic. Code verified: item status changes to `'fulfilled'`, payout created with `vendor_payouts.status = 'pending'`, buyer gets `pickup_missed` notification. **Per-vertical scenarios to decide:** **FT**: Buyer ordered for 5:00 PM slot. No-show should trigger after the time slot passes, not just after midnight. Current code only checks date, ignoring `preferred_pickup_time`. **FM**: Buyer's pickup was during Saturday market (8am-1pm). No-show detection at midnight Saturday → Sunday is reasonable since market is closed. **Decision needed**: Should FT no-show check `pickup_date + preferred_pickup_time < NOW` instead of just `pickup_date < TODAY`? | FT: item `status='ready'`, `pickup_date = today`, `preferred_pickup_time = 17:00`, current time = 18:00 → should this trigger no-show? (Currently: NO — pickup_date is today, not past). FM: item `status='ready'`, `pickup_date = yesterday` → after cron: `order_items.status = 'fulfilled'`, payout created, buyer notified. |

| OL-R20 | **Cron Phase 4.5: vendor stale reminder, no status change**. Matches: `order_items.status = 'confirmed'` AND `order_items.pickup_date < TODAY` with 3-day lookback. Action: escalating vendor notifications. `order_items.status` stays `'confirmed'` — does NOT change. | Item `order_items.status = 'confirmed'`, `pickup_date = yesterday` → after cron: `order_items.status` still `'confirmed'`, vendor notification sent. |

| OL-R21 | **Cron Phase 5: retry failed payouts**. Matches: `vendor_payouts.status = 'failed'` AND `vendor_payouts.created_at < NOW() - 7days`. Action: retries Stripe transfer. Success → `vendor_payouts.status = 'completed'`. Second failure → `vendor_payouts.status = 'cancelled'`, admin alert notification sent. | Payout with `vendor_payouts.status = 'failed'`, created 8 days ago → after cron: either `vendor_payouts.status = 'completed'` (retry success) or `vendor_payouts.status = 'cancelled'` (retry failed) + admin alert. |

| OL-R22 | **Cron Phase 7: auto-fulfill stale confirmation windows**. Matches: `order_items.buyer_confirmed_at IS NOT NULL` AND `order_items.vendor_confirmed_at IS NULL` AND `order_items.confirmation_window_expires_at < NOW() - 5min`. Action: `order_items.status` → `'fulfilled'`, `order_items.vendor_confirmed_at = NOW()`, new `vendor_payouts` row with `vendor_payouts.status = 'pending'`. | Item with `buyer_confirmed_at` set, `vendor_confirmed_at = NULL`, window expired 6min ago → after cron: `order_items.status = 'fulfilled'`, `vendor_confirmed_at IS NOT NULL`, `vendor_payouts` row with `status = 'pending'`. |

### Cron Phases Reference

| Phase | Match Condition (DB columns) | Timing | Result (DB changes) |
|-------|------------------------------|--------|---------------------|
| 1 | `order_items.expires_at <= NOW()` AND `order_items.status = 'pending'` | 24hr | `order_items.status` → `'cancelled'`, `listings.quantity_available` += quantity, notification `'order_expired'` |
| 2 | `orders.status = 'pending'` AND `orders.stripe_checkout_session_id IS NOT NULL` AND `orders.created_at < NOW() - 10min` | 10min | `orders.status` → `'cancelled'`, all `order_items.status` → `'cancelled'`, inventory restored |
| 3 | `orders.status = 'pending'` AND `orders.payment_method = 'external'` AND items past vertical cancel window | FT: orders from yesterday. FM: day after pickup date | `orders.status` → `'cancelled'`, all `order_items.status` → `'cancelled'`, inventory restored |
| 3.5 | `orders.status = 'pending'` AND `orders.payment_method = 'external'` AND past vertical reminder time | FT: 15min after created. FM: 12hr after created | Notification only — NO status changes |
| 3.6 | `orders.status = 'pending'` AND `orders.payment_method` IN (`'venmo'`,`'cashapp'`,`'paypal'`) AND `pickup_date <= TODAY - 24hr` | 24hr post-pickup | `orders.status` → `'paid'`, `order_items.status` → `'confirmed'`, `orders.external_payment_confirmed_at = NOW()` |
| 4 | `order_items.status = 'ready'` AND `order_items.pickup_date < TODAY` | Past pickup | New `vendor_payouts` row (`status = 'pending'`), buyer notification |
| 4.5 | `order_items.status = 'confirmed'` AND `order_items.pickup_date < TODAY` (3-day lookback) | Past pickup | Vendor notification only — `order_items.status` stays `'confirmed'` |
| 5 | `vendor_payouts.status = 'failed'` AND `vendor_payouts.created_at < NOW() - 7days` | 7 days | Retry → `vendor_payouts.status` → `'completed'` or `'cancelled'` + admin alert |
| 7 | `order_items.buyer_confirmed_at IS NOT NULL` AND `order_items.vendor_confirmed_at IS NULL` AND `confirmation_window_expires_at < NOW() - 5min` | 5min | `order_items.status` → `'fulfilled'`, `vendor_confirmed_at = NOW()`, new `vendor_payouts` row (`status = 'pending'`) |
| 8 | `vendor_profiles.tier_expires_at <= NOW()` | Daily | Downgrade subscription tier |
| 9 | Old logs/notifications/events past retention window | 90d/60d/30d | Delete old rows |

### Open Questions

| ID | Question | Status |
|----|----------|--------|
| OL-Q1 | Is there a check preventing vendor from confirming AFTER the cutoff time has passed? | CODE VERIFIED — **NO.** Vendor confirm route (`src/app/api/vendor/orders/[id]/confirm/route.ts`) only checks: (a) auth, (b) vendor ownership, (c) Stripe setup, (d) `order_items.status = 'pending'`. It does NOT check `expires_at`, cutoff time, or any time-based condition. A vendor can confirm an item at any time, even days after it "expired." The cron (Phase 1) may cancel the item first, but if the cron hasn't run yet, the vendor can still confirm a stale item. **GAP**: Should the confirm route reject items where `expires_at < NOW()`? |
| OL-Q2 | What happens if BOTH success route and webhook try to create market box subscriptions? | VERIFIED — RPC returns `already_existed` flag, safe to call twice |
| OL-Q3 | Confirmation window — who sets `confirmation_window_expires_at` and when? Is 30s configurable? | VERIFIED — Set by buyer confirm route, 30s hardcoded, NOT configurable. Cron Phase 7 auto-fulfills stale >5min |
| OL-Q4 | External orders in pending sit until Phase 3 (past pickup) or Phase 3.5 (2hr reminder). Gap between 10min and pickup date? | CONFIRMED — design gap. External orders have no equivalent of Phase 2's 10min timeout |
| OL-Q5 | Chef Box & Market Box corollary for OL-R16: Do subscription-based box orders follow the same external payment cancellation rules as regular listings? Or do they have separate timing? | NEEDS USER DECISION |
| OL-Q6 | Chef Box & Market Box corollary for OL-R17: Do subscription-based box orders get the same vendor reminder timing (FT=15min, FM=12hr)? Or different? | NEEDS USER DECISION |
| OL-Q7 | Cash order status progression: Cash orders are excluded from Phase 3.6 auto-confirm (only digital external auto-confirms). What is the full lifecycle for a cash order? Vendor must manually confirm payment — but what if they never do? Phase 3 cancels eventually (past pickup), but is there an intermediate reminder or escalation specific to cash? | NEEDS DOCUMENTATION — user referenced a prior conversation about cash status progression |
| OL-Q8 | OL-R19 per-vertical no-show timing: Should FT no-show detection use `pickup_date + preferred_pickup_time < NOW` (time-aware) instead of just `pickup_date < TODAY` (date-only)? Current code ignores the time slot entirely. | NEEDS USER DECISION |

---

## DOMAIN 3: VERTICAL ISOLATION

### Named Workflows

**VI-W1: Vertical Routing**
Request → middleware validates vertical slug → layout injects CSS vars → page renders with vertical context

**VI-W2: Data Scoping**
Any query → filter by vertical_id → return only data for current vertical

**VI-W3: Terminology Resolution**
Component needs label → calls `term(vertical, key)` → returns vertical-specific string

**VI-W4: Branding Application**
Page renders → `getVerticalCSSVars()` applied → colors/fonts per vertical → email/notification branded per vertical

**VI-W5: Feature Gating**
Feature check → vertical config consulted → feature enabled/disabled per vertical

### Business Rules (Prioritized)

#### CRITICAL (Data Isolation)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| VI-R1 | Only valid vertical slugs are routable: `farmers_market`, `food_trucks`, `fire_works`. All others → 404 | VI-W1 | Request to `/invalid_vertical/browse` → 404 |
| VI-R2 | Every Supabase query on `listings`, `orders`, `vendor_profiles`, `markets` MUST include `.eq('vertical_id', vertical)` when in a vertical context. No listing or profile data from any page crosses from one vertical to another except as necessary for platform admin management | VI-W2 | FM browse page never shows FT listings; FT vendor dashboard never shows FM orders; FT vendor profile page never shows FM listing data |
| VI-R3 | ONLY platform admin sees data across verticals. A vertical-specific admin (e.g., someone who manages FM vendors) cannot filter for or see FT data. Cross-vertical data access requires platform admin role, not just any admin role | VI-W2 | FT vertical admin cannot see FM vendor data. FT vertical admin cannot filter for FM data. Platform admin CAN see all verticals. |
| VI-R4 | Activity feed (`/api/marketing/activity-feed`) MUST filter by vertical_id | VI-W2 | FM activity feed shows only FM activity |
| VI-R5 | Vendor profiles are scoped by vertical_id. A vendor on FM is a separate entity from the same person's vendor profile on FT | VI-W2 | Same user_id can have vendor_profile with vertical_id='farmers_market' AND separate one with vertical_id='food_trucks' |

#### HIGH (Branding Integrity)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| VI-R6 | Email FROM address for notifications: FM=`noreply@mail.farmersmarketing.app`, FT=`noreply@mail.foodtruckn.app`. These are notification-only addresses. Each vertical will also have separate email addresses for other purposes (support, marketing, etc.) | VI-W4 | FT order notification sent from foodtruckn.app domain |
| VI-R7 | CSS primary color: FM=`#8BC34A` (green), FT=`#ff5757` (red) | VI-W4 | No green on FT pages; no red on FM pages (except semantic danger color) |
| VI-R8 | `term()` returns vertical-specific strings: FM "Market" vs FT "Location", FM "Market Box" vs FT "Chef Box" | VI-W3 | `term('food_trucks', 'market')` returns "Location" not "Market" |
| VI-R9 | Buyer premium is FM-only. `isBuyerPremiumEnabled('food_trucks')` returns false. FT never shows premium upgrade UI | VI-W5 | FT settings page has no tier upgrade section |

#### MEDIUM (Feature Gating)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| VI-R10 | Tipping is FT-only. Checkout shows tip selector only when vertical='food_trucks'. Preset options: 'No Tip' (0%), 10%, 15%, 20%, + Custom | VI-W5 | FM checkout has no tip UI; FT checkout shows preset buttons: 'No Tip' (0%), 10%, 15%, 20%, + Custom input |
| VI-R11 | Preferred pickup time is FT-only. Cart item shows time slot selector only for FT | VI-W5 | FM cart items have no time slot; FT cart items require time slot |
| VI-R12 | Vendor tier names differ: FM has standard/premium/featured. FT has free/basic/pro/boss | VI-W5 | `getTierLimits('basic', 'farmers_market')` throws or returns null; `getTierLimits('basic', 'food_trucks')` returns valid limits |
| VI-R13 | Chef Box types (weekly_dinner, family_kit, etc.) are FT-only. FM market box offerings have null box_type | VI-W5 | FT market box form requires box_type; FM form doesn't show box_type field |
| VI-R14 | **Per-vertical order cutoff rules.** **FT**: Truck must have 30min lead time — orders accepted until 31min before end of the available window for the location (e.g., if window ends at 5:00 PM, last order must be placed by 4:29 PM). **FM traditional market**: 18hr auto cutoff for listings associated with a traditional market. **FM private location**: 10hr auto cutoff for listings associated with private locations. Configurable per market via `markets.cutoff_hours` column override. | VI-W5 | FT location window ends 5:00 PM → order at 4:30 PM rejected (within 30min). Order at 4:29 PM accepted. FM traditional market → default cutoff 18hr. FM private location → default cutoff 10hr. |
| VI-R15 | **Per-vertical browse visibility.** **FT**: Same-day ordering — FT browse shows listings for trucks available today only. Orders accepted until 31min before end of the available window (same rule as VI-R14). **FM**: Browse shows listings associated with markets & private locations that have hours set and will be available (in season) for the next 7 days. Listings drop off automatically if they are only at a location that does not have open hours for the upcoming week. | VI-W5 | FT browse shows "Order for today" — no future dates. FM browse shows listings available within the next 7 days. FM listing at a market with no hours next week → not shown. |

#### CODE-VERIFIED DETAILS (Deep Dive Agent — 2026-02-25)

**Middleware validation (src/middleware.ts lines 4-5, 24):**
- `VALID_VERTICALS = ['farmers_market', 'food_trucks', 'fire_works']`
- Invalid slugs → 404 rewrite at edge level

**Layout CSS injection (src/app/[vertical]/layout.tsx lines 18-23):**
- FM: returns `{}` (uses globals.css defaults — green #8BC34A)
- FT: returns 16 CSS var overrides (red #ff5757 primary)

**Terminology configs (src/lib/vertical/configs/):**
- FM config: 172 lines, 85 keys — `farmers-market.ts`
- FT config: 174 lines, 85 keys — `food-trucks.ts`
- Key differences: market→Location, Market Box→Chef Box, Product→Dish, Vendor→Food Truck

**Branding (src/lib/branding/defaults.ts lines 6-62):**
- FM: domain=farmersmarketing.app, primary=#2d5016 (green), brand="Fresh Market"
- FT: domain=foodtruckn.app, primary=#ff5757 (red), brand="Food Truck'n"

**Email FROM (src/lib/notifications/service.ts line 175):**
- FM: `noreply@mail.farmersmarketing.app` ✅
- FT: `noreply@mail.foodtruckn.app` ✅ (requires Resend DNS verification)

**Feature gating configs (vertical config files lines 7-9):**
- FM: `buyer_premium_enabled: true, premium_window_minutes: 120, show_upgrade_ui: true`
- FT: `buyer_premium_enabled: false, premium_window_minutes: 0, show_upgrade_ui: false`

**Radius options:**
- FM: [10, 25, 50, 100] miles (terminology.ts line 53)
- FT: [2, 5, 10, 25] miles (FT config line 173)

**Cutoff hours (src/lib/constants.ts lines 28-35):**
- `DEFAULT_CUTOFF_HOURS = { traditional: 18, private_pickup: 10, food_trucks: 0, event: 24 }`
- Per-market override via `markets.cutoff_hours` column (nullable)

**Activity feed (src/app/api/marketing/activity-feed/route.ts line 31):**
- ✅ DOES filter by vertical_id: `.eq('vertical_id', vertical)`

**Root admin (src/app/admin/page.tsx lines 20-26):**
- ❌ NO vertical filtering — queries ALL users/vendors/listings globally
- Displays vendor vertical_id in pending table (line 194) but counts are cross-vertical

**Hardcoded vertical checks found (17 locations):**
- All in UI/checkout conditional branches: tip selector, pickup time, box_type, date range, emoji, tier defaults
- Pattern: `vertical === 'food_trucks'` gates FT-only features
- Pattern: `vertical !== 'food_trucks'` gates FM-only features (buyer premium, market box types)

### Business Rules Still Needing Investigation

| ID | Question | Status |
|----|----------|--------|
| VI-Q1 | Cross-vertical auth: FM credentials work on FT (same Supabase auth). Production TLDs are separate so cookies don't carry over. Is shared identity intentional? | NEEDS USER DECISION |
| VI-Q2 | Root admin page (`/admin/page.tsx`) — are the unscoped queries intentional (platform-wide view) or a bug? | NEEDS USER DECISION — agent confirmed it IS unscoped, shows all-vertical data with vertical_id displayed per row |
| VI-Q3 | Referral codes — are they vertical-scoped? Can an FM referral code be used during FT signup? | NEEDS CODE VERIFICATION — referral lookup in submit route does NOT appear to filter by vertical_id |
| VI-Q4 | Are there other vertical-specific terms beyond the 85 keys in `term()` configs? User asked if there are other vertical-specific terms not yet mapped. | NEEDS REVIEW |
| VI-Q5 | VI-R8 confirmed: `term()` handles Market/Location, Market Box/Chef Box, Product/Dish, Vendor/Food Truck. Are there terms that SHOULD differ by vertical but currently don't? | NEEDS REVIEW |

---

## DOMAIN 4: VENDOR JOURNEY

### Named Workflows

**VJ-W1: Vendor Signup**
Landing page → signup form → profile created (pending) → admin notification

**VJ-W2: Admin Approval**
Admin reviews → approves/rejects → vendor notified → (if approved) onboarding begins

**VJ-W3: Three-Gate Onboarding**
Gate 1: Category verification (documents) → Gate 2: COI upload → Gate 3: Prohibited items acknowledgment → `canPublishListings()` returns true

**VJ-W4: Stripe Connect**
Vendor initiates → Stripe hosted onboarding → callback → account linked → payouts enabled

**VJ-W5: Listing Creation**
Create form → fill fields → select markets → publish (or save as draft)

**VJ-W6: Listing Publication**
Draft → validation checks → status='published' → visible on browse → availability calculated

**VJ-W7: Market Management**
Browse markets → join market → set attendance → manage schedules

**VJ-W8: Market Suggestion**
Vendor suggests new market → admin reviews → approved/rejected → vendor joins if approved

### Business Rules (Prioritized)

#### CRITICAL (Gate Enforcement)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| VJ-R1 | Vendor cannot publish listings until ALL 3 gates pass: category verification approved, COI approved, prohibited items acknowledged | VJ-W3, VJ-W6 | `canPublishListings()` returns false if any gate incomplete |
| VJ-R2 | Vendor cannot receive Stripe payouts without `stripe_account_id` set and `stripe_payouts_enabled=true` | VJ-W4 | Payout cron skips vendors without Stripe (status='pending_stripe_setup') |
| VJ-R3 | Tier limits enforced: vendor cannot publish more listings than their tier allows. Both app code AND DB trigger `enforce_listing_tier_limit` must agree | VJ-W6 | FM standard vendor with 5 published listings → 6th publish attempt rejected |
| VJ-R4 | Tier limit values per vertical per tier must match between `vendor-limits.ts` and DB trigger function | VJ-W6 | FM: standard=5, premium=15, featured=15. FT: free=5, basic=10, pro=25, boss=50. (Values from code AND DB function match) |

#### HIGH (Onboarding Integrity)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| VJ-R5 | New vendor profile auto-creates `vendor_verifications` record (DB trigger `auto_create_vendor_verification`) | VJ-W1 | Insert into vendor_profiles → vendor_verifications row exists |
| VJ-R6 | FT vendors auto-assigned `tier='free'` on creation (DB trigger `set_ft_default_tier`) | VJ-W1 | New FT vendor_profile has tier='free'; new FM vendor_profile has tier='standard' |
| VJ-R7 | Vendor signup validates all required acknowledgments before submission (5 checkboxes) | VJ-W1 | Submission without all 5 → rejected |
| VJ-R8 | Market limit per tier enforced: FM standard=1 traditional, FM premium=4 traditional. FT free=1 location, FT basic=3, etc. | VJ-W7 | FM standard vendor already at 1 market → join attempt rejected |

#### MEDIUM (Listing Quality)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| VJ-R9 | Published listings MUST have `quantity_amount` and `quantity_unit` set (DB CHECK constraint) | VJ-W6 | Listing with null quantity_amount cannot be set to status='published' |
| VJ-R10 | Listing images compressed client-side before upload: 1200px max dimension, 80% JPEG quality | VJ-W5 | Upload component calls image-resize before Supabase storage upload |
| VJ-R11 | FT listings: `preferred_pickup_time` field visible in cart. FM listings: field hidden | VJ-W5 | FT listing detail shows pickup time selector; FM does not |
| VJ-R12 | Listing availability calculated from market schedules + cutoff hours + vendor attendance (FT requires attendance record) | VJ-W6 | FT listing at market with no vendor_market_schedule attendance → not available |
| VJ-R13 | Vendor can pause listing (status='paused') without deleting. Paused listings hidden from browse but preserve order history | VJ-W6 | Status change to 'paused' → listing disappears from browse → existing orders unaffected |

#### CODE-VERIFIED DETAILS (Deep Dive Agent — 2026-02-25)

**Vendor Signup (src/app/api/submit/route.ts, 236 lines):**
- Rate limited by IP (`rateLimits.submit`, line 13)
- Zod validation for `kind === 'vendor_signup'` (lines 26-34): email, phone, vertical required
- Auth verification: if user_id provided, must match authenticated user (lines 40-50)
- Duplicate check: prevents duplicate vendor profile for same user+vertical (lines 84-97)
- Auto-creates `user_profiles` row if missing (lines 52-82)
- Status set to `'submitted'` if user_id present, `'draft'` otherwise (line 125)
- Post-insert: sets `requested_categories`, initializes FT permits, creates referral credit, notifies admins

**The 5 Vendor Acknowledgments (vendor-signup/page.tsx lines 47-53, 810-926):**
| # | Key | Summary |
|---|-----|---------|
| 1 | `locallyProduced` | Products are handmade/home-grown (FM) or freshly prepared (FT) |
| 2 | `legalCompliance` | Solely responsible for legal compliance |
| 3 | `productSafety` | Full responsibility for safety, labeling, permits |
| 4 | `platformTerms` | Understands platform doesn't verify/endorse products |
| 5 | `accurateInfo` | All information is true and accurate |
All 5 required for submit button (line 947).

**Onboarding is actually 4 gates, not 3 (vendor/onboarding/status/route.ts lines 204-208):**
```
canPublishListings = verification.status === 'approved'      // Gate 1: Business verification
  && allAuthorized                                           // Gate 2: Category/permit authorization
  && verification.coi_status === 'approved'                  // Gate 3: COI (Certificate of Insurance)
  && gate4.stripePayoutsEnabled                              // Gate 4: Stripe Connect payouts enabled
```

| Gate | DB Column(s) | Check |
|------|-------------|-------|
| 1 | `vendor_verifications.status` | Must be `'approved'` |
| 2 | `vendor_verifications.category_verifications` (JSONB) | All required categories have `status='approved'` |
| 3 | `vendor_verifications.coi_status` | Must be `'approved'` |
| 4 | `vendor_profiles.stripe_payouts_enabled` | Must be `true` |

**`canPublishListings` is NOT a standalone function** — it's computed inline in the onboarding status API (lines 204-208) and returned in JSON. Client reads it via `fetch('/api/vendor/onboarding/status')`.

**`can_vendor_publish()` DB function EXISTS but is UNUSED** — defined in migration 012 (lines 111-152), checks only 3 gates (no Stripe check), but no application code calls it and it's not wired to any trigger.

**`auto_create_vendor_verification` trigger (migration 012 lines 79-93):**
- Fires `AFTER INSERT ON vendor_profiles`
- Creates `vendor_verifications` row with ON CONFLICT DO NOTHING
- Confirmed working — every new vendor_profile automatically gets a verification record

**Complete Tier Limits Table (vendor-limits.ts):**

FM Tiers (lines 32-64):
| Tier | Listings | Trad. Markets | Private Pickups | Windows/Loc | Total MBox | Active MBox | Max Subs/Offering |
|------|----------|---------------|-----------------|-------------|------------|-------------|-------------------|
| standard | 5 | 1 | 1 | 2 | 2 | 1 | 5 |
| premium | 15 | 4 | 5 | 6 | 6 | 4 | 20 |
| featured | 15 | 4 | 5 | 6 | 6 | 4 | 20 |

FT Tiers (lines 75-136):
| Tier | Listings | Trad. Markets | Private Pickups | Windows/Loc | Total MBox | Active MBox | Max Subs/Offering | Analytics Days |
|------|----------|---------------|-----------------|-------------|------------|-------------|-------------------|----------------|
| free | 5 | 1 | 2 | 4 | 0 | 0 | 0 | 0 |
| basic | 10 | 3 | 3 | 5 | 2 | 2 | 10 | 30 |
| pro | 20 | 5 | 5 | 6 | 4 | 4 | 20 | 60 |
| boss | 45 | 8 | 15 | 7 | 8 | 8 | 50 | 90 |

**DB Trigger `enforce_listing_tier_limit` (migration 052 lines 34-47):**
- ALL values match app code ✅ (free=5, basic=10, pro=20, boss=45, standard=5, premium=15, featured=15)
- Only enforces `productListings` count — other limits (markets, market boxes, pickups) enforced only in app code
- Only fires when `NEW.status = 'published'`

**Vendor Status Enum:** `draft → submitted → approved → rejected → suspended`
- No DB constraint or trigger enforces valid transitions — API routes just SET the status
- Approve: sets `status='approved'`, `approved_at=now()`, sends `vendor_approved` notification
- Reject: sets `status='rejected'`, accepts optional `reason`, sends `vendor_rejected` notification

**Stripe Connect Columns (vendor_profiles):**
| Column | Purpose |
|--------|---------|
| `stripe_account_id` | Stripe Connect Express account ID |
| `stripe_onboarding_complete` | Whether Stripe details submitted |
| `stripe_charges_enabled` | Can accept charges |
| `stripe_payouts_enabled` | Can receive payouts (Gate 4) |
| `stripe_customer_id` | For subscriptions |
| `stripe_subscription_id` | Active subscription ID |

**Stripe onboarding flow:**
1. `POST /api/vendor/stripe/onboard` → creates Express account → returns Stripe-hosted URL
2. Vendor completes on Stripe → redirected to `/{vertical}/vendor/dashboard/stripe/complete`
3. `GET /api/vendor/stripe/status` → polls Stripe API → updates columns → `stripe_payouts_enabled=true` when Stripe verifies identity+bank

**Listing writes go DIRECTLY to Supabase (ListingForm.tsx lines 253-269):**
- No server-side API for listing create/update
- Client-side validation: title required, markets selected, quantity if publishing (line 224)
- Client-side gate: `canPublishListing = !isPendingVendor && canPublish !== false` (line 232)
- If not approved/gated: status forced to `'draft'` regardless of user selection (line 243)
- DB CHECK: `listings_quantity_required_for_publish` (quantity required for published status)
- DB TRIGGER: `enforce_listing_tier_limit` (max published per tier)

**Market Management:**
- No explicit "join market" action — vendor associates via listing creation (listing_markets junction) or market suggestion
- Traditional market limits: enforced via `get_vendor_fixed_market_count` RPC + `canAddTraditionalMarket()` (vendor-limits.ts lines 340-357)
- Private pickup limits: enforced server-side in markets POST route (lines 310-320)
- Pickup window limits: enforced server-side (lines 291-295)

**Market Suggestion Flow (vendor/markets/suggest/route.ts):**
- Market created with `status='active'` AND `approval_status='pending'` (line 119)
- If `vendor_sells_at_market` (default true): vendor attendance records created IMMEDIATELY (lines 170-190)
- Admin approval just sets `approval_status='approved'` — no additional vendor join logic needed
- Buyer-facing queries must filter by `approval_status='approved'` to hide unapproved markets

### CRITICAL GAPS FOUND

**GAP 1 — No server-side listing publication gate:**
A vendor could bypass client-side gates by inserting directly via Supabase client with `status='published'`. RLS only checks vendor_profile_id ownership, not vendor approval status or onboarding gates. The DB trigger only checks tier limits.

**GAP 2 — No auto-pause of excess listings on tier downgrade:**
When vendor is downgraded (cron Phase 8, Stripe webhook, or manual), existing published listings REMAIN published even if they exceed the new tier limit. Vendor just can't publish NEW ones. No cron or trigger auto-pauses excess.

**GAP 3 — `can_vendor_publish()` DB function exists but is unused:**
Could be wired into a listing INSERT/UPDATE trigger to enforce onboarding gates at DB level, closing Gap 1.

**GAP 4 — No vendor status state machine enforcement:**
Nothing prevents invalid transitions (e.g., approving already-approved, going rejected→draft directly).

**GAP 5 — Market suggestion creates active market before admin approval:**
Market has `status='active'` while `approval_status='pending'`. Security depends on buyer-facing queries filtering by `approval_status`.

### Business Rules — Questions Resolved

| ID | Question | Status |
|----|----------|--------|
| VJ-Q1 | Can a vendor create listings while in 'pending' approval status? | RESOLVED — Yes, but client forces `status='draft'`. NO server-side enforcement — vendor could bypass via direct Supabase insert (Gap 1) |
| VJ-Q2 | Is there server-side validation on listing writes? | RESOLVED — No server API for listings. Only DB constraints: CHECK (quantity required), TRIGGER (tier limits), RLS (ownership). No vendor-status or onboarding-gate check at DB level (Gap 1) |
| VJ-Q3 | What happens to published listings when tier is downgraded? | RESOLVED — Nothing. Excess listings stay published. Only new publishes are blocked by trigger (Gap 2) |
| VJ-Q4 | Vendor market suggestion → auto-join? | RESOLVED — Yes, vendor attendance records created at suggestion time (not approval time). Vendor is already "joined" before admin approves (Gap 5) |

---

## DOMAIN 5: SUBSCRIPTION LIFECYCLE (Market Boxes / Chef Boxes)

### Named Workflows

**SL-W1: Offering Creation**
Vendor creates market box offering → tier limits checked → premium window set (FM only) → offering active

**SL-W2: Buyer Subscription (Standalone)**
Buyer selects offering → capacity check → duplicate check → Stripe checkout → webhook creates subscription → DB trigger generates pickups

**SL-W3: Buyer Subscription (Unified Cart)**
Buyer adds market box to cart with listings → Stripe checkout → success handler/webhook creates subscription per item → DB trigger generates pickups

**SL-W4: Pickup Lifecycle**
scheduled → vendor marks ready → mutual confirmation (30s window) → picked_up → payout created

**SL-W5: Vendor Skip-a-Week (FM Only)**
Vendor skips pickup → original marked skipped → extension pickup created → subscription extended_weeks incremented

**SL-W6: Subscription Completion**
All pickups resolved (picked_up/missed/skipped) → DB trigger sets subscription status=completed

**SL-W7: Missed Pickup / No-Show**
Scheduled/ready pickup past date → vendor marks missed OR cron Phase 4 auto-handles → buyer notified

### Business Rules (Prioritized)

#### CRITICAL (Revenue + Data Integrity)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| SL-R1 | Subscription creation is atomic: `subscribe_to_market_box_if_capacity` RPC acquires FOR UPDATE lock on offering row, preventing race conditions | SL-W2, SL-W3 | Two concurrent subscription attempts when 1 slot remains → exactly 1 succeeds, other gets `at_capacity` |
| SL-R2 | Triple-layer idempotency: RPC checks existing by offering_id+buyer_user_id+order_id, Stripe checkout has deterministic key `market-box-{offeringId}-{userId}-{startDate}`, UNIQUE index on `stripe_payment_intent_id` | SL-W2, SL-W3 | Webhook + success route both fire → only 1 subscription created |
| SL-R3 | Auto-refund on RPC failure: if `subscribe_to_market_box_if_capacity` fails or returns `at_capacity`, Stripe refund issued automatically | SL-W2, SL-W3 | RPC failure → buyer gets refund, no subscription created |
| SL-R4 | Payout per pickup must use per-week price (price_cents / term_weeks), NOT full term price | SL-W4 | 4-week $40 subscription: each pickup payout = $10 minus vendor fee, NOT $40 minus vendor fee |
| SL-R5 | No unique index on `vendor_payouts(market_box_pickup_id)` — double payout risk if vendor and buyer confirm simultaneously | SL-W4 | Race condition between vendor and buyer confirmation APIs → must not create 2 payout records |

#### HIGH (Lifecycle Correctness)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| SL-R6 | Pickups auto-generated by DB trigger on subscription insert: `term_weeks` records, each 7 days apart, all start as `scheduled` | SL-W2, SL-W3 | 4-week subscription → exactly 4 pickup records, dates 7 days apart |
| SL-R7 | Subscription auto-completes when all pickups resolved: trigger counts picked_up+missed+skipped+rescheduled >= term_weeks+extended_weeks | SL-W6 | All 4 pickups picked_up → subscription status=completed, completed_at set |
| SL-R8 | Skip-a-week creates extension pickup with is_extension=true, increments extended_weeks. Cannot skip extension pickups. FT disabled. | SL-W5 | FM vendor skips week 2 → new week 5 pickup, extended_weeks=1. FT vendor skip attempt → rejected |
| SL-R9 | Market boxes require Stripe payment — external payment explicitly prohibited | SL-W2, SL-W3 | Cart with market box → only Stripe payment option shown, no Venmo/CashApp/cash |
| SL-R10 | `term_weeks` must be 4 or 8 (DB CHECK constraint). FT restricted to 4-week only | SL-W2 | FT buyer selects 8-week → rejected. FM buyer selects 8-week → allowed |
| SL-R11 | Buyer cannot have duplicate active subscription to same offering | SL-W2 | Buyer already subscribed → second subscription attempt rejected |

#### MEDIUM (Operational)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| SL-R12 | Vendor cannot deactivate offering while active subscribers exist (returns 400) | SL-W1 | DELETE with active subs → 400 error |
| SL-R13 | Vendor cannot change pickup location/time while active subscribers exist | SL-W1 | PATCH pickup_market_id with active subs → rejected |
| SL-R14 | Reactivating an offering checks `canActivateMarketBox()` tier limit | SL-W1 | Vendor at active limit → reactivation rejected |
| SL-R15 | `maxSubscribersPerOffering` enforced at purchase time (API check + RPC atomic check). Falls back to tier default if vendor hasn't set it | SL-W2 | Offering at capacity → new subscriber rejected |
| SL-R16 | Cron Phase 7 auto-fulfills stale market box confirmation windows (buyer confirmed, vendor didn't, >5min) but does NOT trigger payout | SL-W4 | Auto-fulfilled pickup → status=picked_up but no vendor_payouts record |

#### CODE-VERIFIED DETAILS (Deep Dive Agent — 2026-02-25)

**Three core tables:**
- `market_box_offerings` (24 cols): vendor_profile_id, price_4week_cents (primary), price_8week_cents (nullable, FT disabled), pickup_market_id, max_subscribers, box_type (FT only)
- `market_box_subscriptions` (16 cols): offering_id, buyer_user_id, total_paid_cents, term_weeks (CHECK 4 or 8), extended_weeks, stripe_payment_intent_id (UNIQUE)
- `market_box_pickups` (16 cols): subscription_id, week_number (UNIQUE with subscription_id), scheduled_date, status, buyer/vendor_confirmed_at, confirmation_window_expires_at

**Status enums:**
- Pickup: `scheduled, ready, picked_up, missed, rescheduled, skipped`
- Subscription: `active, completed, cancelled`

**Two checkout paths:**
1. Standalone: `POST /api/buyer/market-boxes` → Stripe session → webhook `handleMarketBoxCheckoutComplete()` → RPC
2. Unified cart: `POST /api/checkout/session` with `marketBoxItems` → success/webhook → RPC per item

**Subscription creation RPC (`subscribe_to_market_box_if_capacity`):**
- FOR UPDATE lock on offering row
- Checks existing subscription (idempotency)
- Returns `{success, id, already_existed}` or `{success: false, error: 'at_capacity'}`

**Pickup generation trigger:** `trigger_create_market_box_pickups` → `create_market_box_pickups()` AFTER INSERT on subscriptions. Creates `term_weeks` pickups, 7 days apart from `start_date`.

**Subscription completion trigger:** `trigger_check_subscription_completion` → `check_subscription_completion()` AFTER UPDATE on pickups. Counts resolved pickups >= term_weeks + extended_weeks → status=completed.

**Payout code paths (BOTH can race):**
- Vendor: `/api/vendor/market-boxes/pickups/[id]/route.ts` lines 279-326
- Buyer: `/api/buyer/market-boxes/[id]/confirm-pickup/route.ts` lines 135-179
- Both check existing payout via query (NOT atomic) then insert

**Confirmed missing unique index:** `idx_payouts_market_box_pickup` is plain btree, NOT unique (Schema line 1803)

**No buyer cancellation route exists.** `cancelled` status in enum but no code path sets it.

**No cron phase auto-misses past-due pickups.** Scheduled pickups remain in `scheduled` state indefinitely if nobody acts.

**Phase 7 auto-fulfill does NOT create payouts** — only updates DB status. Payout logic is only in API route handlers.

**Tier downgrade does NOT touch market box offerings or subscriptions.**

### CRITICAL GAPS FOUND

**GAP 1 — Payout amount bug:** Both payout paths use `offering.price_cents` (full term price) as per-pickup amount. A $40/4-week subscription pays out ~$37.40/pickup (4 pickups = ~$149.60 to vendor on $40 order).

**GAP 2 — No unique index on market_box_pickup_id for payouts:** Application-level check is not atomic. Race condition between vendor and buyer confirm can create duplicate payouts.

**GAP 3 — No buyer cancellation mechanism:** The `cancelled` status exists but no API route sets it. Buyers cannot cancel, and there is no admin override.

**GAP 4 — No auto-miss for past-due pickups:** No cron marks `scheduled` pickups as `missed` when date passes. They remain indefinitely.

**GAP 5 — Phase 7 auto-fulfill creates no payout:** Stale confirmation windows get auto-fulfilled but the vendor never gets paid for those pickups.

**GAP 6 — No DB-level market box limit trigger:** Unlike listings (`enforce_listing_tier_limit`), market box creation has no DB guard. Direct Supabase writes bypass API limits.

**GAP 7 — `original_end_date` may not be set:** Latest `create_market_box_pickups()` function (migration 20260130) does NOT set `original_end_date`. Column may be NULL.

### Business Rules — Questions

| ID | Question | Status |
|----|----------|--------|
| SL-Q1 | Is the payout-per-pickup using full term price intentional or a bug? (Currently pays out ~4x what it should for a 4-week subscription) | CRITICAL — NEEDS USER CONFIRMATION |
| SL-Q2 | Should buyers be able to cancel subscriptions? If so, what refund policy? | NEEDS USER DECISION |
| SL-Q3 | Should past-due scheduled pickups be auto-missed by cron? After how many days? | NEEDS USER DECISION |

---

## DOMAIN 6: AUTH & ACCESS CONTROL

### Named Workflows

**AC-W1: User Authentication**
Login → Supabase Auth JWT in httpOnly cookie → middleware refreshes on each request → API routes verify via `getUser()`

**AC-W2: API Route Authorization**
Request → auth check (getUser) → role/ownership verification → service client if needed → response

**AC-W3: Admin Authentication**
Admin login → role verified from user_profiles → layout guard (`requireAdmin()`) → per-page + per-API admin checks

**AC-W4: Vertical Admin Scoping**
Request → check platform admin first → if not, check `vertical_admins` table for this vertical → scoped data access

**AC-W5: Service Client Escalation**
Route needs RLS bypass → create service client → guard with admin role check OR ownership verification → scoped query

**AC-W6: Cron Authentication**
Vercel sends Bearer token → timing-safe comparison against CRON_SECRET → service client for DB operations

**AC-W7: Webhook Authentication**
Stripe sends signed payload → `constructEvent()` verifies signature → process event

### Business Rules (Prioritized)

#### CRITICAL (Security)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| AC-R1 | Every state-changing API route MUST call `supabase.auth.getUser()` and reject if not authenticated (except: public reads, crons, webhooks) | AC-W2 | POST/PUT/DELETE to any vendor/buyer/admin route without auth → 401 |
| AC-R2 | `createServiceClient()` MUST be guarded: admin routes require `hasAdminRole()` or `verifyAdminForApi()`, vendor routes require vendor ownership, buyer routes require order/resource ownership | AC-W5 | Service client usage without authorization → security violation |
| AC-R3 | Cron routes validate CRON_SECRET via `timingSafeEqual()` — prevents timing attacks | AC-W6 | Invalid token → 401. No CRON_SECRET env → endpoint inaccessible |
| AC-R4 | Stripe webhook signature must be verified via `stripe.webhooks.constructEvent()` before any processing | AC-W7 | Invalid signature → 400, no processing |
| AC-R5 | Vertical admin can ONLY access data for their assigned vertical(s). Cross-vertical access blocked by `.eq('vertical_id', vertical)` check | AC-W4 | FM vertical admin requesting FT vendor data → denied |

#### HIGH (Authorization Correctness)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| AC-R6 | Platform admin check must recognize BOTH `role='admin'` and `role='platform_admin'` plus array equivalents in `roles[]` | AC-W3 | User with `role='platform_admin'` → admin access granted in both TS code AND DB functions |
| AC-R7 | Rate limiting on all API routes: auth=5/60s, submit=10/60s, api=60/60s, admin=30/60s, deletion=3/3600s, sensitive=3/60s, webhook=100/60s | AC-W2 | Exceeding rate limit → 429 response |
| AC-R8 | RLS enabled on ALL public tables. Service role client bypasses RLS, anon client respects it | AC-W5 | Query via anon client → only owns data. Query via service client → all data |
| AC-R9 | `is_platform_admin()` DB function must NOT be called in RLS policies on `user_profiles` table (causes recursion) | AC-W5 | RLS policy on user_profiles → no call to is_platform_admin() |
| AC-R10 | Admin layout guard (`requireAdmin()`) protects ALL `/admin/*` pages. Individual pages provide defense-in-depth with additional `requireAdmin()` calls | AC-W3 | Non-admin navigating to `/admin/vendors` → redirected to login |

#### MEDIUM (Operational Security)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| AC-R11 | Sensitive paths (`/admin`, `/dashboard`, `/vendor/dashboard`, `/buyer/orders`, `/settings`) get `Cache-Control: no-store, max-age=0` via middleware | AC-W1 | Admin page response headers include no-cache directive |
| AC-R12 | Only valid vertical slugs are routable (`farmers_market`, `food_trucks`, `fire_works`). Invalid → 404 rewrite | AC-W1 | Request to `/invalid_slug/browse` → 404 |
| AC-R13 | Account deletion rate-limited to 3/hour and requires email confirmation match | AC-W2 | 4th deletion attempt in same hour → 429 |
| AC-R14 | Chief vertical admin can add/remove other vertical admins. Only platform admin can set `is_chief` flag | AC-W4 | Non-chief vertical admin trying to add admin → rejected |

#### CODE-VERIFIED DETAILS (Deep Dive Agent — 2026-02-25)

**Authentication architecture:**
- Middleware (`src/middleware.ts`) does NOT enforce auth — only refreshes sessions, validates vertical slugs, prevents caching
- All auth checks happen in individual route handlers or layout components
- Pattern: `createClient() → auth.getUser() → check` used by ~95% of routes
- Session: Supabase Auth JWT in httpOnly cookies, `SameSite=Lax`, refreshed on every request

**Three Supabase client types:**
| Client | Auth Level | Purpose |
|--------|-----------|---------|
| `createClient()` (server) | Anon key + cookies | Server queries, RLS enforced |
| `createServiceClient()` | Service role key | Bypasses ALL RLS |
| `createVerifiedServiceClient()` | Admin-verified service client | Safety wrapper — DEFINED BUT NEVER USED |

**Role system (dual-column, transitional):**
- `user_profiles.role` (text): single value
- `user_profiles.roles` (text[]): array
- Both checked everywhere during transition period
- `user_profiles.is_chief_platform_admin` (bool): top-level admin
- `vertical_admins` table: per-vertical admin assignment with `is_chief` flag

**42 files import `createServiceClient()`:**
- 15 admin routes: ALL guarded by `hasAdminRole()` or `verifyAdminForApi()` ✅
- 15 vendor routes: ALL guarded by user auth + vendor ownership ✅
- 4 buyer routes: ALL guarded by user auth + order/resource ownership ✅
- 3 cron routes: Guarded by CRON_SECRET ✅
- 2 checkout routes: Guarded by user auth ✅
- 1 webhook: Guarded by Stripe signature ✅
- **`/api/submit`**: Service client created BEFORE auth check (line 20) — mitigated by subsequent user_id match
- **`/api/subscriptions/verify`**: Service client WITHOUT any auth — takes Stripe session_id and updates tiers
- **`/api/errors/report`**: Service client with optional auth (for anonymous error reporting)

**Rate limit presets (src/lib/rate-limit.ts):**
- In-memory `Map<string, RateLimitEntry>` — per-serverless-instance, resets on cold start
- All 133 API routes have rate limiting
- Burst detection (>5/sec) and endpoint scanning (>10 unique routes/60s) are informational only, not blocking

**DB admin functions:**
- `is_platform_admin()`: checks `role='admin'` OR `'admin'=ANY(roles)` — does NOT check `role='platform_admin'`
- TS code checks BOTH `admin` and `platform_admin` — inconsistency if user has only `role='platform_admin'`

**No explicit CSRF protection.** Mitigated by: JSON-only APIs (Content-Type enforcement), httpOnly SameSite=Lax cookies, Supabase session management.

### CRITICAL GAPS FOUND

**GAP 1 — `/api/subscriptions/verify` uses service client without authentication:**
Takes a Stripe `session_id` query param and updates vendor/buyer tiers directly. Only protection is that session_id must be valid Stripe session. If session_id is leaked/guessed, tier activation could be triggered.

**GAP 2 — `createVerifiedServiceClient()` defined but never used:**
This safer pattern that checks admin role before creating service client exists at `server.ts:56-84` but no route uses it.

**GAP 3 — `is_platform_admin()` DB function doesn't check `role='platform_admin'`:**
Only checks `role='admin'`. If a user has `role='platform_admin'` (without `'admin'` in roles array), DB-level RLS policies would NOT treat them as admin.

**GAP 4 — In-memory rate limiting resets on cold starts:**
Per-instance state. Attacker hitting different Vercel instances bypasses limits. Upstash Redis migration planned but not implemented.

**GAP 5 — TypeScript type inconsistency:**
`platform_admin` exists in `admin.ts` UserRole but not in `types.ts` UserRole.

### Business Rules — Questions

| ID | Question | Status |
|----|----------|--------|
| AC-Q1 | Should `/api/subscriptions/verify` require authentication? It currently uses service client without any user auth check | NEEDS USER DECISION — security vs UX tradeoff |
| AC-Q2 | Should `createVerifiedServiceClient()` replace direct `createServiceClient()` calls in admin routes? | NEEDS USER DECISION — would add consistency |

---

## DOMAIN 7: NOTIFICATION INTEGRITY

### Named Workflows

**NI-W1: Order Notification Dispatch**
Status transition → route calls `sendNotification(userId, type, data, options)` → type registry lookup → urgency determines channels → preference check → dispatch

**NI-W2: Channel Routing**
Urgency mapping: immediate=push+in_app, urgent=sms+in_app, standard=email+in_app, info=email_only → user preferences filter → FT tier gating (vendor only) → send

**NI-W3: Email Delivery**
sendNotification → Resend SDK → branded HTML template (vertical-specific FROM address, color, brand name)

**NI-W4: Push Delivery**
Browser permission → subscribe → `push_subscriptions` table → sendNotification → Web Push to ALL user devices → stale endpoint cleanup (410/404)

**NI-W5: SMS Delivery**
Twilio → phone from user_profiles → `sms_order_updates` preference check (independent of push) → send

**NI-W6: Deduplication Check**
Before sending → query notifications table for existing match (type + data key) → skip if already sent

### Business Rules (Prioritized)

#### CRITICAL (Delivery Integrity)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| NI-R1 | `sendNotification()` NEVER throws. All channel dispatchers catch errors internally. Safe to await without try/catch | NI-W1 | Channel failure → returns `{success: false}` result, no exception |
| NI-R2 | In-app notifications CANNOT be disabled — always sent regardless of preferences | NI-W2 | User with all preferences off → still gets in-app notification |
| NI-R3 | SMS sends independently of push status. `sms_order_updates` checked independently of `push_enabled` | NI-W5 | User with push_enabled=true AND sms_order_updates=true → gets BOTH push and SMS |
| NI-R4 | Checkout success/webhook deduplication: checks `notifications` table for existing `new_paid_order` with matching `orderNumber` before sending to vendor | NI-W6 | Both webhook and success route fire → exactly 1 `new_paid_order` notification |
| NI-R5 | Every order lifecycle transition sends exactly one notification type per recipient | NI-W1 | confirmed→buyer, ready→buyer, fulfilled→buyer, cancelled_by_vendor→buyer, cancelled_by_buyer→vendor, expired→buyer |

#### HIGH (Branding + Preferences)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| NI-R6 | Email FROM address: FM=`noreply@mail.farmersmarketing.app`, FT=`noreply@mail.foodtruckn.app`. FW falls back to FM address | NI-W3 | FT order notification → FROM foodtruckn.app domain |
| NI-R7 | FT vendor notifications tier-gated: free=in_app only, basic=in_app+email, pro=+push, boss=+sms | NI-W2 | FT free vendor → only in_app notifications regardless of urgency |
| NI-R8 | Push subscription auto-syncs `push_enabled` preference: subscribe → true, last unsubscribe → false | NI-W4 | User unsubscribes last device → `push_enabled` auto-set to false |
| NI-R9 | Stale push endpoint cleanup: subscriptions returning 410 Gone or 404 auto-deleted | NI-W4 | Push to expired endpoint → `push_subscriptions` row deleted |
| NI-R10 | Stale confirmed notifications (Phase 4.5) deduplicated: checks existing notification by type + orderItemId | NI-W6 | Cron runs twice → only 1 stale notification per item |

#### MEDIUM (Completeness)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| NI-R11 | 30 notification types defined, all actively used (0 dead types) | NI-W1 | Each type has at least 1 call site |
| NI-R12 | Read notifications older than 60 days deleted by cron Phase 9. Unread preserved indefinitely | NI-W1 | 90-day-old read notification → deleted. 90-day-old unread → preserved |
| NI-R13 | `sendNotificationBatch()` exists but is never called — dead code | NI-W1 | Function exported but 0 call sites in application code |
| NI-R14 | Vertical param goes in `options` (4th arg), NOT in `templateData` (3rd arg) | NI-W1 | `sendNotification(userId, type, data, { vertical })` — vertical in options |

#### CODE-VERIFIED DETAILS (Deep Dive Agent — 2026-02-25)

**30 notification types (types.ts):**
- 10 buyer-facing, 18 vendor-facing, 2 admin-facing
- Urgency mapping: immediate=push+in_app (10 types), urgent=sms+in_app (2 types), standard=email+in_app (14 types), info=email_only (4 types)

**47 call sites across 24 files:**
- Checkout: 4 calls (new_paid_order, new_external_order, inventory_low/out_of_stock)
- Vendor order routes: 17 calls (confirm, ready, fulfill, reject, handoff, resolve-issue, confirm-external)
- Buyer order routes: 4 calls (cancel, confirm, report-issue, market-box confirm)
- Admin routes: 8 calls (approve, reject, verify, verify-coi, verify-category, resolve issue, quality alert, market approve)
- Cron routes: 9 calls (Phase 2 expired, Phase 3.5 reminder, Phase 3.6 auto-confirm, Phase 4 missed, Phase 4.5 stale ×3, Phase 5 payout)
- Webhook: 4 calls (payout_processed, payout_failed, order_refunded ×2)
- Vendor signup: 1 call (new_vendor_application)

**Single HTML email template** for ALL notification types. `MESSAGE_TEMPLATES.md` rich templates are aspirational design docs, NOT implemented.

**FT tier channel gating (service.ts lines 424-443):**
- Only applies to vendor notifications (queries `vendor_profiles`)
- Buyer notifications in FT vertical are NOT tier-gated (correct behavior)
- free: `['in_app']`, basic: `['in_app', 'email']`, pro: `['in_app', 'email', 'push']`, boss: all channels

**Explicit deduplication implemented in 2 places:**
1. Checkout success: checks `notifications` table for `new_paid_order` + matching `orderNumber` (success/route.ts lines 279-284)
2. Stale confirmed cron: checks by type + `orderItemId` data (expire-orders lines 756-803)

**NOT deduplicated:**
- `order_fulfilled` (4 code paths — mutually exclusive but no DB guard)
- `order_confirmed` (2 code paths — Stripe vs external)
- Stripe webhook notifications (`payout_processed`, `payout_failed`, `order_refunded`) — webhook redeliveries can cause duplicates

### CRITICAL GAPS FOUND

**GAP 1 — No email unsubscribe link:**
HTML email template has no one-click unsubscribe. Potential CAN-SPAM/GDPR compliance concern.

**GAP 2 — `payout_failed` type misused for tier expiration:**
Cron Phase 8 sends `payout_failed` with `orderNumber: 'subscription'`, `amountCents: 0`. Confusing message: "A payout of $0.00 for order #subscription could not be processed."

**GAP 3 — Stripe webhook notifications not deduplicated:**
`payout_processed`, `payout_failed`, `order_refunded` from webhooks have no "already sent" check. Webhook redeliveries cause duplicate notifications.

**GAP 4 — `order_cancelled_by_vendor` urgency mismatch:**
`MESSAGE_TEMPLATES.md` says "Urgent (SMS + In-app)" but actual urgency is `immediate` (push + in_app). Buyer en route with push disabled but SMS enabled would NOT get cancellation notice.

**GAP 5 — `sendNotificationBatch()` is dead code:**
Exported but never called.

### Business Rules — Questions

| ID | Question | Status |
|----|----------|--------|
| NI-Q1 | Should `order_cancelled_by_vendor` urgency be changed from `immediate` (push) to `urgent` (SMS)? A buyer en route needs SMS as fallback | NEEDS USER DECISION |
| NI-Q2 | Should we add email unsubscribe links for CAN-SPAM compliance? | NEEDS USER DECISION — may need per-type control |
| NI-Q3 | Should a dedicated `subscription_expired` notification type replace the `payout_failed` misuse? | NEEDS USER DECISION |

---

## DOMAIN 8: INFRASTRUCTURE RELIABILITY

### Named Workflows

**IR-W1: Cron Execution**
Vercel triggers GET → CRON_SECRET validated → 11 phases execute sequentially → each phase has independent try/catch → JSON summary returned

**IR-W2: Error Tracking Pipeline**
Error thrown → `withErrorTracing()` catches → `TracedError` created with breadcrumbs → logged to console + `error_logs` table → Sentry capture → admin email for high/critical severity

**IR-W3: Stripe Webhook Processing**
POST received → signature verified → event routed to handler → idempotent processing → 500 on failure (Stripe retries)

**IR-W4: CI/CD Pipeline**
Push/PR → GitHub Actions: install → lint → type-check → test → security audit → build → size report → Vercel auto-deploys

**IR-W5: Data Retention**
Cron Phase 9: error_logs 90d, read notifications 60d, activity_events 30d → DELETE

**IR-W6: Error Resolution Tracking**
Error occurs → query `error_resolutions` for similar → attempt fix → record outcome → verified/failed/partial

### Business Rules (Prioritized)

#### CRITICAL (System Integrity)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| IR-R1 | Each cron phase has independent try/catch. Phase N failure does NOT prevent Phase N+1 from executing | IR-W1 | Phase 3 throws → Phases 4-9 still execute |
| IR-R2 | Within each phase, per-item processing is try/caught. One failed item does NOT abort the entire phase | IR-W1 | Item processing error → remaining items in phase still processed |
| IR-R3 | Stripe webhook returns 500 on handler failure (triggers Stripe retry, up to 16 times over 72hr). Returns 400 on invalid signature (no retry) | IR-W3 | Handler exception → 500 → Stripe retries. Bad signature → 400 → no retry |
| IR-R4 | CI pipeline fails the build on: lint errors, type errors, test failures, build errors. Security audit is `continue-on-error: true` | IR-W4 | Type error in PR → CI fails → merge blocked |
| IR-R5 | Required env vars validated at server startup via instrumentation hook. Missing → server fails to start | IR-W4 | Deploy without SUPABASE_URL → server won't start |

#### HIGH (Monitoring + Recovery)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| IR-R6 | `withErrorTracing()` wraps all API routes: catches errors → creates `TracedError` → logs to DB + console → reports to Sentry → returns standardized JSON response | IR-W2 | Unhandled error in route → standardized `{error, code, traceId}` response |
| IR-R7 | Admin email alerts for high/critical severity errors via Resend | IR-W2 | Critical error → `ADMIN_ALERT_EMAIL` receives alert email |
| IR-R8 | Breadcrumb system tracks execution path per-request via `AsyncLocalStorage`. Max 50 breadcrumbs per request | IR-W2 | API call → breadcrumbs show: api entry, supabase query, auth check, etc. |
| IR-R9 | Stripe webhook handles 12 event types. Unhandled events logged but do not cause errors | IR-W3 | Unknown event type → breadcrumb logged, 200 returned |
| IR-R10 | Failed vendor payouts retried for 7 days (cron Phase 5), then permanently cancelled with admin email alert | IR-W1 | Payout failed 8 days ago → status=cancelled, admin emailed |

#### MEDIUM (Operational Health)

| ID | Rule | Workflow | What to Test |
|----|------|----------|-------------|
| IR-R11 | Data retention: error_logs > 90 days deleted, read notifications > 60 days deleted, activity_events > 30 days deleted | IR-W5 | 91-day-old error_log → deleted. 61-day-old unread notification → preserved |
| IR-R12 | Security headers on all routes: X-Content-Type-Options, X-Frame-Options, HSTS, CSP, Referrer-Policy, Permissions-Policy | IR-W4 | Any page response → includes all 6 security headers |
| IR-R13 | Cache strategy: public data routes (vendors, markets, activity feed) use s-maxage + stale-while-revalidate. Sensitive paths use no-store | IR-W4 | `/api/vendors/nearby` → `s-maxage=300`. `/admin/*` → `no-store` |
| IR-R14 | All cron routes log per-phase counts in JSON response summary for Vercel function logs | IR-W1 | Cron completion → JSON with processed/error counts per phase |

#### CODE-VERIFIED DETAILS (Deep Dive Agent — 2026-02-25)

**Cron configuration (vercel.json):**
| Cron | Schedule | UTC Time |
|------|----------|----------|
| expire-orders | `0 6 * * *` | 6 AM daily |
| vendor-activity-scan | `0 3 * * *` | 3 AM daily |
| vendor-quality-checks | `0 10 * * *` | 10 AM daily (4 AM CT) |

**11 cron phases in expire-orders (1337 lines total):**
Phase 1 (73-214): Expire unconfirmed items >24hr
Phase 2 (216-266): Cancel stale Stripe orders >10min
Phase 3 (268-347): Cancel external orders past pickup
Phase 3.5 (349-422): Vendor reminder for external >2hr
Phase 3.6 (424-547): Auto-confirm digital external orders
Phase 4 (549-680): Missed pickups (buyer no-show)
Phase 4.5 (682-814): Stale confirmed escalation
Phase 5 (816-1023): Failed payout retry (7 days → cancel)
Phase 6 (1025-1106): Error report digest email to admin
Phase 7 (1108-1211): Auto-fulfill stale confirmation windows
Phase 8 (1213-1276): Expire tier subscriptions
Phase 9 (1278-1315): Data retention cleanup

**Error tracking architecture (src/lib/errors/, 15 files):**
- `TracedError` class with codes, trace IDs, breadcrumbs, severity, HTTP mapping
- `AsyncLocalStorage`-based request-scoped breadcrumbs (max 50/request)
- Error catalog: 6 domain files (auth, RLS, DB, cart, order/checkout, market box)
- PostgreSQL code mapping: 12 PG codes → internal ERR_* codes
- Admin email alerts for high/critical severity (via dynamic Resend import)

**Sentry configuration:**
- 3 config files: client, server, edge
- `tracesSampleRate: 0.1` (10% sampling)
- Only active when `NEXT_PUBLIC_SENTRY_DSN` is set
- Auto-disables when DSN missing — **4 env vars needed but NOT in `.env.example`**
- Only integrated in `with-error-tracing.ts` (2 `Sentry.captureException()` calls)

**CI/CD (`.github/workflows/ci.yml`, 59 lines):**
- Node 22 on ubuntu-latest
- 6 steps: install → lint → type-check → test → security audit (non-blocking) → build
- Build size reported to GitHub step summary
- Vercel auto-deploys (separate from CI)

**12 Stripe webhook event handlers (webhooks.ts, 747 lines):**
checkout.session.completed, payment_intent.succeeded, payment_intent.payment_failed, account.updated, transfer.created, transfer.reversed, charge.refunded, customer.subscription.updated, customer.subscription.deleted, invoice.payment_succeeded, invoice.payment_failed

**NOT handled:** charge.dispute.created (chargebacks), payment_intent.canceled, payout.failed

**Cache headers verified:**
- `/api/vertical/[id]`: 1hr s-maxage
- `/api/vendors/nearby`, `/api/markets/nearby`: 5min
- `/api/markets`: 10min
- `/api/marketing/activity-feed`: 1min
- `/api/manifest`: 24hr
- Sensitive paths: `no-store, max-age=0`

**ISR pages:** browse=5min, markets/vendors=10min, admin pages=2min

**Runtime env validation:** `instrumentation.ts` → `validateEnv()` checks 5 critical vars at startup. Stripe price IDs, Sentry config NOT validated.

**Service worker:** Push notifications only. No caching, no offline, no fetch interception.

**No health check endpoint exists.**

### CRITICAL GAPS FOUND

**GAP 1 — No external cron monitoring:**
If cron function crashes entirely, only Vercel's built-in monitoring catches it. No heartbeat/dead man's switch to external service.

**GAP 2 — Sentry likely not active:**
4 required env vars not in `.env.example`, suggesting not configured in any environment.

**GAP 3 — Missing Stripe chargeback handler:**
`charge.dispute.created` not handled. Chargebacks would go unnoticed by the application.

**GAP 4 — No health check endpoint:**
No `/api/health` for monitoring database connectivity.

**GAP 5 — Webhook out-of-order handling incomplete:**
No event ordering mechanism. `payment_intent.succeeded` before `checkout.session.completed` → payment update fails silently (no record yet).

**GAP 6 — Env var validation gaps:**
Stripe price IDs, webhook secret, Sentry config not validated at startup → failures only at runtime.

### Business Rules — Questions

| ID | Question | Status |
|----|----------|--------|
| IR-Q1 | Should we implement a health check endpoint? (minimal: DB ping + Stripe reachability) | NEEDS USER DECISION |
| IR-Q2 | Is Sentry configured in any environment? Should the env vars be added to `.env.example`? | NEEDS USER VERIFICATION |
| IR-Q3 | Should `charge.dispute.created` webhook be handled? What action on chargeback? | NEEDS USER DECISION |
| IR-Q4 | Should cron jobs ping an external monitoring service on completion? (e.g., BetterUptime, free tier) | NEEDS USER DECISION |

---

## OPEN QUESTIONS REQUIRING USER DECISIONS

| ID | Question | Impact | Options |
|----|----------|--------|---------|
| MP-Q2 | External payment fee: 10% (6.5% buyer + 3.5% vendor) vs Stripe 13% (6.5%+6.5%). Intentional? | Revenue model | A) Intentional, lower fee incentivizes external. B) Bug, should be 13% everywhere |
| VI-Q1 | Cross-vertical shared identity: Should FM/FT share user accounts? | Architecture | A) Shared (convenience). B) Separate (brand isolation) |
| VI-Q2 | Root admin dashboard showing all-vertical data: intentional platform-wide view or scoping bug? | Admin UX | A) Intentional (platform admin sees everything). B) Should be vertical-scoped |
| VI-Q3 | Referral code cross-vertical: Can FM referral work for FT signup? | Growth | A) Yes, cross-pollination is good. B) No, should be vertical-scoped |
| SL-Q1 | Payout per pickup uses FULL TERM price instead of per-week price. Bug? (4-week $40 sub pays vendor ~$149) | **CRITICAL revenue** | A) Bug — divide by term_weeks. B) Intentional (unlikely) |
| SL-Q2 | Should buyers be able to cancel market box subscriptions? What refund policy? | Feature | A) No cancellation (prepaid). B) Prorated refund. C) Cancel future pickups only |
| SL-Q3 | Should past-due scheduled pickups be auto-missed by cron? After how many days? | Lifecycle | A) Auto-miss after 1 day. B) After 3 days. C) Leave indefinitely |
| AC-Q1 | `/api/subscriptions/verify` uses service client without auth. Add auth requirement? | Security | A) Add auth. B) Accept risk (Stripe session_id is the guard) |
| AC-Q2 | Should `createVerifiedServiceClient()` replace direct `createServiceClient()` in admin routes? | Security | A) Yes, standardize. B) Leave as-is (manual checks work) |
| NI-Q1 | `order_cancelled_by_vendor` urgency: change from push to SMS? Buyer en route needs SMS fallback | Delivery | A) Change to urgent (SMS). B) Keep push (save SMS costs) |
| NI-Q2 | Add email unsubscribe links for CAN-SPAM compliance? | Compliance | A) Yes, required for commercial email. B) Only for marketing emails |
| NI-Q3 | Add `subscription_expired` notification type to replace `payout_failed` misuse? | UX | A) Yes, new type. B) Fix the message text only |
| IR-Q1 | Add `/api/health` endpoint? (DB ping + Stripe check) | Monitoring | A) Yes, minimal. B) Not needed yet |
| IR-Q2 | Is Sentry configured? Should env vars be in `.env.example`? | Monitoring | A) Configure + add vars. B) Skip for now |
| IR-Q3 | Handle `charge.dispute.created` webhook? What action on chargeback? | Financial | A) Yes, auto-flag order. B) Skip (manual Stripe dashboard) |
| IR-Q4 | Cron health monitoring: ping external service on completion? | Reliability | A) Yes, free tier (BetterUptime). B) Vercel monitoring sufficient |

---

## IMPLEMENTATION PLAN

### Phase 1: Build Test Infrastructure ✅ STRUCTURE READY
- Create test files per domain in `src/__tests__/business-rules/`
- 8 files: `money-path.test.ts`, `order-lifecycle.test.ts`, `vertical-isolation.test.ts`, `vendor-journey.test.ts`, `subscription-lifecycle.test.ts`, `auth-access-control.test.ts`, `notification-integrity.test.ts`, `infrastructure-reliability.test.ts`
- Each test file has descriptive comment blocks with rule IDs
- Tests run as part of existing Vitest setup

### Phase 2: Verify Rules Against Code (Per Domain Deep Dive) ✅ ALL 8 DOMAINS COMPLETE
- All 8 domains deep-dived with line-by-line code verification
- All rule values confirmed against actual code with exact line numbers
- All "NEEDS VERIFICATION" items resolved (code-verified or escalated to user questions)
- This document updated with confirmed values

### Phase 3: Document Workflow Interactions ← NEXT
- Map cross-domain workflow intersections (e.g., checkout touches Money Path + Order Lifecycle + Subscriptions + Notifications)
- Identify business rules that branch or deviate at intersections
- Create interaction matrix showing where domains share code paths
- Flag rules that could conflict if modified independently

### Phase 4: Write Tests
- Start with CRITICAL rules (revenue/data integrity)
- Then HIGH (correctness)
- Then MEDIUM (operational)
- Each test references the rule ID from this document

### Phase 5: Integrate Into Workflow
- Add `npm run test:business-rules` script
- Run before every commit (manually prompted by user)
- CI/CD runs automatically on push
- Future sessions check this document before any code changes

---

## CHANGE LOG

| Date | What Changed | Session |
|------|-------------|---------|
| 2026-02-25 | Initial creation with Domains 1-4, workflows, business rules, open questions | Session 46 |
| 2026-02-25 | Domain 1 deep-dive complete: all fee constants, formulas, idempotency verified with line numbers. External fee ledger timing confirmed. Market box payout index gap confirmed. | Session 46 |
| 2026-02-25 | Domain 2 deep-dive complete: full state machine, all cron phases, confirmation window, cancellation fees verified. OL-Q2 and OL-Q3 resolved. OL-Q4 confirmed as design gap. | Session 46 |
| 2026-02-25 | Domain 3 deep-dive complete: middleware routing, CSS injection, terminology configs, branding, feature gating all verified. 17 hardcoded vertical checks mapped. Root admin unscoped confirmed. | Session 46 |
| 2026-02-25 | Domain 4 deep-dive complete: 4-gate onboarding (not 3), complete tier limits table verified matching DB trigger, 5 critical gaps found (no server-side listing gate, no auto-pause on downgrade, unused DB function, no status state machine, pre-approval market creation). All VJ-Q1–Q4 resolved. | Session 46 |
| 2026-02-25 | **BATCH 1 COMPLETE** — All 4 domains deep-dived, code-verified, and saved. Ready for user validation + Batch 2. | Session 46 |
| 2026-02-25 | Domain 5 (Subscription Lifecycle) deep-dive: 3 tables mapped, 2 checkout paths, 7 gaps found incl. CRITICAL payout amount bug (full term price per pickup instead of per-week). | Session 46 |
| 2026-02-25 | Domain 6 (Auth & Access Control) deep-dive: 42 service client imports audited, 133 routes with rate limiting, 5 gaps incl. unauthed subscription verify endpoint. | Session 46 |
| 2026-02-25 | Domain 7 (Notification Integrity) deep-dive: 30 types, 47 call sites across 24 files, 5 gaps incl. no email unsubscribe and webhook dedup gaps. | Session 46 |
| 2026-02-25 | Domain 8 (Infrastructure Reliability) deep-dive: 11 cron phases, 12 webhook handlers, CI pipeline, error tracking architecture. 6 gaps incl. no chargeback handler, Sentry likely unconfigured. | Session 46 |
| 2026-02-25 | **ALL 8 DOMAINS COMPLETE** — 62 named workflows, 97 business rules, 34 gaps found, 17 open questions for user. Ready for Phase 3: workflow interactions. | Session 46 |
| 2026-02-26 | User validated MP-R1,R3,R4,R7 ✅. MP-R5 CORRECTED (threshold=displayed price not base). MP-R6,R8 qualified with edge cases. Added MP-W7 tip workflow + 10 tip rules (MP-R19–R28). FIXED Cron Phase 4 tip bug (was using full tip, now uses vendor tip only). | Session 47 |

---

*This file is the persistent reference for the business rules testing protocol. Update it as rules are confirmed, tests written, or questions resolved.*
