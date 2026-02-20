# Session 36 — Comprehensive Systems Audit Report
# Date: 2026-02-19
# Status: AUDIT COMPLETE — Tracking fixes below

---

## HOW TO USE THIS FILE

This is the **master todo list** for all audit findings. After each fix:
1. Check the box `[ ]` → `[x]`
2. Add the commit hash next to it
3. Update `current_task.md` with progress summary

After context compaction, Claude should read THIS FILE to see what's been done and what remains.

---

## METHODOLOGY

- 5 deep exploration agents (frontend, checkout/payment, infrastructure, API routes, vendor onboarding)
- 20+ key source files read directly
- Full schema snapshot analysis (46 tables, 80+ functions, 30+ triggers)
- ~120 API routes audited
- Focus: Food Truck vertical go-to-market readiness

---

## WHAT'S WORKING WELL

- **Terminology system** — well-designed, comprehensive, properly falls back
- **Design token theming** — CSS var approach is clean and maintainable
- **4-channel notification system** — 19 types, proper channel selection, never throws
- **Pricing as single source of truth** — `pricing.ts` is well-structured
- **Vendor tier differentiation** — FM vs FT tiers are properly separated
- **Rate limiting presets** — good coverage even if a few routes are missing them
- **Error tracing system** — `withErrorTracing` + breadcrumbs is production-grade
- **Security headers** — CSP, HSTS, X-Frame-Options all configured properly
- **Attendance data flow** — FT-specific vendor scheduling is well-implemented
- **Stripe Connect integration** — idempotency keys, Connect account linking, webhook handling

---

## PHASE 1: FINANCIAL SAFETY (Before ANY Real Transactions)

> These items affect money flow. Every dollar must be traceable from buyer to vendor.

- [x] **C1: Tips Never Reach Vendors** ✅ FIXED
  - Location: `fulfill/route.ts`, `confirm-handoff/route.ts`
  - Problem: Tips charged to buyers via Stripe, stored in `orders.tip_amount`, but at payout time vendors are paid only `orderItem.vendor_payout_cents` (calculated from listing subtotal only). No code routes tip to vendor.
  - Impact: Food truck vendors will never receive their tips. Money collected but not distributed.
  - Fix: At payout time, add tip amount (prorated across items if multi-vendor) to the Stripe transfer amount. Per Session 28 decision, Stripe processing fee on tip deducted from tip itself.
  - Estimated: ~15 lines across 2 files

- [x] **C2: Double-Payout Race in fulfill/route.ts** ✅ FIXED
  - Location: `vendor/orders/[id]/fulfill/route.ts` lines 166-193
  - Problem: Does NOT check for existing `vendor_payouts` record before initiating Stripe transfer. Two simultaneous requests can both initiate transfers.
  - Impact: Stripe idempotency key prevents duplicate Stripe transfers, but duplicate DB rows in `vendor_payouts` may be created.
  - Fix: Add `vendor_payouts` existence check (matching pattern already in `buyer/orders/[id]/confirm/route.ts`).
  - Estimated: ~5 lines

- [x] **C3: Double-Payout Race in confirm-handoff/route.ts** ✅ FIXED
  - Location: `vendor/orders/[id]/confirm-handoff/route.ts`
  - Problem: Same as C2 — no payout existence check before `transferToVendor`.
  - Fix: Same pattern — check `vendor_payouts` first.
  - Estimated: ~5 lines

- [x] **H1: Vendor Rejection Refunds Wrong Amount** ✅ FIXED
  - Location: `vendor/orders/[id]/reject/route.ts` line 110, 136
  - Problem: Refunds `subtotal_cents` only, not buyer's actual paid amount (`subtotal * 1.065 + prorated_flat_fee`). Buyer loses their 6.5% fee when vendor rejects.
  - Impact: Buyers are shortchanged on vendor-initiated cancellations. Trust destroyer + chargeback risk.
  - Fix: Refund `buyerPaidForItem` (subtotal + buyer percentage fee + prorated flat fee).

- [x] **H20: Phase 1 Cron Refunds Subtotal Only on Auto-Expiry** ✅ FIXED
  - Location: `cron/expire-orders/route.ts` Phase 1
  - Problem: Same as H1 — expired items refund `subtotal_cents`, not buyer's full paid amount.
  - Fix: Refund full buyer-paid amount. Same calculation as H1 fix.

- [x] **H6: Flat Fee Not Deducted from Vendor Payout Per Item** ✅ FIXED
  - Location: `checkout/session/route.ts` lines 494-496
  - Problem: `vendor_payout_cents` per order item = `subtotal - 6.5%` (no flat fee). The $0.15 flat fee is accounted at order level but not distributed to items. Platform absorbs flat fee.
  - Impact: Revenue leakage — platform loses $0.15 per order.
  - Fix: Prorate flat fee across items: `Math.round(STRIPE_CONFIG.buyerFlatFeeCents / totalItemsInOrder)` deducted from each item's `vendor_payout_cents`.

- [x] **H2: External Checkout Skips Inventory Decrement** ✅ FIXED
  - Location: `api/checkout/external/route.ts`
  - Problem: Creates orders/items but never calls `atomic_decrement_inventory`. Multiple buyers can order the same last unit.
  - Fix: Call `atomic_decrement_inventory` after order creation, same as Stripe checkout path.

- [x] **H3: External Checkout Skips Cutoff Validation** ✅ FIXED
  - Location: `api/checkout/external/route.ts`
  - Problem: Does not call `is_listing_accepting_orders` or validate cutoff time.
  - Fix: Add cutoff validation matching Stripe checkout path.

- [x] **H16: Subscription Downgrade — Stripe vs DB Out of Sync** ✅ FIXED
  - Downgrade routes no longer change DB tier immediately. Set `subscription_status: 'canceling'`. Actual tier downgrade happens via `handleSubscriptionDeleted` webhook when billing period ends. No refund (user decision).

---

## PHASE 2: SECURITY & DATA INTEGRITY

> These items prevent data leakage, cross-vertical contamination, and security gaps.

- [x] **C6: Module-Level Supabase Clients (Auth Context Leak)** ✅ FIXED
  - Location: `/api/submit/route.ts` and `/api/vertical/[id]/route.ts`
  - Problem: Both create Supabase clients at module import time (not per-request). In serverless warm instances, these persist across requests and can leak auth context.
  - Fix: Refactor both to use per-request `createClient()` inside the handler.

- [x] **C4: Market Detail Page Missing Vertical Filter** ✅ FIXED
  - Location: `src/app/[vertical]/markets/[id]/page.tsx` line 32
  - Problem: `.eq('id', id)` without `.eq('vertical_id', vertical)`. Any market UUID accessible from any vertical URL.
  - Fix: Add `.eq('vertical_id', vertical)`.

- [x] **C5: Payout Enum Values Missing from DB** ✅ VERIFIED 2026-02-19
  - RESOLVED — Both `skipped_dev` and `pending_stripe_setup` are in the enum. Migration 035 worked.

- [x] **H12: Onboarding APIs Have No Vertical Filter (Multi-Vertical Bug)** ✅ FIXED
  - Location: 6 routes confirmed: `onboarding/status`, `documents`, `coi`, `category-documents`, `acknowledge-prohibited-items`, plus Stripe onboard
  - Problem: All query `vendor_profiles` with `.eq('user_id', user.id).single()` — no vertical_id filter. Multi-vertical vendors get wrong profile.
  - Fix: Add `.eq('vertical_id', vertical)` to all. The `vertical` should come from URL params or request body.
  - Estimated: 1 line per route, ~10 routes total. **Highest ROI single task.**

- [x] **H13: Stripe Connect Onboard API Has No Vertical Filter** ✅ FIXED
  - Location: `/api/vendor/stripe/onboard/route.ts` lines 26-33
  - Problem: Same pattern as H12 — `.single()` without vertical filter.
  - Fix: Add `.eq('vertical_id', vertical)`.

- [x] **H18: `/api/submit` Route — No Auth, No Rate Limit, No Error Tracing** ✅ VERIFIED 2026-02-19
  - RESOLVED — Already has `withErrorTracing` (from C6 fix) and `rateLimits.submit`. No additional changes needed.

- [x] **H17: Admin Role Check Inconsistency in 7 Routes** ✅ FIXED
  - Location: See full list in findings
  - Problem: Inline `role === 'admin'` instead of `hasAdminRole()`. Misses `platform_admin` role.
  - Fix: Replace all with `hasAdminRole()` or `verifyAdminForApi()`. Batch fix.

- [x] **H4: Vendor Notifications Fire on Every Success Page Hit** ✅ FIXED
  - Location: `api/checkout/success/route.ts` lines 303-354
  - Problem: `sendNotification` calls are OUTSIDE the `if (!existingPayment)` idempotency block.
  - Fix: Move notification calls inside the idempotency guard.

- [x] **H5: Market Box Webhook Uses Direct INSERT (No Capacity Check)** ✅ FIXED
  - Both `handleMarketBoxCheckoutComplete()` and `handleCheckoutComplete()` unified path now use `subscribe_to_market_box_if_capacity` RPC.

- [x] **M10: `get_or_create_cart` Called with UUID vs TEXT Slug** ✅ FIXED
  - 3 checkout routes now pass TEXT slug directly. Removed unnecessary UUID lookup in confirm-external-payment.

- [x] **M17: Schema Snapshot CHECK Constraint May Be Stale (FT Tiers)** ✅ VERIFIED 2026-02-19
  - RESOLVED — Actual DB constraint includes `free`, `basic`, `pro`, `boss`. Only the schema snapshot was stale.

---

## PHASE 3: VENDOR EXPERIENCE & OPERATIONAL READINESS

> These items affect the vendor journey and day-to-day operations.

- [x] **C7: Vendor Analytics 100% BROKEN — Legacy `transactions` Table Never Written To** ✅ FIXED (rewrote all 4 routes to use order_items)
  - Location: 4 routes: `vendor/analytics/overview`, `top-products`, `customers`, `trends`
  - Problem: **CONFIRMED** — `transactions` table has ZERO writes anywhere in the codebase. All 4 analytics routes read from it, but the order flow writes to `orders` + `order_items`. Vendor analytics will always show empty data.
  - Fix: Rewrite all 4 analytics routes to query `orders` + `order_items` instead of `transactions`. The `trends` route already uses an RPC (`get_vendor_revenue_trends`) which may or may not query `transactions` internally — verify that too.

- [x] **H14: canPublish Null Race Condition** ✅ FIXED
  - Location: `ListingForm.tsx`
  - Problem: `canPublish` initializes to `null`. Submit handler allows publish while state is `null`.
  - Fix: Initialize `canPublish` to `false`. 1-line fix.

- [x] **H15: Stripe Connect Not Part of Onboarding Gates** ✅ FIXED
  - Added Gate 4 (Stripe Connect) to onboarding status API. `canPublishListings` now requires `stripe_payouts_enabled`. ListingForm shows "Stripe Connect setup required" block reason. Progress bar includes Gate 4.

- [x] **H7: Listing Count Limits Not Enforced at API Level** ✅ MIGRATION WRITTEN
  - DB trigger `enforce_listing_tier_limit` in migration 036. Fires BEFORE INSERT/UPDATE on listings when status→active. Pending application to environments.

- [x] **H8: `new_vendor_application` Notification Never Triggered** ✅ FIXED
  - Problem: Notification type exists but no code sends it. Admins must poll.
  - Fix: Call `sendNotification` in `submit/route.ts` after profile creation.

- [x] **H9: `market_approved` Bypasses Notification Service** ✅ FIXED
  - Replaced raw DB insert with `sendNotification()`. Now sends via all 4 channels.

- [x] **H10: Test Components Page Accessible in Production** ✅ FIXED
  - Added `useEffect` redirect to `/` when `NODE_ENV === 'production'`.

- [x] **H11: About Page Contact Form is Stub** ✅ FIXED
  - Removed non-functional form. Replaced with `support@815enterprises.com` mailto link.

- [x] **H19: Cron Phase 4 — No-Show Items Fulfilled Without Paying Vendor** ✅ FIXED
  - Phase 4 now initiates vendor payout (including tip share) for no-show items. Double-payout check included. Failed transfers recorded for Phase 5 retry. Buyer notified to contact vendor for resolution.

- [ ] **M19: Image Upload Not Available on Listing Creation**
  - Problem: Requires save → edit → add images. High friction for new vendors.
  - Fix: Allow upload on create, or auto-redirect to edit after save.

- [ ] **M20: Market Association Failure Silently Swallowed**
  - Location: `ListingForm.tsx` lines 303-308
  - Problem: If `listing_markets` insert fails, listing saves but buyers can't find it.
  - Fix: Surface error to vendor or roll back listing on market association failure.

---

## PHASE 4: QUALITY & POLISH

> These items improve code quality, performance, and UX but aren't blockers.

### Medium Priority
- [ ] **M1**: Admin layout redirects to `/login` without vertical context
- [x] **M2**: Admin layout uses manual role check instead of `hasAdminRole()`
- [ ] **M3**: Checkout page has ~20 hardcoded hex values including non-brand purple
- [ ] **M4**: `vendor/markets/page.tsx` has 152 hardcoded hex values
- [x] **M5**: Vendor dashboard has 5 sequential DB queries (should be `Promise.all`)
- [ ] **M6**: `any` type usage in 41 files
- [ ] **M7**: No React error boundaries anywhere
- [ ] **M8**: Rate limiter is per-serverless-instance (in-memory)
- [x] **M9**: `canAddTraditionalMarket` missing vertical parameter
- [ ] **M11**: Email template hardcoded `#166534` fallback color
- [ ] **M12**: `can_vendor_publish()` DB function never called from application code
- [x] **M13**: Duplicate `VENDOR_LIMITS` in `constants.ts` vs `vendor-limits.ts`
- [ ] **M14**: `constants.ts` TIER_BADGES has hardcoded hex values
- [x] **M15**: 15 routes missing rate limiting (12 added, 3 excluded: 2 cron + 1 webhook)
- [x] **M16**: 3 routes missing `withErrorTracing` (including vendor confirm order)
- [ ] **M18**: File upload in vendor signup is dead-end (only saves filename)
- [ ] **M21**: Vendors can access markets page before approval
- [ ] **M22**: Market Boxes card shown to free-tier FT vendors who can't use it
- [ ] **M23**: Analytics gating for FT tiers not implemented (Steps 7-9 pending)
- [ ] **M24**: N+1 query patterns in 5 API routes
- [x] **M25**: ZIP_LOOKUP table duplicated in 2 files
- [ ] **M26**: Hardcoded configurable values in 6 routes
- [ ] **M27**: Transfer failure revert can leave item in fulfilled state with no retry

### Low Priority
- [ ] **L1**: 7 files use raw `<img>` instead of `next/image`
- [ ] **L2**: 5 accessibility issues with empty `alt=""` on meaningful images
- [ ] **L3**: 60+ `console.log/error/warn` calls (some debug artifacts)
- [ ] **L4**: Legacy `/api/cart/add` route exists (dead code — never persists to DB)
- [ ] **L5**: Order number collision risk (5 random digits, ~0.5% at 100K orders/year)
- [ ] **L6**: Vendor confirm route doesn't check current item status before confirming
- [ ] **L7**: Failed Stripe refunds return success to client with no retry mechanism
- [ ] **L8**: CSP includes `unsafe-inline` (Next.js requirement, but worth noting)
- [ ] **L9**: Stripe API version pinned to preview/beta (`.clover` suffix)
- [ ] **L10**: No domain-based routing in middleware
- [ ] **L11**: `fire_works` vertical has no terminology config
- [ ] **L12**: No automated test suite
- [ ] **L13**: DateRangePicker fallback color is blue (should be FM green `#8BC34A`)
- [ ] **L14**: ShopperFeedbackForm "Market Policies" is FM-specific language
- [ ] **L15**: `lucide-react` caret versioning on pre-1.0 package

---

## END-TO-END WORKFLOW BLOCKERS

### Food Truck Order Flow (Primary Focus)
| Step | Status | Blocker(s) |
|------|--------|------------|
| Buyer browses | OK | — |
| Buyer adds to cart | OK | — |
| Buyer checks out (Stripe) | BROKEN | Tips collected but never forwarded (C1) |
| Buyer checks out (External) | BROKEN | No inventory decrement (H2), no cutoff check (H3) |
| Vendor receives notification | DEGRADED | Duplicate notifications on page refresh (H4) |
| Vendor confirms order | OK | — |
| Vendor marks ready | OK | — |
| Vendor/buyer complete handoff | RISK | Double-payout race exists (C2, C3) |
| Vendor receives payout | BROKEN | Flat fee not deducted (H6), tips not included (C1) |
| Buyer cancels | DEGRADED | Vendor rejection refunds wrong amount (H1) |
| No-show buyer | BROKEN | Cron marks fulfilled but vendor never paid (H19) |

### Vendor Onboarding Flow
| Step | Status | Blocker(s) |
|------|--------|------------|
| Vendor signs up | DEGRADED | File upload dead-end (M18), no admin notification (H8) |
| Three-gate onboarding | BROKEN | No vertical filter on status API (H12) |
| Admin reviews/approves | OK | — |
| Vendor notified of approval | OK | Individual gate approvals don't notify |
| Stripe Connect setup | RISK | Not part of gates (H15), no vertical filter (H13) |
| Vendor creates listings | RISK | Tier limits not API-enforced (H7), canPublish race (H14) |
| Vendor publishes | OK | DB constraints enforce, but `can_vendor_publish()` not called |
| Image upload | DEGRADED | Only available in edit mode, not create (M19) |

### Market Box / Chef Box Flow
| Step | Status | Blocker(s) |
|------|--------|------------|
| Vendor creates box | OK | — |
| Buyer subscribes (success page) | OK | Capacity check via RPC |
| Buyer subscribes (webhook) | RISK | Direct INSERT, no capacity check (H5) |

---

## STRATEGIC RECOMMENDATIONS

### 1. "Missing Vertical Filter" Pattern Is Systemic
At least 10+ routes have `.eq('user_id', user.id).single()` without `.eq('vertical_id', vertical)`. **Single sweep** with grep is the highest-ROI task — fixes C4, H12, H13, and prevents future multi-vertical bugs. Estimated: 2-3 hours.

### 2. Server-Side Validation Layer Is Almost Absent
Client-side JS validation (bypassable) + DB constraints (limited). Need at minimum: server-side publish validation, tier limit enforcement, input sanitization on POST routes. Not a grand framework — just targeted checks.

### 3. Vendor Onboarding Has No "Done" Signal
3-gate system is built but vendor has no "Submit for Review" button + admin gets no notification. Dead zone where vendors finish gates and wait. Fix H8 + add submit button.

### 4. Financial Flows Need a Pre-Launch Trace
Tips, flat fee, rejection refunds — each is a trust issue. Dedicated pass tracing every dollar from buyer checkout to vendor payout, verifying math at each step.

### 5. Go-to-Market Minimum Viable Checklist
To ship FT to real users, the **absolute minimum**:
1. Fix Phase 1 (financial safety)
2. Fix H12 (vertical filter sweep)
3. Fix H14 (canPublish race)
4. Fix H15 (Stripe in onboarding gates or warning)
5. Verify C5 (CHECK constraint in staging DB)
6. Verify C7 (transactions table populated or not)
7. One end-to-end test: signup → onboard → list → buyer purchases → vendor fulfills → payout

---

## PROGRESS LOG

| Date | Items Fixed | Commit | Notes |
|------|-------------|--------|-------|
| 2026-02-19 | Audit created | — | 7 Critical, 20 High, 27 Medium, 15 Low |
| 2026-02-19 | C5 verified RESOLVED | — | Payout enum has both values. Migration 035 worked. |
| 2026-02-19 | M17 verified RESOLVED | — | Tier CHECK includes free/basic/pro/boss. Snapshot stale only. |
| 2026-02-19 | C7 CONFIRMED BROKEN | — | `transactions` table has 0 writes in codebase. Analytics 100% broken. |
| 2026-02-19 | C1-C7 critical fixes | ffdd0de | Tips, double-payout, analytics rewrite, security |
| 2026-02-19 | H1-H17 high priority | 7fc84f3 | Refunds, fees, vertical filters, admin roles, notifications |
| 2026-02-19 | H5,H7,H9-H11,H18,M10 | 7dea597 | Wave 1+2: webhook RPC, tier trigger, notifications, cart UUID fix |
| 2026-02-19 | H15,H16,H19 | (pending) | Wave 3: Stripe Gate 4, downgrade timing, no-show vendor payout |
