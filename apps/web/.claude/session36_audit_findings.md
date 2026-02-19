# Session 36 — Comprehensive Systems Audit Findings
# Date: 2026-02-19
# Status: COMPLETE (ALL 5 agents completed)

## AUDIT METHODOLOGY
- Read all context files (CLAUDE.md, CLAUDE_CONTEXT.md, SCHEMA_SNAPSHOT.md, current_task.md, MEMORY.md)
- Launched 5 deep exploration agents in parallel:
  1. **Frontend pages/components** (a8d2ca6) — COMPLETE
  2. **Checkout/payment flows** (a38370e) — COMPLETE
  3. **Lib/config/infrastructure** (a02b396) — COMPLETE
  4. **API routes** (a236630) — COMPLETE (output collected before compaction)
  5. **Vendor onboarding** (a2ffb26) — COMPLETE
- Directly read ~25 key files including pricing.ts, vendor-limits.ts, design-tokens.ts, notifications/service.ts, middleware.ts, next.config.ts, stripe/connect.ts, checkout/success/route.ts, webhooks/stripe/route.ts

---

## CRITICAL FINDINGS (Must Fix Before Launch)

### C1: Tips Never Reach Vendors
- **Location**: `fulfill/route.ts`, `confirm-handoff/route.ts`
- **Problem**: Tips are charged to buyers via Stripe and stored in `orders.tip_amount`, but at payout time vendors are paid only `orderItem.vendor_payout_cents` (calculated from listing subtotal only). No code routes tip to vendor.
- **Impact**: Food truck vendors will never receive their tips. Money collected but not distributed.
- **Fix**: At payout time, add tip amount (prorated across items if multi-vendor) to the Stripe transfer amount.

### C2: Double-Payout Race in fulfill/route.ts
- **Location**: `vendor/orders/[id]/fulfill/route.ts` lines 166-193
- **Problem**: Does NOT check for existing `vendor_payouts` record before initiating Stripe transfer. Two simultaneous requests (double-click, network retry) can both see `vendor_confirmed_at = null`, both mark fulfilled, both call `transferToVendor`.
- **Impact**: Stripe idempotency key prevents duplicate transfers, but duplicate DB rows in `vendor_payouts` may be created.
- **Fix**: Add `vendor_payouts` existence check (matching pattern in `buyer/orders/[id]/confirm/route.ts`).

### C3: Double-Payout Race in confirm-handoff/route.ts
- **Location**: `vendor/orders/[id]/confirm-handoff/route.ts`
- **Problem**: Same as C2 — no payout existence check before `transferToVendor`.
- **Fix**: Same pattern — check `vendor_payouts` first.

### C4: Market Detail Page Missing Vertical Filter
- **Location**: `src/app/[vertical]/markets/[id]/page.tsx` line 32
- **Problem**: Query is `.eq('id', id)` without `.eq('vertical_id', vertical)`. Any market UUID is accessible from any vertical URL.
- **Impact**: Cross-vertical data leakage. A food truck user can see a farmers market page.
- **Fix**: Add `.eq('vertical_id', vertical)` to the market query.

### C5: Payout Enum Values Missing from DB (Known)
- **Location**: `vendor_payouts.status` enum
- **Problem**: `skipped_dev` and `pending_stripe_setup` are used in code but NOT in DB enum. Inserts will fail with constraint violation.
- **Impact**: Dev mode payouts and orders for vendors without Stripe setup will throw errors.
- **Fix**: Migration to add these values to `payout_status` enum (migration 035 may have addressed this — verify).

### C6: Module-Level Supabase Clients (Auth Context Leak Risk)
- **Location**: `/api/submit/route.ts` and `/api/vertical/[id]/route.ts`
- **Problem**: Both create Supabase clients at module import time (not per-request). In serverless warm instances, these clients persist across requests and can leak auth context between different users' requests.
- **Impact**: Potential security issue — one user's auth context could leak to another user's request.
- **Fix**: Refactor both to use per-request `createClient()` inside the handler, matching all other routes.

### C7: Vendor Analytics Using Legacy `transactions` Table (Potentially Broken)
- **Location**: 4 routes: `vendor/analytics/overview`, `top-products`, `customers`, `trends`
- **Problem**: All vendor analytics routes query the `transactions` table. The current order flow writes to `orders` + `order_items`. If `transactions` is a legacy table no longer populated by the order flow, all vendor analytics show stale or empty data.
- **Impact**: Vendor analytics dashboard could be completely broken — showing no data for new orders.
- **Fix**: Verify if `transactions` table is still being written to. If not, rewrite analytics queries to use `orders` + `order_items`.

---

## HIGH PRIORITY FINDINGS (Should Fix Before Launch)

### H1: Vendor Rejection Refunds Wrong Amount
- **Location**: `vendor/orders/[id]/reject/route.ts` line 110, 136
- **Problem**: Refunds `subtotal_cents` only, not buyer's actual paid amount (`subtotal * 1.065 + prorated_flat_fee`). Buyer loses their 6.5% buyer fee when vendor rejects.
- **Impact**: Buyers are shortchanged on vendor-initiated cancellations.
- **Fix**: Refund `buyerPaidForItem` (subtotal + buyer percentage fee + prorated flat fee).

### H2: External Checkout Skips Inventory Decrement
- **Location**: `api/checkout/external/route.ts`
- **Problem**: Creates orders and items but never calls `atomic_decrement_inventory`. Multiple buyers can create external payment orders for the same last unit.
- **Fix**: Call `atomic_decrement_inventory` after order creation, same as Stripe checkout path.

### H3: External Checkout Skips Cutoff Validation
- **Location**: `api/checkout/external/route.ts`
- **Problem**: Does not call `is_listing_accepting_orders` or validate cutoff time. Orders can be placed past cutoff.
- **Fix**: Add cutoff validation matching Stripe checkout path.

### H4: Vendor Notifications Fire on Every Success Page Hit
- **Location**: `api/checkout/success/route.ts` lines 303-354
- **Problem**: `sendNotification` calls are OUTSIDE the `if (!existingPayment)` idempotency block. Every GET to success page sends vendor notifications.
- **Fix**: Move notification calls inside the idempotency guard.

### H5: Market Box Webhook Uses Direct INSERT (No Capacity Check)
- **Location**: `stripe/webhooks.ts` `handleCheckoutComplete` lines 157-177
- **Problem**: Webhook path creates market box subscriptions via direct INSERT, not the `subscribe_to_market_box_if_capacity` RPC. Success page path uses the RPC correctly. Webhook can exceed capacity.
- **Fix**: Use `subscribe_to_market_box_if_capacity` RPC in webhook path too.

### H6: Flat Fee Not Deducted from Vendor Payout Per Item
- **Location**: `checkout/session/route.ts` lines 494-496
- **Problem**: `vendor_payout_cents` per order item = `subtotal - 6.5%` (no flat fee). The $0.15 flat fee is accounted at order level but not distributed to items. At payout time, vendor gets full percentage-only payout.
- **Impact**: Platform absorbs flat fee instead of deducting from vendor. Revenue leakage.
- **Fix**: Prorate flat fee across items in `vendor_payout_cents` calculation.

### H7: Listing Count Limits Not Enforced at API Level
- **Location**: `src/app/api/listings/route.ts` (and direct Supabase writes from ListingForm.tsx)
- **Problem**: `canCreateListing` is only checked in the new listing page (UI gate). Direct API calls or Supabase writes bypass tier limits.
- **Fix**: Enforce listing count in the API route or add a DB trigger/function.

### H8: `new_vendor_application` Notification Never Triggered
- **Location**: Defined in `notifications/types.ts` but never called via `sendNotification()`
- **Problem**: Admins receive no notification when a new vendor applies. They must manually check the admin panel.
- **Fix**: Call `sendNotification` with `new_vendor_application` in the vendor signup flow.

### H9: `market_approved` Bypasses Notification Service
- **Location**: `/api/markets/[id]/vendors/[vendorId]/route.ts` line 86
- **Problem**: Raw Supabase INSERT to notifications table instead of `sendNotification()`. Only creates in-app notification — no email, push, or SMS.
- **Fix**: Replace with `sendNotification(userId, 'market_approved', ...)`.

### H10: Test Components Page Accessible in Production
- **Location**: `src/app/test-components/page.tsx`
- **Problem**: Development test harness with fake data accessible at `/test-components`.
- **Fix**: Delete or add environment gate.

### H11: About Page Contact Form is Stub
- **Location**: `src/app/about/page.tsx` line 33
- **Problem**: Form logs to `console.log` and shows fake success. No API call.
- **Fix**: Wire to API or remove form.

### H12: Onboarding Status API Has No Vertical Filter (Multi-Vertical Bug)
- **Location**: `/api/vendor/onboarding/status/route.ts` lines 32-36
- **Problem**: Queries `vendor_profiles` with `.eq('user_id', user.id).single()` — no vertical_id filter. Multi-vertical vendors get wrong onboarding state. Same bug in documents, COI, category-documents, and acknowledge-prohibited-items API routes.
- **Impact**: Multi-vertical vendor's onboarding actions in one vertical could affect the other.
- **Fix**: Add `.eq('vertical_id', vertical)` to all onboarding API queries.

### H13: Stripe Connect Onboard API Has No Vertical Filter
- **Location**: `/api/vendor/stripe/onboard/route.ts` lines 26-33
- **Problem**: Same as H12 — queries vendor_profiles without vertical filter. Stripe account_id could save to wrong vendor profile.
- **Fix**: Add vertical filter.

### H14: canPublish Null Race Condition Allows Premature Publishing
- **Location**: `ListingForm.tsx`
- **Problem**: `canPublish` state initializes to `null`. Submit handler checks `!isPendingVendor && canPublish !== false`. While `canPublish` is still `null` (API not yet returned), this evaluates to `true`, allowing publish before gate check completes.
- **Fix**: Initialize `canPublish` to `false`, or block submit while loading.

### H15: Stripe Connect Not Part of Onboarding Gates
- **Problem**: 3-gate onboarding (`canPublishListings`) does not check `stripe_account_id`. A vendor can publish listings without Stripe setup, accept orders, but never receive payouts.
- **Fix**: Either add Stripe setup as Gate 4, or add prominent dashboard warning when listings are published without Stripe.

### H16: Subscription Downgrade — Stripe vs DB Out of Sync
- **Location**: `/api/vendor/tier/downgrade`, `/api/buyer/tier/downgrade`, `/api/vendor/subscription/downgrade-free`
- **Problem**: `cancel_at_period_end: true` means user keeps Stripe access until billing period ends, but DB tier is downgraded immediately. User loses paid features before their billing period expires.
- **Impact**: Users who paid for Pro/Boss lose features mid-period. Potential contractual/trust issue.
- **Fix**: Either (a) downgrade DB tier only when Stripe webhook fires `customer.subscription.deleted`, or (b) cancel Stripe immediately and refund prorated amount.

### H17: Admin Role Check Inconsistency in 7 Routes
- **Location**: `/api/admin/vendor-activity/settings` GET, `/api/admin/verticals` GET, `/api/markets` POST, `/api/markets/[id]` PATCH/DELETE, `/api/markets/[id]/schedules` POST, `/api/markets/[id]/schedules/[scheduleId]` PATCH/DELETE, `/api/markets/[id]/vendors/[vendorId]` PATCH
- **Problem**: Use inline `userProfile?.role === 'admin'` instead of centralized `hasAdminRole()`. Misses `platform_admin` role.
- **Fix**: Replace all with `hasAdminRole()` or `verifyAdminForApi()`.

### H18: `/api/submit` Route Has No Auth, No Rate Limit, No Error Tracing
- **Location**: `/api/submit/route.ts` (vendor onboarding form)
- **Problem**: No authentication check, no rate limiting, no `withErrorTracing`, AND uses module-level service client (C6). A public endpoint that writes to vendor_profiles with service role.
- **Impact**: Anyone can submit vendor applications without being logged in. No protection against spam/abuse.
- **Fix**: Add auth check, rate limiting (`rateLimits.submit`), and `withErrorTracing`.

### H19: Phase 4 Cron Marks No-Show Items Fulfilled Without Paying Vendor
- **Location**: `cron/expire-orders/route.ts` Phase 4
- **Problem**: Items with `status = 'ready'` past pickup date are marked `fulfilled` but no payout is created. Vendors who prepared food for no-show buyers are never paid.
- **Impact**: Vendor trust issue. They did the work but get nothing.
- **Fix**: Create payout at fulfillment time even for no-shows, or document as intentional business decision.

### H20: Phase 1 Cron Refunds Subtotal Only on Auto-Expiry
- **Location**: `cron/expire-orders/route.ts` Phase 1
- **Problem**: Same as H1 — expired items refund `subtotal_cents`, not buyer's full paid amount including fees.
- **Fix**: Refund full buyer-paid amount.

---

## MEDIUM PRIORITY FINDINGS

### M1: Admin Layout Redirects to `/login` Without Vertical
- **Location**: `src/app/[vertical]/admin/layout.tsx` line 15
- **Problem**: `redirect('/login')` loses vertical context. Should be `redirect(\`/${vertical}/login\`)`.

### M2: Admin Layout Uses Manual Role Check Instead of hasAdminRole()
- **Location**: `src/app/[vertical]/admin/layout.tsx` lines 25-26
- **Problem**: `role === 'admin'` string comparison instead of centralized `hasAdminRole()`. Misses `platform_admin` role.

### M3: Checkout Page Has Hardcoded Purple Colors
- **Location**: `checkout/page.tsx`
- **Problem**: ~20 hardcoded hex values including purple (#A78BFA) for cross-sell section. Not a brand color.

### M4: vendor/markets/page.tsx Has 152 Hardcoded Hex Values
- **Location**: `src/app/[vertical]/vendor/markets/page.tsx`
- **Problem**: Largest remaining file after color sweep. 152 hardcoded hex occurrences.

### M5: Vendor Dashboard Has 5 Sequential DB Queries
- **Location**: `vendor/dashboard/page.tsx`
- **Problem**: 5 sequential Supabase queries before page renders. Should be `Promise.all`.

### M6: `any` Type Usage in 41 Files
- **Problem**: Pervasive `as any` casting, especially in API routes with Supabase joins. Generated DB types would fix most.

### M7: No React Error Boundaries
- **Problem**: No component uses ErrorBoundary. Render throws crash entire page subtree silently.

### M8: Rate Limiter Per-Instance
- **Problem**: In-memory rate limiting resets on cold starts and doesn't protect across instances.

### M9: `canAddTraditionalMarket` Missing Vertical Parameter
- **Location**: `vendor-limits.ts` line 341
- **Problem**: `getTierLimits(tier)` without vertical — food truck vendors get FM limits.

### M10: `get_or_create_cart` Called with UUID vs TEXT Slug Inconsistently
- **Location**: `checkout/session/route.ts` (UUID) vs `cart/items/route.ts` (TEXT slug)
- **Problem**: If RPC only accepts one type, one path is broken.

### M11: Email Template Hardcoded `#166534` Fallback
- **Location**: `notifications/service.ts` lines 169, 200
- **Problem**: Dark green fallback not matching any vertical's actual primary color.

### M12: `can_vendor_publish()` DB Function Never Called
- **Problem**: Exists in schema but no application code calls it. Listing publication relies only on client-side validation + DB constraints.

### M13: Duplicate VENDOR_LIMITS in constants.ts vs vendor-limits.ts
- **Problem**: FM listing limits defined in two places. Must be kept in sync manually.

### M14: constants.ts TIER_BADGES Has Hardcoded Hex Values
- **Problem**: Badge colors not using `statusColors` from design tokens.

### M15: 15 Routes Missing Rate Limiting
- **Problem**: Including cart modification, checkout success, order state changes.

### M16: 3 Routes Missing withErrorTracing
- **Problem**: Including vendor confirm order (critical financial flow).

### M17: Schema Snapshot CHECK Constraint May Be Stale (FT Tiers)
- **Problem**: Schema snapshot shows `vendor_profiles_tier_check = ARRAY['standard', 'premium']`. If actual DB constraint wasn't updated by migrations 027/033, all FT vendor signups with `tier='free'` would fail.
- **Fix**: Verify actual DB constraint. If stale, refresh schema snapshot.

### M18: File Upload in Vendor Signup Is Dead-End
- **Problem**: Food truck signup shows file upload fields (food_handler_permit, health_dept_license) but only saves the filename as text. No actual file is uploaded.
- **Fix**: Either implement file upload to Supabase storage or remove the file fields and use a different document collection approach.

### M19: Image Upload Not Available on Listing Creation
- **Problem**: ListingForm shows "Save this listing first, then you can add photos by editing it." New vendors creating first listings miss images entirely.
- **Fix**: Allow image upload on create, or make the two-step process clearer with a redirect to edit after save.

### M20: Market Association Failure Silently Swallowed
- **Location**: `ListingForm.tsx` lines 303-308
- **Problem**: If `listing_markets` insert fails, listing saves without market assignments. Buyers can't see it. Vendor gets success UI.
- **Fix**: Show error to vendor if market association fails.

### M21: Vendors Can Access Markets Page Before Approval
- **Problem**: `vendor/markets/page.tsx` has no vendor status check. Unapproved vendors can create private pickup locations.
- **Fix**: Add status check or gate behind onboarding completion.

### M22: Market Boxes Card Shown to Free-Tier FT Vendors
- **Problem**: Dashboard always shows Market Boxes card. Free FT vendors (`totalMarketBoxes: 0`) can't use it.
- **Fix**: Conditionally render based on tier limits.

### M23: Analytics Gating for FT Tiers Not Implemented
- **Problem**: `FT_TIER_LIMITS.free.analyticsDays: 0` defined but analytics page access is uncontrolled. Steps 7-9 of FT tier system still pending.

### M24: N+1 Query Patterns in 5 API Routes
- **Locations**: `/api/market-boxes` GET, `/api/admin/feedback` GET, `/api/admin/order-issues` GET, `/api/vendor/markets/[id]/prep` GET, `/api/cart/validate` POST
- **Problem**: Sequential query rounds instead of JOINs. E.g., admin feedback fetches feedback, then separately queries user emails, then vendor names (3 rounds).
- **Fix**: Use JOINs or batch queries.

### M25: ZIP_LOOKUP Table Duplicated in 2 Files
- **Location**: `/api/vendor/markets/route.ts` and `/api/vendor/markets/[id]/route.ts`
- **Problem**: Identical geocoding lookup table defined verbatim in both files.
- **Fix**: Extract to shared utility.

### M26: Hardcoded Configurable Values in 6 Routes
- `CANCELLATION_FEE_PERCENT = 25` (buyer cancel), `CONFIRMATION_WINDOW_SECONDS = 30` (buyer confirm), `annualCapCents = 10000` (referrals), `SPIKE_THRESHOLD = 5` (error report), referral credit `1000` (submit), `alerts@farmersmarketing.app` (cron)
- **Fix**: Move to vertical config, env vars, or pricing.ts as appropriate.

### M27: Transfer Failure Revert Can Leave Item in Fulfilled State
- **Location**: `fulfill/route.ts` lines 196-208
- **Problem**: If Stripe transfer fails AND the DB revert fails, item stays as `fulfilled` with no payout and no retry path.

---

## LOW PRIORITY FINDINGS

### L1: 7 Files Use Raw `<img>` for Display Images (should be next/image)
### L2: 5 Accessibility Issues with Empty alt="" on Meaningful Images
### L3: 60+ console.log/error/warn Calls (some debug artifacts)
### L4: Legacy /api/cart/add Route Exists (dead code)
### L5: Order Number Collision Risk (5 random digits)
### L6: Vendor Confirm Route Doesn't Check Current Status
### L7: Failed Stripe Refunds Return Success to Client
### L8: CSP Includes unsafe-inline
### L9: Stripe API Version Is Preview/Beta (.clover suffix)
### L10: No Domain-Based Routing in Middleware
### L11: fire_works Vertical Has No Terminology Config
### L12: No Automated Test Suite
### L13: DateRangePicker Fallback Color Is Blue (Should Be FM Green)
### L14: ShopperFeedbackForm "Market Policies" Is FM-Specific Language
### L15: lucide-react Caret Versioning on Pre-1.0 Package

---

## END-TO-END WORKFLOW BLOCKERS

### Food Truck Order Flow (Primary Focus)
1. **Buyer browses** → works (vertical filtering correct)
2. **Buyer adds to cart** → works (cart creation, pickup time slots)
3. **Buyer checks out (Stripe)** → works EXCEPT: tips collected but never forwarded (C1)
4. **Buyer checks out (External)** → BROKEN: no inventory decrement (H2), no cutoff check (H3)
5. **Vendor receives notification** → works BUT duplicate notifications on success page refresh (H4)
6. **Vendor confirms order** → works (status transitions correct)
7. **Vendor marks ready** → works
8. **Vendor/buyer complete handoff** → works BUT double-payout race exists (C2, C3)
9. **Vendor receives payout** → works BUT flat fee not deducted (H6), tips not included (C1)
10. **Buyer cancels** → works BUT vendor rejection refunds wrong amount (H1)
11. **No-show buyer** → cron marks fulfilled but vendor never paid (H12)

### Vendor Onboarding Flow
1. **Vendor signs up** → works BUT file upload is dead-end (M18), no admin notification (H8)
2. **Three-gate onboarding** → works BUT status API has no vertical filter (H12), multi-vertical vendors get wrong state
3. **Admin reviews/approves** → works
4. **Vendor notified of approval** → works (but individual gate approvals don't notify)
5. **Stripe Connect setup** → works BUT not part of gates (H15), API has no vertical filter (H13)
6. **Vendor creates listings** → works BUT tier limits not API-enforced (H7), canPublish race condition (H14)
7. **Vendor publishes** → works (DB constraints enforce, but `can_vendor_publish()` not called)
8. **Image upload** → Only available in edit mode, not create (M19)

### Market Box / Chef Box Flow
1. **Vendor creates box** → works
2. **Buyer subscribes (Stripe)** → works via success page (capacity check)
3. **Buyer subscribes (webhook)** → POTENTIALLY OVER-CAPACITY: direct INSERT, no capacity check (H5)

---

## RECOMMENDED FIX PRIORITY ORDER

### Phase 1: Financial Safety (Before ANY Real Transactions)
1. C1 — Route tips to vendors at payout time
2. C2 + C3 — Add payout existence checks in fulfill + confirm-handoff
3. H1 + H20 — Fix refund amounts (full buyer-paid amount)
4. H6 — Deduct flat fee from vendor payout per item
5. H2 + H3 — External checkout: inventory decrement + cutoff validation
6. H16 — Fix subscription downgrade Stripe/DB timing mismatch

### Phase 2: Security & Data Integrity
7. C6 — Fix module-level Supabase clients (auth context leak)
8. C4 — Market detail page vertical filter
9. C5 — Payout enum migration (verify if 035 addressed)
10. H12 — Add vertical filter to ALL onboarding APIs
11. H13 — Add vertical filter to Stripe onboard API
12. H18 — Add auth/rate-limit/error-tracing to /api/submit
13. H17 — Standardize admin role checks to hasAdminRole()
14. H4 — Move notifications inside idempotency guard
15. H5 — Market box webhook capacity check
16. M10 — Standardize get_or_create_cart parameter type
17. M17 — Verify/fix tier CHECK constraint in DB

### Phase 3: Vendor Experience & Operational Readiness
18. C7 — Verify/fix vendor analytics (transactions table may be stale/empty)
19. H14 — Fix canPublish race condition (initialize to false)
20. H15 — Add Stripe setup warning/gate
21. H7 — API-level listing count enforcement
22. H8 — new_vendor_application notification
23. H9 — market_approved through notification service
24. H10 — Remove test-components page
25. H11 — Fix or remove about page contact form
26. H19 — Decide on no-show vendor payment policy
27. M19 — Improve listing image upload flow
28. M20 — Surface market association errors to vendor

### Phase 4: Quality & Polish
29. M1-M27 — Remaining medium priority fixes
30. L1-L15 — Low priority fixes

---

## OPPORTUNITIES FOR IMPROVEMENT

### Speed & Efficiency
- **Batch vendor dashboard queries** (M5) — 5→1 round trips
- **Use Promise.all** where sequential queries are independent
- **Add next/image** to remaining raw img tags for bandwidth savings

### Durability & Scalability
- **Add automated tests** (L12) — at minimum for checkout/payment flow
- **Switch to Redis rate limiting** when traffic warrants
- **Pin dependency versions** for production stability
- **Add React error boundaries** to prevent white-screen crashes

### Ease of Use
- **Domain-based routing** (L10) — remove `/farmers_market/` from URLs
- **Fix admin redirect** to preserve vertical context (M1)
- **30-second countdown timer** visible to vendor in pickup UI

### Cost Effectiveness
- **Fix flat fee collection** (H6) — platform currently absorbs $0.15/order
- **Fix tip routing** (C1) — vendor trust/retention issue
- **Proper refund amounts** (H1) — avoid buyer complaints/chargebacks
