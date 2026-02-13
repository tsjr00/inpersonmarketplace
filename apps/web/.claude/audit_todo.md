# Platform Audit — Master To-Do List

**Created:** 2026-02-13 (Session 24)
**Source:** Full 6-dimension codebase audit (checkout lifecycle, API routes, database, frontend, integrations, notifications/verticals)
**Status:** Active

> **INSTRUCTIONS:** Remove items from this list when completed AND confirmed functional (tested on staging or dev). When all items are completed, delete this file. Future audits should read this file first to avoid duplicating work and to confirm completeness.

---

## TIER 1: CRITICAL — Fix Before Accepting Real Payments

### C1. Double Payout on Mutual Confirmation Race Condition
- **Area:** Checkout/Order Lifecycle
- **Risk:** Vendor paid twice per order
- **Root cause:** Buyer confirm route (`src/app/api/buyer/orders/[id]/confirm/route.ts`) creates a second Stripe transfer when it detects `status === 'fulfilled'` (vendor already transferred)
- **Also affects:** `src/app/api/vendor/orders/[id]/fulfill/route.ts`
- **Fix:** Check `vendor_payouts` for existing completed transfer before initiating a new one
- [x] Implement fix (Session 24 — query vendor_payouts before transfer in buyer confirm route)
- [ ] Test: vendor fulfills first, then buyer confirms — verify single transfer
- [ ] Test: buyer confirms first, then vendor fulfills — verify single transfer
- [ ] Confirmed on staging

### C2. Orphaned Fulfillment — Order Marked Complete But Vendor Never Paid
- **Area:** Checkout/Order Lifecycle
- **Risk:** DB updated to 'fulfilled' before Stripe transfer; if transfer fails, no retry
- **File:** `src/app/api/vendor/orders/[id]/fulfill/route.ts`
- **Fix:** Wrap transfer in try/catch — revert status on failure. Create `pending_transfer` payout records. Add retry cron job.
- [x] Implement try/catch + status revert (Session 24 — reverts to 'ready' on transfer failure)
- [ ] Add `pending_transfer` payout status (deferred — H3)
- [ ] Create `/api/cron/retry-failed-payouts` cron job (deferred — H3)
- [ ] Confirmed on staging

### C3. Cancellation Fee Calculation Double-Counts Flat Fee
- **Area:** Checkout/Order Lifecycle
- **Risk:** Platform retains too much on partial cancellations
- **File:** `src/app/api/buyer/orders/[id]/cancel/route.ts`
- **Fix:** Prorate flat fee across total items in order instead of charging full flat fee per item
- [x] Implement fix (Session 24 — Math.round(flatFee / totalItemsInOrder) per item)
- [ ] Confirmed on staging

### ~~C4. Market Box Missed Pickup Has No Refund or Extension~~
- **Status:** BY DESIGN — Buyer and vendor work it out directly. Platform not in the middle.
- **Resolved:** 2026-02-13 (Session 24) — No code change needed.

### C5. Two Availability Systems Can Disagree on Cutoff
- **Area:** Order Cutoff
- **Risk:** Browse shows "Add to Cart" but checkout rejects (RPCs didn't exist — checkout always accepted)
- **Files:** `src/lib/utils/listing-availability.ts` (JS) vs `is_listing_accepting_orders()` (RPC — missing)
- **Fix:** Consolidated to JS calculation everywhere. Cart validate now uses `processListingMarkets()`.
- [x] Audit: RPCs never existed, cart validation defaulted to true (Session 24)
- [x] Consolidate: cart/validate now uses JS `processListingMarkets()` (Session 24)
- [x] Single source of truth: `listing-availability.ts` used by browse AND cart
- [ ] Confirmed on staging

### C6. `carts.vertical_id` FK Type Mismatch (UUID vs TEXT)
- **Area:** Database Schema
- **Risk:** Food trucks checkout silently broken — all other tables use TEXT
- **Fix:** Migration 017 to alter column UUID→TEXT, update FK to reference `verticals.vertical_id`
- [x] Create migration (`20260213_017_fix_carts_vertical_id_type.sql`)
- [ ] Apply to Dev + Staging
- [ ] Confirmed functional

### C7. Email Branding Hardcoded "Farmers Marketing" for All Verticals
- **Area:** Notifications / External Integrations
- **Risk:** Food truck buyers get "Farmers Marketing" emails
- **File:** `src/lib/notifications/service.ts`
- **Fix:** Use `defaultBranding[vertical].brand_name` for sender name + template header/footer
- [x] Update sender name (Session 24)
- [x] Update email header (Session 24)
- [x] Update email footer (Session 24)
- [ ] Test with food_trucks vertical
- [ ] Confirmed on staging

### C8. 17 Notification Calls Missing Vertical Parameter (across 11 files)
- **Area:** Notifications
- **Risk:** Wrong branding, wrong action URLs for non-farmers-market verticals
- [x] All 17 sendNotification calls updated with `{ vertical }` (Session 24):
  - `/api/vendor/orders/[id]/confirm` — added `vertical_id` to orders select
  - `/api/vendor/orders/[id]/ready` — added `vertical_id` to orders select
  - `/api/vendor/orders/[id]/reject` (2 calls) — added `vertical_id` to orders select
  - `/api/vendor/orders/[id]/confirm-external-payment` (3 calls) — `order.vertical_id`
  - `/api/vendor/orders/[id]/confirm-handoff` — added `vertical_id` to orders select
  - `/api/vendor/orders/[id]/fulfill` — added `vertical_id` to orders select
  - `/api/buyer/orders/[id]/cancel` — added `vertical_id` to orders select
  - `/api/buyer/orders/[id]/confirm` — added `vertical_id` to orders select
  - `/api/buyer/orders/[id]/report-issue` — added `vertical_id` to orders select
  - `/api/vendor/market-boxes/pickups/[id]` (3 calls) — `offering.vertical_id`
  - `/api/buyer/market-boxes/[id]/confirm-pickup` — `offering.vertical_id`
  - `/api/cron/expire-orders` (2 calls) — added `vertical_id` to orders select
  - `/api/vendor/market-boxes/pickups/[id]/skip` — already had vertical (skipped)
- [ ] Confirmed on staging

### C9. Legacy Admin Approve Route Bypasses Notification Service
- **Area:** Notifications
- **Risk:** Vendor approval only creates in-app notification (no email/SMS/push)
- **File:** `src/app/api/admin/vendors/[id]/approve/route.ts`
- **Fix:** Replaced raw INSERT with `sendNotification('vendor_approved', ...)` with vertical param
- [x] Route still used — replaced raw INSERT with sendNotification() (Session 24)
- [ ] Confirmed on staging

---

## TIER 2: HIGH — Fix Before Public Launch

### H1. `force-dynamic` on Vertical Layout Kills All Caching
- **Area:** Frontend Performance
- **File:** `src/app/[vertical]/layout.tsx`
- **Fix:** Remove `force-dynamic`. Use `revalidate` on individual pages.
- [ ] Remove force-dynamic
- [ ] Add appropriate revalidate to key pages (browse, help, how-it-works)
- [ ] Verify auth still works in header
- [ ] Confirmed on staging

### H2. Market Box Subscription Capacity Check Race Condition
- **Area:** Market Boxes
- **File:** `src/app/api/buyer/market-boxes/route.ts` (lines 247-270)
- **Fix:** Atomic RPC `subscribe_to_market_box_if_capacity` (check + insert in one transaction)
- [ ] Create RPC function
- [ ] Update route to use RPC
- [ ] Test concurrent subscriptions
- [ ] Confirmed on staging

### H3. No Stripe Transfer Retry Mechanism
- **Area:** Payments
- **Fix:** Create `pending_transfer` payout records + cron job with exponential backoff
- **Note:** Overlaps with C2 fix — implement together
- [ ] Implement (see C2)
- [ ] Confirmed on staging

### H4. Missing FK Indexes on High-Traffic Tables
- **Area:** Database Performance
- **Missing indexes on:** `listings.vendor_profile_id`, `order_items.listing_id`, `order_items.vendor_profile_id`, `cart_items.listing_id`, `vendor_payouts.order_item_id`, `market_box_subscriptions.offering_id`, `market_vendors.vendor_profile_id`
- [ ] Create migration with all missing indexes
- [ ] Apply to Dev + Staging
- [ ] Verify query plan improvements (EXPLAIN)
- [ ] Confirmed functional

### H5. Soft Delete Columns Exist But Never Filtered
- **Area:** Database / Data Integrity
- **Tables:** `user_profiles.deleted_at`, `vendor_profiles.deleted_at`, `organizations.deleted_at`
- **Fix:** Add `.is('deleted_at', null)` to all routes querying these tables (15-20 routes)
- [ ] Audit all routes touching these tables
- [ ] Add filters
- [ ] Confirmed on staging

### H6. `Request` Type Instead of `NextRequest` in 16+ Routes
- **Area:** API Security
- **Fix:** Change handler signatures from `Request` to `NextRequest`
- [ ] Find all affected routes
- [ ] Update signatures
- [ ] Confirmed builds successfully

### H7. Inconsistent Admin Authorization Patterns
- **Area:** API Security
- **Example:** `/api/admin/vendors/[id]/reject` only checks `role` column, not `roles` array
- **Fix:** Replace all inline admin checks with `verifyAdminForApi()` or `hasAdminRole()`
- [ ] Audit all admin routes
- [ ] Standardize to centralized helper
- [ ] Confirmed on staging

### H8. RLS Policies Using Bare `auth.uid()` (31+ instances)
- **Area:** Database Performance
- **Fix:** Migration to drop/recreate affected policies with `(SELECT auth.uid())`
- [ ] Query database for remaining bare auth.uid() in active policies
- [ ] Create cleanup migration
- [ ] Apply to Dev + Staging
- [ ] Confirmed functional

### H9. Notifications Sent Before Stripe Operations Complete
- **Area:** Order Lifecycle
- **Fix:** Reorder in fulfill/confirm routes: DB update → Stripe transfer → notification
- [ ] Update vendor fulfill route
- [ ] Update buyer confirm route
- [ ] Confirmed on staging

### H10. No External Error Monitoring
- **Area:** Infrastructure / Observability
- **Fix:** Add Sentry or similar. Connect to `withErrorTracing()`.
- [ ] Choose provider (Sentry free tier = 5k events/month)
- [ ] Integrate with error tracing wrapper
- [ ] Confirmed receiving errors in dashboard

### H11. Missing NOT NULL Constraints on Audit Columns
- **Area:** Database / Data Integrity
- **Columns:** `vendor_profiles.created_at/status/tier`, `order_items.created_at`, `markets.created_at`
- **Fix:** Backfill NULLs, add NOT NULL + DEFAULT constraints
- [ ] Query for NULL counts per column
- [ ] Create backfill + constraint migration
- [ ] Apply to Dev + Staging
- [ ] Confirmed functional

---

## TIER 3: MEDIUM — Fix in Next Sprint

- [ ] **M1.** No Suspense boundaries or `loading.tsx` files — blank screen during data loading
- [ ] **M2.** Client-side data fetching where server components would work (analytics, vendor orders, admin pages)
- [ ] **M3.** Report aggregation in JavaScript (O(n^2) loops) — already planned in Migration 016
- [ ] **M4.** No transaction safety for multi-table writes (checkout, confirmation, cancellation)
- [ ] **M5.** Service worker is push-only — no offline support despite PWA installability
- [ ] **M6.** `console.error()` instead of structured tracing in 15+ routes
- [ ] **M7.** `manifest.json` hardcoded to "Farmers Marketing" — food trucks PWA installs wrong
- [ ] **M8.** Raw `<img>` tags in ListingImageUpload, MarketBoxImageUpload, OrderCard (no next/image)
- [ ] **M9.** Confirmation window expiry doesn't notify buyer (they think pickup confirmed)
- [ ] **M10.** In-memory rate limiting not distributed (bypassed across Vercel instances)
- [ ] **M11.** No notification retry / dead letter queue — failed sends lost forever
- [ ] **M12.** Missing `vertical_id` filters in admin report user lookups (cross-vertical buyer names)

---

## TIER 4: LOW — Polish / Technical Debt

- [ ] **L1.** Massive single-file components (vendor/markets 2007 lines, checkout 1453 lines)
- [ ] **L2.** NotificationBell triggers 3+ API calls on navigation (debounce needed)
- [ ] **L3.** localStorage cart migration code still present in useCart hook
- [ ] **L4.** Cart refetches on every vertical change without debounce
- [ ] **L5.** Missing `error.tsx` boundaries on key pages
- [ ] **L6.** Cron routes use direct Supabase client instead of `createServiceClient()`
- [ ] **L7.** JSON body parsing not try/caught in 3+ routes
- [ ] **L8.** Inconsistent response JSON shapes across API
- [ ] **L9.** Duplicate order detection uses string concat (collision risk with null values)
- [ ] **L10.** Order number uses 5 random digits (collision at scale)
- [ ] **L11.** 1 SECURITY DEFINER function missing `SET search_path`
- [ ] **L12.** RLS recursion risk on user_profiles undocumented
- [ ] **L13.** Stripe API version string `2025-12-15.clover` — verify valid
- [ ] **L14.** Over-selecting JSONB `profile_data` in report queries
- [ ] **L15.** Memoization insufficient (35 useMemo/useCallback across entire app)

---

## Completion Tracking

| Tier | Total | Implemented | Needs Staging | Remaining |
|------|-------|-------------|---------------|-----------|
| Critical (C1-C9) | 9 | 8 (C4=by design) | 7 | 0 |
| High (H1-H11) | 11 | 0 | 0 | 11 |
| Medium (M1-M12) | 12 | 0 | 0 | 12 |
| Low (L1-L15) | 15 | 0 | 0 | 15 |
| **Total** | **47** | **8** | **7** | **38** |

> When all items completed and confirmed: delete this file.
