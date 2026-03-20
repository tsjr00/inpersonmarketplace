# Session 62 — Independent Comprehensive Codebase Audit

**Date:** 2026-03-20
**Commit:** `114dcc0` (fixes) + migration 085a/085b (all 3 envs)
**Scope:** Errors, missing business rules, missing tests, high-value opportunities
**Method:** Systematic deep dive — no prior audit reports referenced

---

## Status Key

    FIXED ........... Code change applied this session
    NOT A BUG ....... Investigated, working as designed
    DOCUMENTED ...... Business rule now in decisions.md
    ACCEPTED ........ User confirmed, no change needed
    BACKLOG ......... Queued for future session
    OPEN ............ Still needs attention

---
---

# SECTION 1: ERRORS & CONFLICTS

---

## CRITICAL — Financial Impact / Data Integrity

---

### E-1 — External payment orders don't deduct vendor fees  [NOT A BUG]

**File:** `api/checkout/external/route.ts:276`

**Original concern:** `vendor_payout_cents: itemSubtotal` gives vendor 100%.

**Resolution:** By design. Vendor fees (3.5%) are recorded LATER when vendor
confirms payment received. Non-cash: `confirm-external-payment` route.
Cash: `fulfill` route. Full 5-file flow documented in decisions.md.

> Needs protective tests — see T-7.

---

### E-2 — External payment vendor fees never recorded in ledger  [NOT A BUG]

**File:** `api/checkout/external/route.ts:290-407`

**Original concern:** `recordExternalPaymentFee()` never called from checkout.

**Resolution:** Called downstream — `confirm-external-payment/route.ts:106-123`
(non-cash) and `fulfill/route.ts:153` (cash). Documented in decisions.md.

> User said "if it breaks we lose money" — highest priority for tests.

---

### E-3 — Resolve-issue refund missing buyer fees  [FIXED]

**File:** `api/vendor/orders/[id]/resolve-issue/route.ts`

**Bug:** Refunded `subtotal_cents` only. Buyer paid subtotal + 6.5% +
prorated $0.15 but only got base price back.

**Example:** $10 item in 2-item order — buyer paid $10.72, got refunded
$10.00, lost $0.72.

**Fix:** Now calculates `subtotal + buyerPercentFee + proratedFlatFee`.
Platform absorbs Stripe processing fee. Both documented in decisions.md.

---

### E-4 — Inconsistent refund calculation methods  [PARTIALLY FIXED]

**Files:** reject (correct), buyer-cancel (?), resolve-issue (was wrong),
cron-expire (?)

**Fix:** Resolve-issue now matches reject route formula.

**Still open:** Need to verify buyer-cancel and cron-expire paths use
identical math. Needs tests (see T-2).

---

### E-5 — Admin approval sets legacy tier names  [FIXED]

**File:** `api/admin/vendors/[id]/approve/route.ts:85`

**Bug:** Set `tier = 'basic'` (FT) or `'standard'` (FM) instead of `'free'`.
Every newly approved vendor got a tier that doesn't exist in the unified system.

**Fix:** Now sets `'free'` for all verticals. Notification label updated.

---

### E-6 — Market box missed pickup doesn't process refund  [ACCEPTED]

**File:** `api/cron/expire-orders/route.ts:968-1005`

**Original concern:** Missed pickups don't trigger refunds like regular
orders do.

**Resolution:** User confirmed — desired behavior. Buyer makes a 4-week
prepaid commitment. Missed pickups are the buyer's responsibility.

> Needs decision log entry.

---
---

## HIGH — Functional / Security

---

### E-7 — Admin can invite non-event-approved vendors  [FIXED]

**File:** `api/admin/events/[id]/invite/route.ts:97-108`

**Bug:** Vendor query selected by ID without checking `event_approved = true`.

**Fix:** Added `.eq('event_approved', true)` filter.

---

### E-8 — Cart validation missing vertical scope  [OPEN]

**File:** `api/cart/validate/route.ts` — GET + POST

Neither endpoint validates cart items match the requested vertical.
Cross-vertical cart could theoretically pass validation.

User said explore carefully before changing. Needs investigation of whether
cross-vertical carts can actually be created through the UI.

---

### E-9 — Market box add-to-cart doesn't validate vertical  [OPEN]

**File:** `api/cart/items/route.ts:299-327`

FM cart could receive FT market box offering. No
`offering.vertical_id == request.vertical` check. Same as E-8 — needs
careful exploration.

---

### E-10 — Admin vendor table tier filter uses legacy names  [FIXED]

**File:** `admin/vendors/VendorsTableClient.tsx:221-225`

**Bug:** Dropdown offered Standard/Premium/Featured — removed after tier
unification. Filtering returned zero results.

**Fix:** Now shows Free / Pro / Boss.

---

### E-11 — Admin vendor + listing tier badge colors wrong  [FIXED]

**Files:** `VendorsTableClient.tsx:352-356` + `ListingsTableClient.tsx:301-312`

**Bug:** Colors keyed on `'premium'`/`'featured'`. Pro/Boss vendors displayed
with grey fallback.

**Fix:** Both tables use `'pro'`/`'boss'` color keys. Tier names capitalized.

---
---

## MEDIUM — Edge Cases / UX

---

### E-12 — Migration 085 not applied  [FIXED]

**File:** `supabase/migrations/20260316_085_*.sql`

**Issue:** `ensure_user_profile` RPC, `platform_admin` enum, `regional_admin`
enum — all missing from every environment.

**Fix:** Split into 085a (enum values) + 085b (functions). PostgreSQL
requires enum ADD VALUE to commit before use. Applied to Dev, Staging, & Prod.
Schema snapshot updated.

---

### E-13 — Inventory restore ignores vertical + status  [FIXED]

**File:** `resolve-issue/route.ts:146-149`

**Bug:** Unconditionally restored inventory on refund. FT cooked food can't
be resold after fulfillment.

**Fix:** Now checks vertical + status:

    FM + fulfilled  -->  restore (goods can be resold)
    FT + fulfilled  -->  NO restore (cooked food is gone)
    Any + confirmed -->  restore (item never left vendor)
    Any + pending   -->  restore (item never left vendor)

> Needs protective test — see T-11.

---

### E-14 — Order expiration doesn't notify vendor  [BACKLOG]

**File:** `cron/expire-orders/route.ts:235-251`

Phase 1 only notifies buyer. Vendor doesn't know the order disappeared.
User confirmed vendor should be notified.

---

### E-15 — Event requests accept past dates  [FIXED]

**File:** `api/event-requests/route.ts`

**Bug:** No validation that `event_date >= today`.

**Fix:** Added date validation before insert.

---

### E-16 — Stale notification dedup uses unreliable key  [ACCEPTED]

**File:** `cron/expire-orders/route.ts:805`

Worst case: duplicate "needs attention" notification. User reviewed,
acceptable risk.

---

### E-17 — External buyer flat fee constant  [NOT A BUG]

**File:** `settlement/route.ts:280`

`EXTERNAL_BUYER_FEE_FIXED_CENTS` is set to `0`. Exists for structural
completeness. No math impact.

---

### E-18 — JSONB race condition on document upload  [FIXED]

**File:** `onboarding/category-documents/route.ts`

**Bug:** Read-modify-write on JSONB without locking. Concurrent uploads
could overwrite each other.

**Fix:** Optimistic concurrency — reads `updated_at`, conditionally updates
with match check, retries up to 3 times on conflict.

---

### E-19 — Cart remove endpoint is a stub  [OPEN]

**File:** `api/cart/remove/route.ts:5-18`

Returns `{ success: true }` without doing anything. Dead code — no callers.
Real removal uses `DELETE /api/cart/items/[id]`. User wants more context
before authorizing deletion.

---

### E-20 — Vendor notification titles hardcoded in English  [BACKLOG]

**File:** `notifications/types.ts:325-642`

20+ vendor notifications use string literals. Buyer notifications correctly
use `t()` for i18n.

---

### E-21 — Timezone issues in cron date calculations  [OPEN]

**File:** `expire-orders:919-921,995`

UTC Vercel + `new Date().setHours(h-2)` can cross midnight boundary.
Needs design for centralized timezone utility.

---

### E-22 — Silent geocode failure on browse  [OPEN]

**Files:** Browse page + geocode API

If `?zip=` geocoding fails, browse silently falls back to cookie location.
User sees results for old location. Important system — needs careful
investigation. zip_codes table populated (~33,800 zips).

---

### E-23 — Tip split ambiguity  [NOT A BUG]

**File:** `checkout/session/route.ts:541-547`

Working as designed. Vendor gets tip on food cost. Platform keeps tip on
its fee portion to offset Stripe processing. Documented in Session 40
decisions.md.

---

### E-24 — Where-today missing rate limit  [FIXED]

**File:** `api/trucks/where-today/route.ts`

**Fix:** Added `checkRateLimit()` with `rateLimits.api`.

---

### E-25 — Duplicate UserRole type definition  [OPEN]

**Files:** `auth/roles.ts:9` and `auth/admin.ts:5`

Same type in two files. Simple fix: import from `roles.ts`. Not yet
authorized.

---

### E-26 — FT doc type validation loose  [NOT A BUG]

**File:** `onboarding/category-documents/route.ts:62-66`

Line 62 validates against `FOOD_TRUCK_DOC_TYPES.includes()`. Validation
is correct.

---
---
---

# SECTION 2: MISSING BUSINESS RULES

---

### BR-1 — External payment fee structure  [DOCUMENTED]

Full 5-file flow documented in decisions.md. Rationale: no Stripe processing
cost on external payments = lower fees (3.5% vendor vs 6.5% Stripe).

---

### BR-2 — Refund amount formula  [DOCUMENTED]

Documented in decisions.md:
`subtotal + round(subtotal * 6.5%) + floor($0.15 / totalItems)`.
Still need to verify buyer-cancel and cron-expire match.

---

### BR-3 — Tip allocation  [DOCUMENTED]

Already documented (Session 40 decisions.md). Confirmed correct.

---

### BR-4 — Event approval prerequisites  [OPEN]

E-7 fixed the invite check, but no documented criteria for what grants
`event_approved`. Is COI required? What's the checklist?

---

### BR-5 — Market box missed pickup handling  [ACCEPTED]

Resolved: 4-week prepaid commitment, no refund for missed pickups.
Needs decision log entry.

---

### BR-6 — Trial tier assignment  [FIXED]

Fixed: trial grants `'free'` tier. Needs decision log entry.

---

### BR-7 — Cancellation fee allocation  [OPEN]

No documented percentage for vendor's share when buyer cancels after
confirmation.

---

### BR-8 — Event headcount range (10-5000)  [OPEN]

Hardcoded, no documented justification.

---

### BR-9 — Cross-vertical cart isolation  [OPEN]

Tied to E-8/E-9. No documented rule.

---

### BR-10 — Radius persistence behavior  [OPEN]

Cookie-only vs profile. No documented decision.

---

### BR-11 — FT fulfilled items don't restore inventory  [OPEN — NEW]

Implemented in E-13 but not yet documented. FM items restore after
fulfillment; FT items don't. Needs decision log entry + test.

---
---
---

# SECTION 3: MISSING TESTS

---

## Highest Priority — Protect Revenue and Recent Fixes

---

### T-7 — External payment fee flow  [HIGHEST PRIORITY]

User said "if it breaks we lose money."

Test should cover the full deferred fee flow:

    1. Checkout creates order with vendor_payout_cents = subtotal
    2. confirm-external-payment records fee in vendor_fee_ledger
    3. Cash path records fee at fulfill time
    4. Fee balance accumulates correctly
    5. Auto-deduction caps at 50% of Stripe payouts

---

### T-2 — Refund calculation consistency  [HIGH PRIORITY]

Already had a real bug (E-3).

Test all 4 refund paths produce identical amounts for the same item:

    - reject route
    - buyer-cancel route
    - resolve-issue route (fixed this session)
    - cron-expire route

---

### T-11 — Inventory restore vertical awareness  [HIGH PRIORITY — NEW]

New logic from E-13, zero test protection.

    FT + fulfilled  -->  should NOT restore
    FT + confirmed  -->  should restore
    FM + fulfilled  -->  should restore
    FM + confirmed  -->  should restore

---

### T-3 — Tip split protection

Confirmed correct, but easy to accidentally break.

    vendor tip   = min(tipAmount, subtotal * tipPercent / 100)
    platform tip = tipAmount - vendorTip
    sum must always equal original tip

---
---

## Standard Priority — Coverage Gaps

    T-1  ... Event system lifecycle (zero tests — invites, RSVPs, settlement)
    T-4  ... Cart cross-vertical isolation (tied to E-8/E-9)
    T-5  ... Market box payout lifecycle (.todo() placeholders)
    T-6  ... Concurrent order race conditions (two buyers, last item)
    T-8  ... Order status transitions via API routes
    T-9  ... Admin endpoint access control (reject non-admins)
    T-10 ... Trial system lifecycle (expiry, grace period, conversion)

---

## Partial Coverage — Has Tests But Gaps

    T-12 ... Notification channel filtering (no sendNotification integration test)
    T-13 ... Vendor tier limits (DB trigger not tested against code constants)
    T-14 ... Subscription lifecycle (many .todo() markers remain)
    T-15 ... Stripe idempotency keys (no determinism verification)

---
---
---

# SECTION 4: HIGH-VALUE OPPORTUNITIES

---

## Opportunity 1 — Buyer Interest Geographic Intelligence

**Impact:** Directly accelerates vendor acquisition

`buyer_interests` table captures demand signals (zip codes with zero vendor
results). Data collected, never surfaced.

What it enables:

    - Geographic demand heatmaps
    - Sales ammunition: "47 buyers in your area looking for food trucks"
    - Automated vendor recruitment targeting

Build: Admin dashboard page, sortable by zip/count/date, CSV export,
alerts at 5+ interests per zip.

---

## Opportunity 2 — Vendor Quality System Activation

**Impact:** Reduces buyer frustration, improves vendor ops

Nightly cron generates quality findings (schedule conflicts, ghost listings,
low stock, price anomalies). API routes built. Zero UI visibility.

Build: Vendor dashboard card (top 3 findings + fix buttons). Admin findings
page (sortable, bulk actions).

---

## Opportunity 3 — Trial-to-Paid Conversion Funnel

**Impact:** Direct revenue — every conversion = $25-50/month recurring

Trial system exists but vendors have zero awareness of their status. No
"Day X of 90" banner, no upgrade urgency, no pre-expiry notification.

Build: Dashboard trial banner, upgrade page context, 7-day pre-expiry
notification, admin cohort view.

---

## Opportunity 4 — Vendor Leads Management UI

**Impact:** Prevents warm leads from going cold

Lead capture works, admin gets email, but no management interface. No status
tracking, no follow-up sequences, no conversion tracking.

Build: Admin leads page with sortable table, status dropdown, one-click
outreach, hot-lead flagging.

---
---
---

# SECTION 5: NEW UI BUILT THIS SESSION

---

## Vendor Resolve-Issue UI

**Files:** `components/vendor/OrderCard.tsx` + `[vertical]/vendor/orders/page.tsx`

Red alert box appears on order items with buyer-reported issues. Shows issue
timestamp, description, and "Resolve Issue" button. Dialog offers two paths:

    "I Did Deliver This"  -->  disputes claim, notifies admin
    "Issue Refund"        -->  cancels item, refunds full buyer amount, notifies buyer

Resolved issues show green confirmation with timestamp.

---

## Admin Order Issues Page

**File:** `app/admin/order-issues/page.tsx` — linked from admin sidebar

    - Status filter tabs with counts (New / In Review / Resolved / All)
    - Issue cards: order number, vertical, buyer, vendor, market, amount
    - Issue description highlighted
    - Admin notes display + inline edit
    - Status dropdown (New / In Review / Resolved / Closed)

---
---
---

# ACTION PLAN

---

## Done This Session

    [FIXED]      E-3  -- Resolve-issue refund math
    [FIXED]      E-5  -- Admin approval tier names
    [FIXED]      E-7  -- Event invite event_approved check
    [FIXED]      E-10 -- Admin vendor table tier filter
    [FIXED]      E-11 -- Admin vendor + listing badge colors
    [FIXED]      E-12 -- Migration 085 applied (all 3 envs)
    [FIXED]      E-13 -- Inventory restore vertical logic
    [FIXED]      E-15 -- Event request past date validation
    [FIXED]      E-18 -- JSONB race condition fix
    [FIXED]      E-24 -- Where-today rate limit
    [BUILT]      Vendor resolve-issue UI
    [BUILT]      Admin order issues page
    [DOCUMENTED] External payment fee flow
    [DOCUMENTED] Refund formula
    [DOCUMENTED] Stripe fee absorption policy

---

## Next Priority

    1. T-7  .... External payment fee flow test (protects revenue)
    2. T-2  .... Refund calculation consistency test (had real bug)
    3. T-11 .... Inventory restore vertical test (new logic, unprotected)
    4. T-3  .... Tip split protective test
    5. BR-5, BR-6, BR-11 ... Decision log entries
    6. E-4  .... Verify buyer-cancel + cron-expire refund math
    7. E-8/E-9 . Cart cross-vertical investigation

---

## Later

    E-21 ....... Timezone centralization (design needed)
    E-22 ....... Geocode/browse flow (careful investigation)
    E-25 ....... UserRole type dedup
    E-19 ....... Cart remove stub cleanup
    E-14, E-20 . Backlog items
    BR-4,7,8,9,10 .. Remaining business rules
    Opps 1-4 ... Feature builds

---
---

# SCORECARD

    Total findings ............. 58
    Resolved this session ...... 19
    Still open ................. 21
    Backlog .................... 3
    New items discovered ....... 3 (BR-11, T-11, T-7 reprioritized)
    Files changed .............. 17
    New pages built ............ 2
    Migrations applied ......... 085a + 085b (all 3 environments)
