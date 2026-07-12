# Event System Audit — Session 68
Date: 2026-04-05

## Purpose
Comprehensive review of event functionality for conflicts and gaps that would block full functionality. Findings will inform test expansion.

---

## BLOCKERS (functionality that will fail in production)

### B-1: Vendor Pickup Mode "Events" tab — dead API parameter
**Files:** `src/app/[vertical]/vendor/pickup/page.tsx:307`, `src/app/api/vendor/orders/route.ts`
**Evidence:** Pickup page fetches `/api/vendor/orders?vertical=${vertical}&event_orders=true` but the vendor orders API (`src/app/api/vendor/orders/route.ts:23-26`) only reads `vertical`, `status`, `market_id`, `pickup_date`, `date_range`. The `event_orders` param is silently ignored — the Events tab will show ALL vendor orders, not event-specific ones.
**Impact:** Events tab shows wrong data. Vendor sees regular daily orders mixed with event orders.
**Fix needed:** API must filter by `market_type = 'event'` when `event_orders=true` is passed.

### B-2: Company-paid order fulfillment path missing
**Files:** `src/app/api/vendor/orders/[id]/fulfill/route.ts`, `src/lib/stripe/payments.ts`
**Evidence:** Grep for `company_paid` or `payment_model` in fulfill route and Stripe payments returns zero matches. The fulfill route attempts Stripe transfer for every order. Company-paid orders (payment_model='company_paid') have no Stripe checkout session — the Stripe transfer will fail or error.
**Impact:** Vendor cannot fulfill company-paid event orders through normal flow. Either the transfer fails silently or throws an error.
**Fix needed:** Fulfill route must skip Stripe transfer when `payment_model = 'company_paid'`. Vendor payout for company-paid events comes from the organizer's settlement, not Stripe.

### B-3: Vendor order cap enforcement not implemented
**Files:** Cart API, checkout flow — no files reference `event_max_orders_total` for enforcement
**Evidence:** `event_max_orders_total` and `event_max_orders_per_wave` are stored on `market_vendors` (set during vendor accept). Wave generation uses `per_wave` to calculate wave capacity. BUT: for attendee-paid events (no wave ordering), there is NO enforcement of the total cap. A vendor could receive unlimited orders.
**Context:** Session 66 attempted to add enforcement to `cart/items/route.ts` and broke the cart. The enforcement was reverted. Decision logged: "must use separate validation endpoint." No separate endpoint was built.
**Impact:** Vendors may receive more orders than they declared capacity for at attendee-paid events.
**Fix needed:** Separate pre-checkout validation endpoint (not in cart API — per critical-path-files rule).

---

## GAPS (incomplete features that limit functionality)

### G-1: `find_next_available_wave()` RPC — defined but never called
**Files:** `supabase/migrations/20260403_111_wave_rpc_functions.sql`
**Evidence:** Grep for `find_next_available_wave` in `apps/web/src` returns zero matches.
**Purpose:** Designed for walk-up attendees to get the next open wave slot. The `walk_up` status exists in the `event_wave_reservations` CHECK constraint but is never set by any code.
**Impact:** Walk-up workflow is not implemented. Day-of attendees without reservations have no path to order at company-paid events.
**Severity:** Low for MVP — walk-ups can be handled manually. Important for events with day-of attendance.

### G-2: `event_company_payments` table — skeleton only
**Files:** `supabase/migrations/20260403_110_event_waves_schema.sql`, `src/app/api/admin/events/[id]/settlement/route.ts:98`
**Evidence:** The table exists and settlement route reads from it (`settlement/route.ts:98`), but no API route writes to it. No UI for recording company payments. No Stripe payment link integration.
**Impact:** Admin cannot track organizer payments through the system. Settlement report shows empty company_payments section.
**Severity:** Medium — can use external tracking (spreadsheet, Stripe dashboard) for MVP, but limits settlement automation.

### G-3: Hybrid payment model — no distinct flow
**Files:** `src/components/events/EventRequestForm.tsx:87`, `src/app/[vertical]/events/[token]/shop/page.tsx:274`
**Evidence:** Form offers `hybrid` as a payment_model option. Shop page logic: `isCompanyPaid = paymentModel === 'company_paid' && waveOrderingEnabled`. Hybrid events would NOT trigger company-paid flow (since `paymentModel !== 'company_paid'`), meaning they'd fall through to attendee-paid flow entirely.
**Impact:** Hybrid events have no split behavior — they're treated as attendee-paid. The company-paid portion of a hybrid event has no implementation.
**Severity:** Low — can document hybrid as "attendee-paid with optional company sponsorship" and handle company portion manually.

### G-4: Event order notifications — company-paid orders skip standard notification flow
**Files:** `src/app/api/events/[token]/order/route.ts`
**Evidence:** The `create_company_paid_order` RPC creates the order in the database but the API route doesn't call `sendNotification()` for vendor order_new or buyer order_confirmed after successful order creation.
**Impact:** Vendors don't get notified of new company-paid orders in real-time. Buyers don't get confirmation notification. Both must check the platform manually.
**Fix needed:** Add `sendNotification()` calls in the order route's success path.

### G-5: Attendee-paid event orders — no event-specific checkout validation
**Files:** `src/app/[vertical]/events/[token]/shop/page.tsx`, cart/checkout flow
**Evidence:** For attendee-paid events, the shop page uses `useCart()` to add items to the standard cart. The items then go through normal checkout. But there's no validation that the event is still accepting orders (status = 'ready' or 'active'), that the event date hasn't passed, or that the vendor is still participating.
**Impact:** Edge case — buyer could have event items in cart, event gets cancelled, buyer still checks out successfully.
**Severity:** Low — unlikely in practice, but creates orphaned event orders.

---

## CONFLICTS (code that contradicts itself or business rules)

### C-1: Phase 11 vertical fallback vs actual vertical
**File:** `src/app/api/cron/expire-orders/route.ts:1993`
**Evidence:** Line 1993: `{ vertical: event.vertical_id || 'food_trucks' }`. The fallback to `food_trucks` only triggers if `vertical_id` is null on the catering_request. Since `catering_requests.vertical_id` is NOT NULL, this fallback should never fire. However, the join path is through markets, and the query at line 1954 selects from catering_requests directly with vertical_id.
**Status:** Not actually a bug — the fallback is dead code but harmless.

### C-2: Phase 14/15 timezone handling — hardcoded America/Chicago
**File:** `src/app/api/cron/expire-orders/route.ts:2217,2247`
**Evidence:** Phase 14 uses `toLocaleString('en-US', { timeZone: 'America/Chicago' })` for date comparison. Phase 15 does the same. Markets have a `timezone` column, but the cron doesn't use it — it assumes all events are in CT.
**Impact:** Events in other US timezones will transition at wrong times (e.g., a West Coast event at 11:59 PM PT gets transitioned at 1:59 AM CT the next day — 2 hours early).
**Severity:** Low for now (all events are TX-based), but a blocker for geographic expansion.

### C-3: Settlement report assumes standard fee structure for all orders
**File:** `src/app/api/admin/events/[id]/settlement/route.ts`
**Evidence:** Settlement calculates fees using `order_items.platform_fee_cents` and `vendor_payout_cents` columns — which are set correctly by the `create_company_paid_order` RPC (6.5% platform fee). But for attendee-paid event orders, the checkout flow sets these via `pricing.ts` logic which uses the standard 6.5% + $0.15 model. These two paths produce different fee structures for the same event.
**Impact:** Mixed payment model events would show inconsistent fee calculations in settlement. Not a financial bug (amounts are correct per-order), but the summary could confuse admins.
**Severity:** Low — numbers are correct at the individual order level.

---

## OBSERVATIONS (not bugs, but worth noting)

### O-1: Event shop page has two completely separate UI flows
The `shop/page.tsx` renders either the wave-selection flow (company-paid) or the cart-based flow (attendee-paid) based on `isCompanyPaid`. These are well-separated with `{!isCompanyPaid && ...}` conditionals. No cross-contamination risk.

### O-2: Wave capacity is a snapshot, not enforced in real-time for attendee-paid
Wave capacity (from `event_max_orders_per_wave`) only matters for company-paid events where wave reservation is required. For attendee-paid events, vendors declare capacity but it's advisory only (see B-3).

### O-3: Backup vendor escalation works but is manual
When a vendor cancels (`/api/vendor/events/[marketId]/cancel`), the code auto-flags the next backup vendor as 'invited'. But it doesn't auto-match a replacement — it just changes the backup's status so admin can send a new invitation.

### O-4: Event feedback goes to buyer_feedback API, not event-specific
`EventFeedbackForm.tsx` posts to `/api/buyer/feedback` — the standard buyer feedback endpoint. This means event feedback is mixed with regular market feedback in the database.

---

## SUMMARY: Priority Fix List

| ID | Type | Severity | Description |
|----|------|----------|-------------|
| B-1 | Blocker | HIGH | Pickup Mode Events tab — `event_orders` param ignored by API |
| B-2 | Blocker | HIGH | Company-paid order fulfillment — Stripe transfer will fail |
| B-3 | Blocker | MEDIUM | Vendor order cap not enforced for attendee-paid events |
| G-4 | Gap | MEDIUM | Company-paid orders don't send notifications |
| G-2 | Gap | LOW | Company payments table has no write path |
| G-1 | Gap | LOW | Walk-up RPC unused (MVP acceptable) |
| G-3 | Gap | LOW | Hybrid payment model has no distinct flow |
| G-5 | Gap | LOW | No event-status validation at checkout for attendee-paid |
| C-2 | Conflict | LOW | Cron event transitions hardcode CT timezone |
